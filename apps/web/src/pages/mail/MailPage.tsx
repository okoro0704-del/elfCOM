import { TopAppBar } from "../../components/TopAppBar";
import { useMailStore, type MailFolder } from "../../store/mailStore";
import { MailComposer } from "./MailComposer";
import { FolderDrawer } from "./FolderDrawer";

const folderLabel: Record<MailFolder, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  spam: "Spam",
};

export function MailPage() {
  const accounts = useMailStore((s) => s.accounts);
  const activeAccountId = useMailStore((s) => s.activeAccountId);
  const setActiveAccount = useMailStore((s) => s.setActiveAccount);
  const folder = useMailStore((s) => s.folder);
  const threads = useMailStore((s) => s.visibleThreads());
  const setComposerOpen = useMailStore((s) => s.setComposerOpen);
  const setFolderDrawerOpen = useMailStore((s) => s.setFolderDrawerOpen);
  const composerOpen = useMailStore((s) => s.composerOpen);
  const folderDrawerOpen = useMailStore((s) => s.folderDrawerOpen);
  const active = accounts.find((a) => a.id === activeAccountId);

  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar
        title="ElfMail"
        subtitle={active?.address ?? "Mailbox"}
        left={
          <button
            type="button"
            onClick={() => setFolderDrawerOpen(true)}
            className="rounded-xl border border-line px-2 py-1 text-xs text-mist"
          >
            Folders
          </button>
        }
        right={
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-ink"
          >
            Compose
          </button>
        }
      />

      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setActiveAccount(a.id)}
            className={[
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
              a.id === activeAccountId ? "bg-accent text-ink" : "bg-panel text-mist",
            ].join(" ")}
          >
            {a.label}
          </button>
        ))}
      </div>

      <p className="px-4 pb-2 text-xs uppercase tracking-wider text-mist">{folderLabel[folder]}</p>

      <ul className="divide-y divide-line/60 px-2 pb-6">
        {threads.map((t) => (
          <li key={t.id} className="px-3 py-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className={`truncate text-sm ${t.unread ? "font-semibold text-foam" : "text-mist"}`}>
                {t.from}
              </p>
              <span className="shrink-0 text-[10px] text-mist">
                {new Date(t.updatedAt).toLocaleDateString()}
              </span>
            </div>
            <p className="mt-0.5 truncate font-medium">{t.subject}</p>
            <p className="mt-0.5 truncate text-sm text-mist">{t.preview}</p>
          </li>
        ))}
        {threads.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-mist">No messages in this folder.</li>
        ) : null}
      </ul>

      {folderDrawerOpen ? <FolderDrawer /> : null}
      {composerOpen ? <MailComposer /> : null}
    </div>
  );
}
