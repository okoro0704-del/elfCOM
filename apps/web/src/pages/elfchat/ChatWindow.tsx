import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { initiateCall } from "@elfcom/webrtc";
import { ProfileSwitcher } from "@elfcom/ui";
import type { ProfileMode } from "@elfcom/core";
import { useAccountStore } from "../../store/accountStore";
import { useAuthStore } from "../../store/authStore";
import { useChatStore } from "../../store/chatStore";
import { useUiStore } from "../../store/uiStore";

function deliveryLabel(d: string) {
  if (d === "read") return "Read";
  if (d === "delivered") return "Delivered";
  return "Sent";
}

type Props = {
  threadId: string;
  onBack?: () => void;
};

/** ElfChat thread view with Personal/Business badge and WebRTC call actions. */
export function ChatWindow({ threadId, onBack }: Props) {
  const thread = useChatStore((s) => s.threads.find((t) => t.id === threadId));
  const messages = useChatStore((s) => s.messages[threadId] ?? []);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const context = useAccountStore((s) => s.context);
  const switchMode = useAccountStore((s) => s.switchMode);
  const needsSetup = useAccountStore((s) => s.needsSetup);
  const navigate = useNavigate();
  const setHideChrome = useUiStore((s) => s.setHideChrome);
  const trustId = useAuthStore((s) => s.session?.trustId);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setHideChrome(true);
    return () => setHideChrome(false);
  }, [setHideChrome]);

  useEffect(() => {
    if (trustId) useAccountStore.getState().hydrate(trustId);
  }, [trustId]);

  const peerMode = useMemo(() => {
    if (thread?.peer.handle.includes("hotel") || thread?.peer.email?.includes("hotel")) {
      return "BUSINESS" as const;
    }
    return "PERSONAL" as const;
  }, [thread]);

  if (!thread) return null;

  const back = () => {
    setActiveThread(null);
    onBack?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink safe-pt safe-pb">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <button type="button" className="shrink-0 text-sm text-accent" onClick={back}>
          Back
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{thread.peer.displayName}</p>
            <span
              className={[
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                peerMode === "BUSINESS" ? "bg-accent/20 text-accent" : "bg-ok/15 text-ok",
              ].join(" ")}
            >
              {peerMode === "BUSINESS" ? "Business" : "Personal"}
            </span>
          </div>
          <p className="truncate text-xs text-mist">
            {thread.peer.presence === "online" ? "Online" : thread.peer.handle}
            {thread.typing ? " · typing…" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="Voice call"
            aria-label="Voice call"
            className="rounded-xl border border-line px-2.5 py-2 text-mist hover:text-foam"
            onClick={() =>
              initiateCall(thread.peer.id, "AUDIO", { displayName: thread.peer.displayName })
            }
          >
            <PhoneIcon />
          </button>
          <button
            type="button"
            title="Video call"
            aria-label="Video call"
            className="rounded-xl border border-line px-2.5 py-2 text-mist hover:text-foam"
            onClick={() =>
              initiateCall(thread.peer.id, "VIDEO", { displayName: thread.peer.displayName })
            }
          >
            <VideoIcon />
          </button>
        </div>
      </header>

      {context ? (
        <div className="flex items-center justify-between gap-2 border-b border-line/60 px-3 py-2">
          <p className="text-[11px] text-mist">Sending as</p>
          <ProfileSwitcher
            activeMode={context.activeMode}
            personalLabel={context.personal.displayName}
            businessLabel={context.business.displayName}
            onSwitch={(mode: ProfileMode) => {
              switchMode(mode);
              if (needsSetup(mode)) navigate(`/setup/${mode.toLowerCase()}`);
            }}
          />
        </div>
      ) : null}

      <div className="app-scroll flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
            <div
              className={[
                "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                m.fromMe ? "rounded-br-md bg-accent text-ink" : "rounded-bl-md bg-panel text-foam",
              ].join(" ")}
            >
              <p>{m.body}</p>
              {m.fromMe ? (
                <p className="mt-1 text-right text-[10px] opacity-70">{deliveryLabel(m.delivery)}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(threadId, draft);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message"
          className="min-w-0 flex-1 rounded-2xl border border-line bg-panel px-4 py-3 outline-none"
        />
        <button type="submit" className="rounded-2xl bg-accent px-4 font-semibold text-ink">
          Send
        </button>
      </form>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3h3l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L21 14v3a2 2 0 0 1-2 2A14 14 0 0 1 5 7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="7" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="m15 10 5-2.5v9L15 14" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
