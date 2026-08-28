import { useState } from "react";
import type { ElfComChannel } from "../lib/types";

type Props = {
  channel?: ElfComChannel;
  disabled?: boolean;
  sending?: boolean;
  onSend: (body: string) => Promise<void>;
};

export function Composer({ channel, disabled, sending, onSend }: Props) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        const body = text.trim();
        if (!body) return;
        setErr(null);
        void onSend(body)
          .then(() => setText(""))
          .catch((ex: unknown) => setErr(ex instanceof Error ? ex.message : "Send failed"));
      }}
    >
      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            channel
              ? `Reply via ${channel}…`
              : "Select a thread to reply across channels…"
          }
          disabled={disabled || sending}
          rows={2}
        />
        {err ? <p className="err">{err}</p> : null}
      </div>
      <button className="btn btn-primary" type="submit" disabled={disabled || sending || !text.trim()}>
        {sending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
