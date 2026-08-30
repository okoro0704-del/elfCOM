import { CallSignalingClient, type RemoteCallEvent } from "./signaling.js";
import type {
  CallListener,
  CallSession,
  CallType,
  InitiateOptions,
  SignalingConfig,
} from "./types.js";

const DEFAULT_ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

const listeners = new Set<CallListener>();
let active: CallSession | null = null;
let pc: RTCPeerConnection | null = null;
let signaling: CallSignalingClient | null = null;
let signalingConfig: SignalingConfig | null = null;
let unsubRemote: (() => void) | null = null;
/** Offer may arrive before accept — buffer it. */
let pendingOffer: RTCSessionDescriptionInit | null = null;

function emit() {
  for (const l of listeners) l(active ? { ...active } : null);
}

function patch(partial: Partial<CallSession>) {
  if (!active) return;
  active = { ...active, ...partial };
  emit();
}

function stopTracks(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  });
}

function teardownMedia() {
  if (pc) {
    try {
      pc.close();
    } catch {
      /* ignore */
    }
  }
  pc = null;
  stopTracks(active?.localStream);
  stopTracks(active?.remoteStream);
  pendingOffer = null;
}

/**
 * Subscribe to call session changes (modal overlay, etc.).
 * Returns unsubscribe.
 */
export function subscribeCalls(listener: CallListener): () => void {
  listeners.add(listener);
  listener(active ? { ...active } : null);
  return () => listeners.delete(listener);
}

export function getActiveCall(): CallSession | null {
  return active ? { ...active } : null;
}

/**
 * Wire ElfCom node signaling (HTTP + `/v1/calls/ws`).
 * Call once after auth; pass null to disconnect.
 */
export function configureCallSignaling(config: SignalingConfig | null) {
  unsubRemote?.();
  unsubRemote = null;
  signaling?.disconnect();
  signaling = null;
  signalingConfig = config;

  if (!config?.baseUrl.trim() || !config.selfTid) return;

  const client = new CallSignalingClient(config);
  signaling = client;
  unsubRemote = client.onEvent(handleRemoteEvent);
  client.connect();
}

function handleRemoteEvent(ev: RemoteCallEvent) {
  if (ev.typ === "call.invite") {
    if (active) return;
    active = {
      id: ev.callId,
      targetTid: ev.fromTid,
      type: ev.callType,
      status: "ringing",
      startedAt: ev.ts,
      direction: "inbound",
    };
    emit();
    return;
  }

  if (!active || active.id !== ("callId" in ev ? ev.callId : "")) return;

  if (ev.typ === "call.accepted") {
    patch({ status: "connecting" });
    return;
  }

  if (ev.typ === "call.ended") {
    teardownMedia();
    patch({ status: "ended", localStream: null, remoteStream: null });
    const id = active.id;
    setTimeout(() => {
      if (active?.id === id) {
        active = null;
        emit();
      }
    }, 400);
    return;
  }

  if (ev.typ === "call.signal") {
    void applyRemoteSignal(ev.kind, ev.payload);
  }
}

async function ensurePeer(type: CallType): Promise<RTCPeerConnection> {
  if (pc) return pc;
  const iceServers = signalingConfig?.iceServers ?? DEFAULT_ICE;
  const conn = new RTCPeerConnection({ iceServers });
  pc = conn;

  const remote = new MediaStream();
  patch({ remoteStream: remote });

  conn.ontrack = (e) => {
    for (const track of e.streams[0]?.getTracks() ?? [e.track]) {
      remote.addTrack(track);
    }
    patch({ remoteStream: remote, status: "active" });
  };

  conn.onicecandidate = (e) => {
    if (!e.candidate || !active || !signaling) return;
    void signaling.sendSignal(active.id, "ice", e.candidate.toJSON()).catch(() => undefined);
  };

  conn.onconnectionstatechange = () => {
    if (conn.connectionState === "connected") patch({ status: "active" });
    if (conn.connectionState === "failed") {
      endCall("Peer connection failed");
    }
  };

  const local = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: type === "VIDEO",
  });
  for (const track of local.getTracks()) {
    conn.addTrack(track, local);
  }
  patch({ localStream: local });

  return conn;
}

async function applyRemoteSignal(kind: string, payload: unknown) {
  if (!active) return;

  if (kind === "hangup") {
    endCall();
    return;
  }

  if (kind === "offer") {
    pendingOffer = payload as RTCSessionDescriptionInit;
    if (active.direction === "inbound" && active.status === "connecting") {
      await answerWithPendingOffer();
    }
    return;
  }

  if (kind === "answer") {
    if (!pc) return;
    await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
    patch({ status: "active" });
    return;
  }

  if (kind === "ice") {
    if (!pc) return;
    try {
      await pc.addIceCandidate(payload as RTCIceCandidateInit);
    } catch {
      /* ignore late / mismatched */
    }
  }
}

async function answerWithPendingOffer() {
  if (!active || !pendingOffer || !signaling) return;
  const conn = await ensurePeer(active.type);
  await conn.setRemoteDescription(pendingOffer);
  pendingOffer = null;
  const answer = await conn.createAnswer();
  await conn.setLocalDescription(answer);
  await signaling.sendSignal(active.id, "answer", answer);
  patch({ status: "connecting" });
}

/**
 * Launch a WebRTC call modal over any active chat or mail screen.
 * Uses ElfCom signaling when configured; otherwise local UI-only fallback.
 */
export function initiateCall(
  targetTid: string,
  type: CallType,
  opts?: InitiateOptions,
): CallSession {
  const tid = targetTid.trim();
  if (!tid) throw new Error("targetTid is required");
  if (active) throw new Error("call already in progress");

  if (!signaling || !signalingConfig) {
    return initiateLocalFallback(tid, type, opts);
  }

  active = {
    id: `pending_${Date.now()}`,
    targetTid: tid,
    type,
    status: "ringing",
    startedAt: new Date().toISOString(),
    displayName: opts?.displayName,
    direction: "outbound",
  };
  emit();

  void (async () => {
    try {
      const created = await signaling!.createCall(tid, type);
      patch({ id: created.id, status: "connecting" });
      const conn = await ensurePeer(type);
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      await signaling!.sendSignal(created.id, "offer", offer);
    } catch (err) {
      teardownMedia();
      patch({
        status: "failed",
        error: err instanceof Error ? err.message : "Call failed",
        localStream: null,
        remoteStream: null,
      });
      const id = active?.id;
      setTimeout(() => {
        if (active?.id === id) {
          active = null;
          emit();
        }
      }, 1200);
    }
  })();

  return getActiveCall()!;
}

function initiateLocalFallback(
  tid: string,
  type: CallType,
  opts?: InitiateOptions,
): CallSession {
  active = {
    id: `local_${Date.now()}`,
    targetTid: tid,
    type,
    status: "ringing",
    startedAt: new Date().toISOString(),
    displayName: opts?.displayName,
    direction: "outbound",
    error: "Signaling offline — local preview only",
  };
  emit();

  void (async () => {
    try {
      patch({ status: "connecting" });
      await ensurePeer(type);
      // Loopback: mirror local into remote for preview when no peer.
      const local = active?.localStream;
      if (local) {
        const mirror = new MediaStream(local.getTracks());
        patch({ remoteStream: mirror, status: "active" });
      } else {
        patch({ status: "active" });
      }
    } catch (err) {
      teardownMedia();
      patch({
        status: "failed",
        error: err instanceof Error ? err.message : "Microphone / camera blocked",
        localStream: null,
        remoteStream: null,
      });
    }
  })();

  return getActiveCall()!;
}

export function endCall(reason?: string) {
  const callId = active?.id;
  const useRemote = Boolean(signaling && callId && !callId.startsWith("local_"));
  if (useRemote && callId && !callId.startsWith("pending_")) {
    void signaling!.hangup(callId).catch(() => undefined);
  }
  teardownMedia();
  if (!active) return;
  active = {
    ...active,
    status: reason ? "failed" : "ended",
    error: reason,
    localStream: null,
    remoteStream: null,
  };
  emit();
  const snapshot = active;
  setTimeout(() => {
    if (active?.id === snapshot.id) {
      active = null;
      emit();
    }
  }, 400);
}

export function acceptIncomingCall() {
  if (!active || active.status !== "ringing" || active.direction !== "inbound") return;
  if (!signaling) {
    patch({ status: "failed", error: "Signaling not configured" });
    return;
  }

  const callId = active.id;
  patch({ status: "connecting" });

  void (async () => {
    try {
      await signaling!.acceptCall(callId);
      await ensurePeer(active!.type);
      if (pendingOffer) await answerWithPendingOffer();
    } catch (err) {
      teardownMedia();
      patch({
        status: "failed",
        error: err instanceof Error ? err.message : "Accept failed",
        localStream: null,
        remoteStream: null,
      });
    }
  })();
}
