import { useChatStore } from "../store/chatStore";

/** Subtle ElfCom realtime connection indicator. */
export function ChatConnectionStatus() {
  const status = useChatStore((s) => s.connectionStatus);
  const inboxError = useChatStore((s) => s.inboxError);

  const label =
    status === "online"
      ? "Online"
      : status === "connecting"
        ? "Connecting"
        : status === "reconnecting"
          ? "Reconnecting"
          : status === "offline"
            ? "Offline"
            : null;

  if (!label && !inboxError) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-line/50 px-3 py-1.5 text-[11px] text-mist">
      <span className="flex items-center gap-1.5">
        <span
          className={[
            "h-1.5 w-1.5 rounded-full",
            status === "online"
              ? "bg-ok"
              : status === "connecting" || status === "reconnecting"
                ? "bg-accent"
                : "bg-mist/60",
          ].join(" ")}
        />
        {label ?? "ElfCom"}
      </span>
      {inboxError ? (
        <span className="truncate text-danger" title={inboxError}>
          {inboxError.slice(0, 64)}
        </span>
      ) : null}
    </div>
  );
}
