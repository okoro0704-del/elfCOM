import { useState, type FormEvent } from "react";
import { useMailStore } from "../../store/mailStore";

export function MailComposer() {
  const setComposerOpen = useMailStore((s) => s.setComposerOpen);
  const sendMail = useMailStore((s) => s.sendMail);
  const accounts = useMailStore((s) => s.accounts);
  const activeAccountId = useMailStore((s) => s.activeAccountId);
  const from = accounts.find((a) => a.id === activeAccountId)?.address ?? accounts[0]?.address;

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSend = (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    try {
      sendMail({ to, subject, body });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink safe-pt safe-pb">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <button type="button" className="text-mist" onClick={() => setComposerOpen(false)}>
          Cancel
        </button>
        <h2 className="font-display font-semibold">New message</h2>
        <button type="button" className="font-semibold text-accent" onClick={() => onSend()}>
          Send
        </button>
      </header>
      <form className="flex flex-1 flex-col space-y-0 p-4" onSubmit={onSend}>
        {from ? (
          <p className="border-b border-line py-2 text-xs text-mist">From {from}</p>
        ) : null}
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="To"
          autoFocus
          className="w-full border-b border-line bg-transparent py-3 outline-none"
        />
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full border-b border-line bg-transparent py-3 outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Compose email"
          className="min-h-0 w-full flex-1 resize-none bg-transparent py-3 outline-none"
        />
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
