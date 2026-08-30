import { useEffect, useState } from "react";
import { endCall, subscribeCalls, type CallSession } from "@elfcom/webrtc";

/** Full-screen WebRTC call modal over chat / mail. */
export function CallOverlay() {
  const [session, setSession] = useState<CallSession | null>(null);

  useEffect(() => subscribeCalls(setSession), []);

  if (!session) return null;

  const label = session.type === "VIDEO" ? "Video call" : "Voice call";
  const statusText =
    session.status === "ringing"
      ? "Ringing…"
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
        <div
          className={[
            "flex h-28 w-28 items-center justify-center rounded-full border-2 border-accent/40 bg-panel text-3xl font-semibold text-accent",
            session.type === "VIDEO" ? "ring-4 ring-accent/20" : "",
          ].join(" ")}
        >
          {session.targetTid.replace(/^TD-/, "").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-mist">{label}</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">{session.targetTid}</h2>
          <p className="mt-2 text-sm text-mist">{statusText}</p>
        </div>
        {session.type === "VIDEO" ? (
          <div className="mt-4 aspect-video w-full max-w-md overflow-hidden rounded-2xl border border-line bg-ink">
            <div className="flex h-full items-center justify-center text-sm text-mist">
              Local / remote video surface
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex justify-center gap-4 pb-8">
        <button
          type="button"
          onClick={() => endCall()}
          className="rounded-full bg-danger px-8 py-3 text-sm font-semibold text-foam"
        >
          End
        </button>
      </div>
    </div>
  );
}
