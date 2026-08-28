import { useState } from "react";
import { useChatStore } from "../../store/chatStore";

function deliveryLabel(d: string) {
  if (d === "read") return "Read";
  if (d === "delivered") return "Delivered";
  return "Sent";
}

export function ChatDrawer({ threadId }: { threadId: string }) {
  const thread = useChatStore((s) => s.threads.find((t) => t.id === threadId));
  const messages = useChatStore((s) => s.messages[threadId] ?? []);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [draft, setDraft] = useState("");

  if (!thread) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink safe-pt safe-pb">
      <header className="flex items-center gap-3 border-b border-line px-3 py-3">
        <button type="button" className="text-accent" onClick={() => setActiveThread(null)}>
          Back
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{thread.peer.displayName}</p>
          <p className="truncate text-xs text-mist">
            {thread.peer.presence === "online" ? "Online" : thread.peer.handle}
            {thread.typing ? " · typing…" : ""}
          </p>
        </div>
      </header>

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
