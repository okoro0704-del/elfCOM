import { create } from "zustand";

const STORAGE_KEY = "elfcom.mail.v1";

export type MailFolder = "inbox" | "sent" | "drafts" | "archive" | "spam" | "trash";
export type MailWorkspace = "personal" | "business";

export type MailAccount = {
  id: string;
  label: string;
  address: string;
  workspace: MailWorkspace;
};

export type MailThread = {
  id: string;
  accountId: string;
  folder: MailFolder;
  subject: string;
  from: string;
  to?: string;
  preview: string;
  unread: boolean;
  starred: boolean;
  updatedAt: string;
  bodies?: { from: string; html: string; at: string }[];
};

type Persisted = {
  ownerTrustId?: string;
  accounts: MailAccount[];
  activeAccountId: string | null;
  threads: MailThread[];
};

type MailState = {
  ownerTrustId: string | null;
  accounts: MailAccount[];
  activeAccountId: string | null;
  folder: MailFolder;
  threads: MailThread[];
  composerOpen: boolean;
  folderDrawerOpen: boolean;
  hydrate: (ownerTrustId: string) => void;
  setActiveAccount: (id: string) => void;
  setFolder: (folder: MailFolder) => void;
  setComposerOpen: (open: boolean) => void;
  setFolderDrawerOpen: (open: boolean) => void;
  /** Gmail-style: create you@elfcom.me (or custom domain) mailbox. */
  createMailbox: (input: {
    localPart: string;
    displayName: string;
    workspace?: MailWorkspace;
    domain?: string;
  }) => MailAccount;
  sendMail: (input: { to: string; subject: string; body: string }) => void;
  moveThread: (id: string, folder: MailFolder) => void;
  toggleStar: (id: string) => void;
  markRead: (id: string, unread?: boolean) => void;
  syncAccountsFromProfile: (input: {
    personalHandle: string;
    personalName: string;
    mailLocal?: string;
    email?: string;
    businessDomain?: string;
    businessName?: string;
  }) => void;
  unreadTotal: () => number;
  visibleThreads: () => MailThread[];
};

function persist(ownerTrustId: string | null, slice: Omit<Persisted, "ownerTrustId">) {
  if (!ownerTrustId) return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ownerTrustId, ...slice } satisfies Persisted),
    );
  } catch {
    /* ignore */
  }
}

function read(ownerTrustId: string): Persisted | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.ownerTrustId !== ownerTrustId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const useMailStore = create<MailState>((set, get) => ({
  ownerTrustId: null,
  accounts: [],
  activeAccountId: null,
  folder: "inbox",
  threads: [],
  composerOpen: false,
  folderDrawerOpen: false,
  hydrate: (ownerTrustId) => {
    const stored = read(ownerTrustId);
    set({
      ownerTrustId,
      accounts: stored?.accounts ?? [],
      activeAccountId: stored?.activeAccountId ?? null,
      threads: stored?.threads ?? [],
    });
  },
  setActiveAccount: (id) => {
    set({ activeAccountId: id });
    const { ownerTrustId, accounts, threads } = get();
    persist(ownerTrustId, { accounts, activeAccountId: id, threads });
  },
  setFolder: (folder) => set({ folder, folderDrawerOpen: false }),
  setComposerOpen: (open) => set({ composerOpen: open }),
  setFolderDrawerOpen: (open) => set({ folderDrawerOpen: open }),
  createMailbox: (input) => {
    const local = input.localPart.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (!local || local.length < 3) {
      throw new Error("Choose an email address with at least 3 characters");
    }
    const domain = (input.domain ?? "elfcom.me").trim().toLowerCase();
    const address = `${local}@${domain}`;
    const workspace = input.workspace ?? "personal";
    const id = workspace === "business" ? "a-biz" : "a-personal";
    const account: MailAccount = {
      id,
      label: input.displayName || local,
      address,
      workspace,
    };
    set((s) => {
      const accounts = [...s.accounts.filter((a) => a.id !== id), account];
      const next = {
        accounts,
        activeAccountId: account.id,
        threads: s.threads,
      };
      persist(s.ownerTrustId, next);
      return next;
    });
    return account;
  },
  sendMail: ({ to, subject, body }) => {
    const text = body.trim();
    const dest = to.trim();
    if (!dest) throw new Error("Add a recipient");
    if (!text && !subject.trim()) throw new Error("Write a subject or message");
    const { activeAccountId, accounts, ownerTrustId, threads } = get();
    const account = accounts.find((a) => a.id === activeAccountId) ?? accounts[0];
    if (!account) throw new Error("Set up your ElfMail address first");

    const now = new Date().toISOString();
    const id = `mt_${Date.now()}`;
    const html = text
      .split(/\n+/)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("");
    const thread: MailThread = {
      id,
      accountId: account.id,
      folder: "sent",
      subject: subject.trim() || "(no subject)",
      from: account.address,
      to: dest,
      preview: text.slice(0, 120) || subject,
      unread: false,
      starred: false,
      updatedAt: now,
      bodies: [{ from: account.address, html: html || `<p>${escapeHtml(subject)}</p>`, at: now }],
    };
    const nextThreads = [thread, ...threads];
    set({ threads: nextThreads, composerOpen: false, folder: "sent" });
    persist(ownerTrustId, {
      accounts,
      activeAccountId: account.id,
      threads: nextThreads,
    });
  },
  moveThread: (id, folder) => {
    set((s) => {
      const threads = s.threads.map((t) => (t.id === id ? { ...t, folder } : t));
      persist(s.ownerTrustId, {
        accounts: s.accounts,
        activeAccountId: s.activeAccountId,
        threads,
      });
      return { threads };
    });
  },
  toggleStar: (id) => {
    set((s) => {
      const threads = s.threads.map((t) =>
        t.id === id ? { ...t, starred: !t.starred } : t,
      );
      persist(s.ownerTrustId, {
        accounts: s.accounts,
        activeAccountId: s.activeAccountId,
        threads,
      });
      return { threads };
    });
  },
  markRead: (id, unread = false) => {
    set((s) => {
      const threads = s.threads.map((t) => (t.id === id ? { ...t, unread } : t));
      persist(s.ownerTrustId, {
        accounts: s.accounts,
        activeAccountId: s.activeAccountId,
        threads,
      });
      return { threads };
    });
  },
  syncAccountsFromProfile: (input) => {
    const local =
      (input.mailLocal ?? "").trim().toLowerCase() ||
      input.personalHandle.replace(/^[@$]/, "").toLowerCase() ||
      "me";
    const personalAddress =
      input.email?.includes("@")
        ? input.email.toLowerCase()
        : `${local}@elfcom.me`;
    const personal: MailAccount = {
      id: "a-personal",
      label: input.personalName || "Personal",
      address: personalAddress,
      workspace: "personal",
    };
    const accounts: MailAccount[] = [personal];
    if (input.businessDomain) {
      accounts.push({
        id: "a-biz",
        label: input.businessName || "Business",
        address: `${local}@${input.businessDomain}`,
        workspace: "business",
      });
    }
    set((s) => {
      // Don't overwrite an existing mailbox the user already created.
      if (s.accounts.length > 0) return {};
      const next = {
        accounts,
        activeAccountId: personal.id,
        threads: s.threads,
      };
      persist(s.ownerTrustId, next);
      return next;
    });
  },
  unreadTotal: () => get().threads.filter((t) => t.unread && t.folder === "inbox").length,
  visibleThreads: () => {
    const { threads, activeAccountId, folder } = get();
    if (!activeAccountId) return [];
    return threads.filter((t) => t.accountId === activeAccountId && t.folder === folder);
  },
}));
