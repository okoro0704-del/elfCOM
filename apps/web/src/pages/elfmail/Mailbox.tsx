import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { initiateCall } from "@elfcom/webrtc";
import { ProfileSwitcher } from "@elfcom/ui";
import type { ProfileMode } from "@elfcom/core";
import { useAccountStore } from "../../store/accountStore";
import { useAuthStore } from "../../store/authStore";
import { useMailStore, type MailFolder, type MailThread } from "../../store/mailStore";
import { MailComposer } from "../mail/MailComposer";

const folders: { id: MailFolder | "trash"; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
  { id: "drafts", label: "Drafts" },
  { id: "archive", label: "Archive" },
  { id: "spam", label: "Spam" },
  { id: "trash", label: "Trash" },
];

const labels = ["VIP", "Reservations", "Billing", "Travel"];

/** Gmail-standard ElfMailbox: sidebar + thread list + reader with call actions. */
export function Mailbox() {
  const trustId = useAuthStore((s) => s.session?.trustId);
  const context = useAccountStore((s) => s.context);
  const switchMode = useAccountStore((s) => s.switchMode);
  const needsSetup = useAccountStore((s) => s.needsSetup);
  const navigate = useNavigate();
  const accounts = useMailStore((s) => s.accounts);
  const activeAccountId = useMailStore((s) => s.activeAccountId);
  const setActiveAccount = useMailStore((s) => s.setActiveAccount);
  const syncAccountsFromProfile = useMailStore((s) => s.syncAccountsFromProfile);
  const folder = useMailStore((s) => s.folder);
  const setFolder = useMailStore((s) => s.setFolder);
  const threads = useMailStore((s) => s.visibleThreads());
  const setComposerOpen = useMailStore((s) => s.setComposerOpen);
  const composerOpen = useMailStore((s) => s.composerOpen);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reply, setReply] = useState("");

  useEffect(() => {
    if (trustId) useAccountStore.getState().hydrate(trustId);
  }, [trustId]);

  useEffect(() => {
    if (!context?.personal.setupComplete) return;
    syncAccountsFromProfile({
      personalHandle: context.personal.tidHandle,
      personalName: context.personal.displayName,
      businessDomain: context.business.setupComplete
        ? context.business.businessDomain
        : undefined,
      businessName: context.business.displayName,
    });
  }, [context, syncAccountsFromProfile]);

  const selected = useMemo(
    () => threads.find((t) => t.id === selectedId) ?? null,
    [threads, selectedId],
  );

  const sorted = useMemo(
    () => [...threads].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [threads],
  );

  const active = accounts.find((a) => a.id === activeAccountId);

  const pickFolder = (id: MailFolder | "trash") => {
    if (id === "trash") {
      setFolder("archive");
    } else {
      setFolder(id);
    }
    setSelectedId(null);
    setSidebarOpen(false);
  };

  return (
    <div className="flex min-h-full flex-col bg-ink">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5 safe-pt">
        <button
          type="button"
          className="rounded-xl border border-line px-2 py-1 text-xs text-mist lg:hidden"
          onClick={() => setSidebarOpen(true)}
        >
          Menu
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold">ElfMail</p>
          <p className="truncate text-xs text-mist">{active?.address ?? "Mailbox"}</p>
        </div>
        {context ? (
          <ProfileSwitcher
            activeMode={context.activeMode}
            onSwitch={(mode) => {
              switchMode(mode);
              const nextId = mode === "PERSONAL" ? "a-personal" : "a-biz";
              if (accounts.some((a) => a.id === nextId)) setActiveAccount(nextId);
              if (needsSetup(mode)) navigate(`/setup/${mode.toLowerCase()}`);
            }}
          />
        ) : null}
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside
          className={[
            "z-30 flex w-64 shrink-0 flex-col border-r border-line bg-ink-soft",
            "fixed inset-y-0 left-0 transition-transform lg:static lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <div className="space-y-3 p-3 safe-pt lg:safe-pt-0">
            <button
              type="button"
              className="w-full rounded-2xl bg-accent py-2.5 text-sm font-semibold text-ink"
              onClick={() => {
                setComposerOpen(true);
                setSidebarOpen(false);
              }}
            >
              Compose
            </button>
            <div className="flex gap-1 overflow-x-auto">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveAccount(a.id)}
                  className={[
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px]",
                    a.id === activeAccountId ? "bg-panel-2 text-accent" : "text-mist",
                  ].join(" ")}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <nav className="space-y-0.5">
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => pickFolder(f.id)}
                  className={[
                    "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm",
                    folder === f.id || (f.id === "trash" && folder === "archive")
                      ? "bg-panel text-foam"
                      : "text-mist hover:bg-panel/50 hover:text-foam",
                  ].join(" ")}
                >
                  {f.label}
                </button>
              ))}
            </nav>
            <div>
              <p className="mb-1 px-3 text-[10px] uppercase tracking-wider text-mist">Labels</p>
              <div className="flex flex-wrap gap-1.5 px-2">
                {labels.map((l) => (
                  <span
                    key={l}
                    className="rounded-full border border-line px-2 py-0.5 text-[10px] text-mist"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="mt-auto border-t border-line p-3 text-sm text-mist lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            Close
          </button>
        </aside>
        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        {/* Thread list */}
        <section
          className={[
            "min-w-0 flex-1 border-r border-line",
            selected ? "hidden md:flex md:max-w-sm md:flex-col" : "flex flex-col",
          ].join(" ")}
        >
          <ul className="app-scroll flex-1 divide-y divide-line/50 overflow-y-auto">
            {sorted.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={t.id === selectedId}
                starred={starred[t.id] ?? t.starred}
                onOpen={() => setSelectedId(t.id)}
                onToggleStar={() =>
                  setStarred((s) => ({ ...s, [t.id]: !(s[t.id] ?? t.starred) }))
                }
              />
            ))}
            {sorted.length === 0 ? (
              <li className="px-4 py-12 text-center text-sm text-mist">No messages in this folder.</li>
            ) : null}
          </ul>
        </section>

        {/* Reader */}
        <section className={selected ? "flex min-w-0 flex-1 flex-col" : "hidden md:flex md:flex-1"}>
          {selected ? (
            <Reader
              thread={selected}
              reply={reply}
              setReply={setReply}
              onBack={() => setSelectedId(null)}
              onArchive={() => {
                setFolder("archive");
                setSelectedId(null);
              }}
              onDelete={() => setSelectedId(null)}
            />
          ) : (
            <div className="hidden flex-1 items-center justify-center text-sm text-mist md:flex">
              Select a conversation
            </div>
          )}
        </section>
      </div>

      {composerOpen ? <MailComposer /> : null}
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  starred,
  onOpen,
  onToggleStar,
}: {
  thread: MailThread;
  active: boolean;
  starred: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={[
          "flex w-full items-start gap-2 px-3 py-3 text-left",
          active ? "bg-panel" : "hover:bg-panel/40",
        ].join(" ")}
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel-2 text-xs font-semibold text-accent">
          {thread.from.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className={`truncate text-sm ${thread.unread ? "font-semibold text-foam" : "text-mist"}`}>
              {thread.from}
            </span>
            <span className="shrink-0 text-[10px] text-mist">
              {new Date(thread.updatedAt).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </span>
          <span className="mt-0.5 block truncate font-medium">{thread.subject}</span>
          <span className="mt-0.5 block truncate text-sm text-mist">{thread.preview}</span>
        </span>
        <span
          role="presentation"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          className={["mt-1 text-sm", starred ? "text-accent" : "text-mist/50"].join(" ")}
        >
          ★
        </span>
      </button>
    </li>
  );
}

function Reader({
  thread,
  reply,
  setReply,
  onBack,
  onArchive,
  onDelete,
}: {
  thread: MailThread;
  reply: string;
  setReply: (v: string) => void;
  onBack: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const history =
    thread.bodies && thread.bodies.length > 0
      ? thread.bodies.map((b, i) => ({ id: `b${i}`, ...b }))
      : [
          {
            id: "h1",
            from: thread.from,
            html: `<p>${escapeHtml(thread.preview)}</p>`,
            at: thread.updatedAt,
          },
        ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-ink/95 px-3 py-2 backdrop-blur">
        <div className="mb-2 flex items-center gap-2 md:hidden">
          <button type="button" className="text-sm text-accent" onClick={onBack}>
            Back
          </button>
        </div>
        <h2 className="font-medium leading-snug">{thread.subject}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ActionBtn
            label="Voice Call"
            onClick={() => initiateCall(thread.from, "AUDIO")}
          />
          <ActionBtn
            label="Video Call"
            onClick={() => initiateCall(thread.from, "VIDEO")}
          />
          <ActionBtn label="Reply" onClick={() => document.getElementById("elfmail-reply")?.focus()} />
          <ActionBtn label="Archive" onClick={onArchive} />
          <ActionBtn label="Delete" onClick={onDelete} />
        </div>
      </header>

      <div className="app-scroll flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {history.map((m) => (
          <article key={m.id} className="rounded-2xl border border-line bg-panel/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-mist">
              <span>{m.from}</span>
              <time>{new Date(m.at).toLocaleString()}</time>
            </div>
            <div
              className="prose-invert text-sm leading-relaxed text-foam [&_p]:mb-2"
              dangerouslySetInnerHTML={{ __html: m.html }}
            />
          </article>
        ))}
      </div>

      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setReply("");
        }}
      >
        <label className="mb-1 block text-xs text-mist" htmlFor="elfmail-reply">
          Reply
        </label>
        <textarea
          id="elfmail-reply"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={3}
          placeholder="Write a reply…"
          className="w-full resize-none rounded-2xl border border-line bg-panel px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={!reply.trim()}
          className="mt-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
        >
          Send reply
        </button>
      </form>
    </div>
  );
}

function ActionBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium text-mist hover:text-foam"
    >
      {label}
    </button>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
