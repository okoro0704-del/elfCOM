import { useState } from "react";
import { useMailStore } from "../../store/mailStore";

export function MailComposer() {
  const setComposerOpen = useMailStore((s) => s.setComposerOpen);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink safe-pt safe-pb">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <button type="button" className="text-mist" onClick={() => setComposerOpen(false)}>
          Cancel
        </button>
        <h2 className="font-display font-semibold">Compose</h2>
        <button
          type="button"
          className="font-semibold text-accent"
          onClick={() => setComposerOpen(false)}
        >
          Send
        </button>
      </header>
      <div className="space-y-3 p-4">
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="To"
          className="w-full border-b border-line bg-transparent py-2 outline-none"
        />
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full border-b border-line bg-transparent py-2 outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          rows={12}
          className="w-full resize-none bg-transparent outline-none"
        />
        <p className="text-xs text-mist">Rich text + attachments wire to ElfMail transport next.</p>
      </div>
    </div>
  );
}
