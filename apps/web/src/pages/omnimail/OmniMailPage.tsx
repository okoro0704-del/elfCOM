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

  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar title="OmniMail" subtitle="External inbox aggregator" />

      <section className="space-y-2 px-4 py-3">
        {mailboxes.map((mb) => (
          <div
            key={mb.id}
            className="flex items-center justify-between rounded-2xl border border-line bg-panel px-3 py-2.5"
          >
            <div>
              <p className="text-sm font-medium">
                {providerLabel[mb.provider]} · {mb.address}
              </p>
              <p className="text-xs text-mist">
                {!mb.connected
                  ? "Not connected"
                  : mb.syncing
                    ? "Syncing…"
                    : "Up to date"}
              </p>
            </div>
            <span
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                mb.connected ? "bg-ok/20 text-ok" : "bg-danger/20 text-danger",
              ].join(" ")}
            >
              {mb.connected ? "Live" : "Off"}
            </span>
          </div>
        ))}
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
    </div>
  );
}
