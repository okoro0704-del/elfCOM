import type { CallListener, CallSession, CallType, InitiateOptions } from "./types.js";

const listeners = new Set<CallListener>();
let active: CallSession | null = null;
let ringTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const l of listeners) l(active ? { ...active } : null);
}

function clearRing() {
  if (ringTimer) {
    clearTimeout(ringTimer);
    ringTimer = null;
  }
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
 * Launch a WebRTC call modal over any active chat or mail screen.
 * Signaling stub advances ringing → connecting → active for UI wiring;
 * replace with real peer-connection + signaling channel in production.
 */
export function initiateCall(
  targetTid: string,
  type: CallType,
  _opts?: InitiateOptions,
): CallSession {
  const tid = targetTid.trim();
  if (!tid) throw new Error("targetTid is required");

  clearRing();
  active = {
    id: `call_${Date.now()}`,
    targetTid: tid,
    type,
    status: "ringing",
    startedAt: new Date().toISOString(),
  };
  emit();

  ringTimer = setTimeout(() => {
    if (!active || active.status !== "ringing") return;
    active = { ...active, status: "connecting" };
    emit();
    ringTimer = setTimeout(() => {
      if (!active || active.status !== "connecting") return;
      active = { ...active, status: "active" };
      emit();
    }, 800);
  }, 1200);

  return getActiveCall()!;
}

export function endCall(reason?: string) {
  clearRing();
  if (!active) return;
  active = {
    ...active,
    status: reason ? "failed" : "ended",
    error: reason,
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
  if (!active || active.status !== "ringing") return;
  clearRing();
  active = { ...active, status: "active" };
  emit();
}
