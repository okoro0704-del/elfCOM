import { useMailStore, type MailFolder } from "../../store/mailStore";

const folders: MailFolder[] = ["inbox", "sent", "drafts", "archive", "spam"];

export function FolderDrawer() {
  const folder = useMailStore((s) => s.folder);
  const setFolder = useMailStore((s) => s.setFolder);
  const setFolderDrawerOpen = useMailStore((s) => s.setFolderDrawerOpen);

  return (
    <div className="fixed inset-0 z-50 bg-black/55" onClick={() => setFolderDrawerOpen(false)}>
      <aside
        className="h-full w-[78%] max-w-xs border-r border-line bg-ink-soft p-4 safe-pt safe-pb"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-display text-lg font-semibold">Folders</h2>
        <ul className="space-y-1">
          {folders.map((f) => (
            <li key={f}>
              <button
                type="button"
                onClick={() => setFolder(f)}
                className={[
                  "w-full rounded-xl px-3 py-2.5 text-left capitalize",
                  folder === f ? "bg-panel text-accent" : "text-foam",
                ].join(" ")}
              >
                {f}
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
