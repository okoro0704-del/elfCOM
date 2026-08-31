import { useState, type FormEvent } from "react";
import { TopAppBar } from "../../components/TopAppBar";
import { useOmniStore, type SocialPlatform } from "../../store/omniStore";

const labels: Record<SocialPlatform, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
};

export function OmniChatPage() {
  const platforms = useOmniStore((s) => s.platforms);
  const filter = useOmniStore((s) => s.omniChatFilter);
  const setFilter = useOmniStore((s) => s.setOmniChatFilter);
  const items = useOmniStore((s) => s.visibleOmniChat());
  const connectPlatform = useOmniStore((s) => s.connectPlatform);
  const disconnectPlatform = useOmniStore((s) => s.disconnectPlatform);

  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<SocialPlatform>("whatsapp");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      connectPlatform(platform, handle);
      setHandle("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect");
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar
        title="OmniChat"
        subtitle="Unified social messaging hub"
        right={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-ink"
          >
            Add channel
          </button>
        }
      />

      <section className="px-4 py-3">
        <p className="mb-2 text-xs uppercase tracking-wider text-mist">Channels</p>
        {platforms.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-mist">
            No channels yet. Create an OmniChat channel to pull WhatsApp, Instagram, Messenger, or
            Telegram into ElfCom.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {platforms.map((p) => (
              <div key={p.id} className="rounded-2xl border border-line bg-panel px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{labels[p.platform]}</span>
                  <span
                    className={[
                      "h-2 w-2 rounded-full",
                      p.connected ? "bg-ok" : "bg-danger",
                    ].join(" ")}
                  />
                </div>
                <p className="mt-1 truncate text-xs text-mist">{p.handle}</p>
                <button
                  type="button"
                  className="mt-2 text-[11px] text-mist underline"
                  onClick={() => disconnectPlatform(p.id)}
                >
                  {p.connected ? "Disconnect" : "Disconnected"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex gap-2 overflow-x-auto px-4 pb-2">
        {(["all", "whatsapp", "instagram", "messenger", "telegram"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={[
              "shrink-0 rounded-full px-3 py-1.5 text-xs capitalize",
              filter === f ? "bg-accent text-ink" : "bg-panel text-mist",
            ].join(" ")}
          >
            {f === "all" ? "All" : labels[f]}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-mist">
          No OmniChat conversations yet. Messages appear here after a channel is connected and
          receiving traffic.
        </p>
      ) : (
        <ul className="divide-y divide-line/60 px-2 pb-6">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-3.5">
              <span className="rounded-xl bg-panel-2 px-2 py-1 text-[10px] uppercase tracking-wide text-accent">
                {labels[item.platform].slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-2">
                  <span className="truncate font-medium">{item.peer}</span>
                  {item.unread > 0 ? (
                    <span className="rounded-full bg-accent px-2 text-[10px] font-bold text-ink">
                      {item.unread}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-sm text-mist">{item.preview}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/55 sm:items-center sm:justify-center sm:p-4">
          <form
            onSubmit={onCreate}
            className="w-full max-w-md rounded-t-3xl border border-line bg-ink-soft p-5 safe-pb sm:rounded-3xl"
          >
            <h2 className="font-display text-lg font-semibold">Create OmniChat channel</h2>
            <label className="mt-4 block text-xs text-mist">
              Platform
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
                className="mt-1.5 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foam"
              >
                {(Object.keys(labels) as SocialPlatform[]).map((p) => (
                  <option key={p} value={p}>
                    {labels[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs text-mist">
              Handle / phone / bot
              <input
                required
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foam"
                placeholder="+1555… · @brand"
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
