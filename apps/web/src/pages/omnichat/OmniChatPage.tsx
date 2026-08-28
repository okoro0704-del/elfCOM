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

  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar title="OmniChat" subtitle="Unified social messaging hub" />

      <section className="px-4 py-3">
        <p className="mb-2 text-xs uppercase tracking-wider text-mist">Channels</p>
        <div className="grid grid-cols-2 gap-2">
          {platforms.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-line bg-panel px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{labels[p.platform]}</span>
                <span
                  className={[
                    "h-2 w-2 rounded-full",
                    p.connected ? "bg-ok" : "bg-danger",
                  ].join(" ")}
                  title={p.connected ? "Connected" : "Disconnected"}
                />
              </div>
              <p className="mt-1 truncate text-xs text-mist">{p.handle}</p>
            </div>
          ))}
        </div>
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
    </div>
  );
}
