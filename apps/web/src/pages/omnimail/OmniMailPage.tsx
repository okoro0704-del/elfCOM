import { useState, type FormEvent } from "react";
import { TopAppBar } from "../../components/TopAppBar";
import { useOmniStore, type MailProvider } from "../../store/omniStore";

const providerLabel: Record<MailProvider, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  imap: "IMAP",
};

export function OmniMailPage() {
  const mailboxes = useOmniStore((s) => s.mailboxes);
  const filter = useOmniStore((s) => s.omniMailFilter);
  const setFilter = useOmniStore((s) => s.setOmniMailFilter);
  const items = useOmniStore((s) => s.visibleOmniMail());
  const connectMailbox = useOmniStore((s) => s.connectMailbox);
  const disconnectMailbox = useOmniStore((s) => s.disconnectMailbox);

  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<MailProvider>("gmail");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      connectMailbox(provider, address);
      setAddress("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect");
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar
        title="OmniMail"
        subtitle="External inbox aggregator"
        right={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-ink"
          >
            Add mailbox
          </button>
        }
      />

      <section className="space-y-2 px-4 py-3">
        {mailboxes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-mist">
            No external mailboxes yet. Connect Gmail, Outlook, or IMAP to aggregate mail beside
            ElfMail.
          </p>
        ) : (
          mailboxes.map((mb) => (
            <div
              key={mb.id}
              className="flex items-center justify-between rounded-2xl border border-line bg-panel px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium">
                  {providerLabel[mb.provider]} · {mb.address}
                </p>
                <p className="text-xs text-mist">
                  {!mb.connected ? "Not connected" : mb.syncing ? "Syncing…" : "Connected"}
                </p>
              </div>
              <button
                type="button"
                className="text-[11px] text-mist underline"
                onClick={() => disconnectMailbox(mb.id)}
              >
                {mb.connected ? "Disconnect" : "Off"}
              </button>
            </div>
          ))
        )}
      </section>

      <div className="flex gap-2 overflow-x-auto px-4 pb-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={[
            "shrink-0 rounded-full px-3 py-1.5 text-xs",
            filter === "all" ? "bg-accent text-ink" : "bg-panel text-mist",
          ].join(" ")}
        >
          All accounts
        </button>
        {mailboxes
          .filter((m) => m.connected)
          .map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setFilter(m.id)}
              className={[
                "shrink-0 rounded-full px-3 py-1.5 text-xs",
                filter === m.id ? "bg-accent text-ink" : "bg-panel text-mist",
              ].join(" ")}
            >
              {providerLabel[m.provider]}
            </button>
          ))}
      </div>

      {items.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-mist">
          No OmniMail messages yet. Connected mailboxes will list here once sync is live.
        </p>
      ) : (
        <ul className="divide-y divide-line/60 px-2 pb-6">
          {items.map((item) => {
            const mb = mailboxes.find((m) => m.id === item.mailboxId);
            return (
              <li key={item.id} className="px-3 py-3.5">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-md bg-panel-2 px-1.5 py-0.5 text-[10px] uppercase text-accent">
                    {mb ? providerLabel[mb.provider] : "mail"}
                  </span>
                  {item.unread ? (
                    <span className="text-[10px] font-semibold text-accent">Unread</span>
                  ) : null}
                </div>
                <p className="truncate text-sm text-mist">{item.from}</p>
                <p className="truncate font-medium">{item.subject}</p>
                <p className="truncate text-sm text-mist">{item.preview}</p>
              </li>
            );
          })}
        </ul>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/55 sm:items-center sm:justify-center sm:p-4">
          <form
            onSubmit={onCreate}
            className="w-full max-w-md rounded-t-3xl border border-line bg-ink-soft p-5 safe-pb sm:rounded-3xl"
          >
            <h2 className="font-display text-lg font-semibold">Connect OmniMail</h2>
            <label className="mt-4 block text-xs text-mist">
              Provider
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as MailProvider)}
                className="mt-1.5 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foam"
              >
                {(Object.keys(providerLabel) as MailProvider[]).map((p) => (
                  <option key={p} value={p}>
                    {providerLabel[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs text-mist">
              Email address
              <input
                required
                type="email"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foam"
                placeholder="you@gmail.com"
              />
            </label>
            {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-2xl border border-line py-3 text-sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 rounded-2xl bg-accent py-3 text-sm font-semibold text-ink"
              >
                Connect
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
