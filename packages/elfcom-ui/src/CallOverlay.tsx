import { useEffect, useRef, useState } from "react";
import {
  acceptIncomingCall,
  endCall,
  subscribeCalls,
  type CallSession,
} from "@elfcom/webrtc";

/** Full-screen WebRTC call modal over chat / mail. */
export function CallOverlay() {
  const [session, setSession] = useState<CallSession | null>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => subscribeCalls(setSession), []);

  useEffect(() => {
    if (localRef.current) {
      localRef.current.srcObject = session?.localStream ?? null;
    }
    if (remoteRef.current) {
      remoteRef.current.srcObject = session?.remoteStream ?? null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject =
        session?.type === "AUDIO" ? (session.remoteStream ?? null) : null;
    }
  }, [session?.localStream, session?.remoteStream, session?.type]);

  if (!session) return null;

  const label = session.type === "VIDEO" ? "Video call" : "Voice call";
  const title = session.displayName || session.targetTid;
  const inboundRinging = session.direction === "inbound" && session.status === "ringing";
  const statusText =
    session.status === "ringing"
      ? inboundRinging
        ? "Incoming call…"
        : "Ringing…"
      : session.status === "connecting"
        ? "Connecting…"
        : session.status === "active"
          ? "Connected"
          : session.status === "failed"
            ? session.error ?? "Call failed"
            : "Ended";

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#0F172A]/95 text-foam backdrop-blur-md safe-pt safe-pb">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        {session.type === "VIDEO" ? (
          <div className="relative aspect-video w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-ink">
            <video
              ref={remoteRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
            <video
              ref={localRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-3 right-3 h-28 w-20 rounded-xl border border-line object-cover"
            />
          </div>
        ) : (
          <>
            <audio ref={remoteAudioRef} autoPlay />
            <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-accent/40 bg-panel text-3xl font-semibold text-accent ring-4 ring-accent/20">
              {title.replace(/^TD-/, "").slice(0, 2).toUpperCase()}
            </div>
          </>
        )}
        <div>
          <p className="text-xs uppercase tracking-wider text-mist">{label}</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2>
          <p className="mt-2 text-sm text-mist">{statusText}</p>
          {session.error && session.status !== "failed" ? (
            <p className="mt-1 text-xs text-accent">{session.error}</p>
          ) : null}
        </div>
      </div>
      <div className="flex justify-center gap-4 pb-8">
        {inboundRinging ? (
          <>
            <button
              type="button"
              onClick={() => acceptIncomingCall()}
              className="rounded-full bg-ok px-8 py-3 text-sm font-semibold text-ink"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => endCall()}
              className="rounded-full bg-danger px-8 py-3 text-sm font-semibold text-foam"
            >
              Decline
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => endCall()}
            className="rounded-full bg-danger px-8 py-3 text-sm font-semibold text-foam"
          >
            End
          </button>
        )}
      </div>
    </div>
  );
}
