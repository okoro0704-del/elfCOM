import type { DirectoryUserCard } from "@elfcom/core";
import { initiateCall } from "@elfcom/webrtc";

type Props = {
  user: DirectoryUserCard;
  onStartChat: (targetTid: string) => void;
  onSendMail: (targetTid: string, addressHint?: string) => void;
};

export function UserDiscoveryCard({ user, onStartChat, onSendMail }: Props) {
  return (
    <article className="rounded-2xl border border-line bg-panel px-3 py-3">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-panel-2 text-sm font-semibold text-accent">
          {user.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium text-foam">{user.displayName}</h3>
            <span
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                user.mode === "BUSINESS" ? "bg-accent/20 text-accent" : "bg-ok/15 text-ok",
              ].join(" ")}
            >
              {user.mode === "BUSINESS" ? "Business" : "Personal"}
            </span>
          </div>
          <p className="truncate text-xs text-mist">
            {user.tidHandle.startsWith("$") ? user.tidHandle : `$${user.tidHandle}`} · {user.trustId}
          </p>
          {user.bio ? <p className="mt-1 line-clamp-2 text-sm text-mist">{user.bio}</p> : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          className="rounded-xl bg-accent px-2 py-2 text-[11px] font-semibold text-ink"
          onClick={() => onStartChat(user.actions.startChat.targetTid)}
        >
          Start Chat
        </button>
        <button
          type="button"
          className="rounded-xl border border-line px-2 py-2 text-[11px] font-medium text-foam"
          onClick={() =>
            onSendMail(user.actions.sendMail.targetTid, user.actions.sendMail.addressHint)
          }
        >
          Send Mail
        </button>
        <button
          type="button"
          className="rounded-xl border border-line px-2 py-2 text-[11px] font-medium text-foam"
          onClick={() => initiateCall(user.actions.call.targetTid, "AUDIO", { displayName: user.displayName })}
        >
          Call
        </button>
      </div>
    </article>
  );
}
