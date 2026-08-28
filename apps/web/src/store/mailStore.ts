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
};

type MailState = {
  accounts: MailAccount[];
  activeAccountId: string;
  folder: MailFolder;
  threads: MailThread[];
  composerOpen: boolean;
  folderDrawerOpen: boolean;
  setActiveAccount: (id: string) => void;
  setFolder: (folder: MailFolder) => void;
  setComposerOpen: (open: boolean) => void;
  setFolderDrawerOpen: (open: boolean) => void;
  unreadTotal: () => number;
  visibleThreads: () => MailThread[];
};

export const useMailStore = create<MailState>((set, get) => ({
  accounts: [
    {
      id: "a-personal",
      label: "Personal",
      address: "you@elfcom/personal",
      workspace: "personal",
    },
    {
      id: "a-biz",
      label: "Harbor Hotel",
      address: "front.desk@harbor.hotel",
      workspace: "business",
    },
  ],
  activeAccountId: "a-personal",
  folder: "inbox",
  threads: [
    {
      id: "mt1",
      accountId: "a-personal",
      folder: "inbox",
      subject: "Weekend itinerary",
      from: "family@home.mail",
      preview: "Flights land at 16:40 — pick-up?",
      unread: true,
      starred: false,
      updatedAt: new Date().toISOString(),
    },
    {
      id: "mt2",
      accountId: "a-biz",
      folder: "inbox",
      subject: "VIP arrival — suite upgrade",
      from: "concierge@harbor.hotel",
      preview: "Guest TD-SMOKE01 prefers ocean view.",
      unread: true,
      starred: true,
      updatedAt: new Date(Date.now() - 1800_000).toISOString(),
    },
    {
      id: "mt3",
      accountId: "a-biz",
      folder: "sent",
      subject: "Confirmation: Spa booking",
      from: "front.desk@harbor.hotel",
      preview: "Your 14:00 slot is confirmed.",
      unread: false,
      starred: false,
      updatedAt: new Date(Date.now() - 86400_000).toISOString(),
    },
  ],
  composerOpen: false,
  folderDrawerOpen: false,
  setActiveAccount: (id) => set({ activeAccountId: id }),
  setFolder: (folder) => set({ folder, folderDrawerOpen: false }),
  setComposerOpen: (open) => set({ composerOpen: open }),
  setFolderDrawerOpen: (open) => set({ folderDrawerOpen: open }),
  unreadTotal: () => get().threads.filter((t) => t.unread && t.folder === "inbox").length,
  visibleThreads: () => {
    const { threads, activeAccountId, folder } = get();
    return threads.filter((t) => t.accountId === activeAccountId && t.folder === folder);
  },
}));
