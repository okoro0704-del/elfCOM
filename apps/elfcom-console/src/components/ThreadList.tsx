import type { OpenedThread } from "../lib/types";

type Props = {
  threads: OpenedThread[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
};

export function ThreadList({ threads, selectedId, loading, onSelect, onRefresh }: Props) {
  return (
    <section className="thread-list">
      <div className="list-head">
        <h2>Unified inbox {loading ? "…" : ""}</h2>
        <button type="button" className="btn" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <div className="list-scroll">
        {threads.length === 0 ? (
          <div className="empty">No sealed threads yet. Send a webhook or wait for ingress.</div>
        ) : (
          threads.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`thread-item${selectedId === t.id ? " active" : ""}`}
              onClick={() => onSelect(t.id)}
            >
              <div className="row">
                <span className="title">{t.title}</span>
                {t.unreadCount > 0 ? <span className="badge">{t.unreadCount}</span> : null}
              </div>
              <div className="row">
                <span className="preview">{t.preview || "—"}</span>
                <span className="meta">{t.channel ?? "dm"}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
