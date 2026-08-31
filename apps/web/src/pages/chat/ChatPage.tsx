import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TopAppBar } from "../../components/TopAppBar";
import { useAuthStore } from "../../store/authStore";
import { useAccountStore } from "../../store/accountStore";
import { useChatStore } from "../../store/chatStore";
import { useUiStore } from "../../store/uiStore";
import { ProfileSwitcher } from "@elfcom/ui";
import type { ProfileMode } from "@elfcom/core";
import { UserLookupModal } from "./UserLookupModal";
import { ChatWindow } from "../elfchat/ChatWindow";

function presenceDot(presence: string) {
  if (presence === "online") return "bg-ok";
  if (presence === "away") return "bg-accent";
  return "bg-mist/50";
}

export function ChatPage() {
  const threads = useChatStore((s) => s.threads);
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const lookupOpen = useChatStore((s) => s.lookupOpen);
  const setLookupOpen = useChatStore((s) => s.setLookupOpen);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const setHideChrome = useUiStore((s) => s.setHideChrome);
  const trustId = useAuthStore((s) => s.session?.trustId);
  const context = useAccountStore((s) => s.context);
  const switchMode = useAccountStore((s) => s.switchMode);
  const needsSetup = useAccountStore((s) => s.needsSetup);
  const navigate = useNavigate();

  useEffect(() => {
    setHideChrome(Boolean(activeThreadId));
    return () => setHideChrome(false);
  }, [activeThreadId, setHideChrome]);

  useEffect(() => {
    if (trustId) useAccountStore.getState().hydrate(trustId);
  }, [trustId]);

  const onSwitchMode = (mode: ProfileMode) => {
    switchMode(mode);
    if (needsSetup(mode)) navigate(`/setup/${mode.toLowerCase()}`);
  };

  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar
        title="ElfChat"
        subtitle="P2P · directory · WebRTC"
        left={
          context ? (
            <ProfileSwitcher activeMode={context.activeMode} onSwitch={onSwitchMode} />
          ) : undefined
        }
        right={
          <button
            type="button"
            onClick={() => setLookupOpen(true)}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-ink"
          >
            New
          </button>
        }
      />

      {threads.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
          <p className="font-display text-lg font-semibold">No conversations yet</p>
          <p className="text-sm text-mist">
            Find someone by $TID handle or name, then start an ElfChat thread.
          </p>
          <button
            type="button"
            onClick={() => setLookupOpen(true)}
            className="rounded-2xl bg-accent px-5 py-2.5 text-sm font-semibold text-ink"
          >
            Find people
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-line/60 px-2 pb-4">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setActiveThread(t.id)}
                className="flex w-full items-center gap-3 px-3 py-3.5 text-left active:bg-panel/80"
              >
                <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-panel-2 font-semibold text-accent">
                  {t.peer.displayName.slice(0, 1).toUpperCase()}
                  <span
                    className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-ink ${presenceDot(t.peer.presence)}`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{t.peer.displayName}</span>
                    <span className="shrink-0 text-[10px] text-mist">
                      {new Date(t.updatedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-mist">
                    {t.typing ? <em className="text-accent">typing…</em> : t.preview}
                  </span>
                </span>
                {t.unread > 0 ? (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-ink">
                    {t.unread}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {lookupOpen ? <UserLookupModal /> : null}
      {activeThreadId ? <ChatWindow threadId={activeThreadId} /> : null}
    </div>
  );
}
