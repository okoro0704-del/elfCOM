import { create } from "zustand";

export type MailFolder = "inbox" | "sent" | "drafts" | "archive" | "spam";
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
  preview: string;
  unread: boolean;
  starred: boolean;
  updatedAt: string;
  /** Optional HTML / text bodies for the reader. */
  bodies?: { from: string; html: string; at: string }[];
};

type MailState = {
  accounts: MailAccount[];
  activeAccountId: string | null;
  folder: MailFolder;
  threads: MailThread[];
  composerOpen: boolean;
  folderDrawerOpen: boolean;
  setActiveAccount: (id: string) => void;
  setFolder: (folder: MailFolder) => void;
  setComposerOpen: (open: boolean) => void;
  setFolderDrawerOpen: (open: boolean) => void;
  syncAccountsFromProfile: (input: {
    personalHandle: string;
    personalName: string;
    businessDomain?: string;
    businessName?: string;
  }) => void;
  unreadTotal: () => number;
  visibleThreads: () => MailThread[];
};

export const useMailStore = create<MailState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  folder: "inbox",
  threads: [],
  composerOpen: false,
  folderDrawerOpen: false,
  setActiveAccount: (id) => set({ activeAccountId: id }),
  setFolder: (folder) => set({ folder, folderDrawerOpen: false }),
  setComposerOpen: (open) => set({ composerOpen: open }),
  setFolderDrawerOpen: (open) => set({ folderDrawerOpen: open }),
  syncAccountsFromProfile: (input) => {
    const handle = input.personalHandle.replace(/^\$/, "").toLowerCase() || "me";
    const personal: MailAccount = {
      id: "a-personal",
      label: input.personalName || "Personal",
      address: `${handle}@elfcom.me`,
      workspace: "personal",
    };
    const accounts: MailAccount[] = [personal];
    if (input.businessDomain) {
      const local = handle || "ops";
      accounts.push({
        id: "a-biz",
        label: input.businessName || "Business",
        address: `${local}@${input.businessDomain}`,
        workspace: "business",
      });
    }
    const active = get().activeAccountId;
    set({
      accounts,
      activeAccountId:
        active && accounts.some((a) => a.id === active) ? active : personal.id,
    });
  },
  unreadTotal: () => get().threads.filter((t) => t.unread && t.folder === "inbox").length,
  visibleThreads: () => {
    const { threads, activeAccountId, folder } = get();
    if (!activeAccountId) return [];
    return threads.filter((t) => t.accountId === activeAccountId && t.folder === folder);
  },
}));
