import type { OpenedMessage, OpenedThread } from "../lib/types";
import { Composer } from "./Composer";

type Props = {
  thread: OpenedThread | null;
  messages: OpenedMessage[];
  sending: boolean;
  error: string | null;
  onSend: (body: string) => Promise<void>;
};

export function ThreadPane({ thread, messages, sending, error, onSend }: Props) {
  if (!thread) {
    return (
      <section className="thread-pane">
        <div className="empty">Select a conversation to open sealed messages in RAM.</div>
      </section>
    );
  }

  return (
    <section className="thread-pane">
      <header className="pane-head">
        <h2>{thread.title}</h2>
        <p>
          {thread.channel ?? "dm"} · {thread.peerRef ?? thread.id}
        </p>
      </header>
      <div className="messages">
        {messages.map((m) => (
          <article
            key={m.id}
            className={`bubble${m.direction === "outbound" ? " outbound" : ""}`}
          >
            <div className="who">
              {m.direction === "outbound" ? "you" : m.senderId} ·{" "}
              {new Date(m.createdAt).toLocaleString()}
            </div>
            <div className="body">{m.body}</div>
          </article>
        ))}
        {error ? <p className="err">{error}</p> : null}
      </div>
      <Composer channel={thread.channel} sending={sending} onSend={onSend} />
    </section>
  );
}
