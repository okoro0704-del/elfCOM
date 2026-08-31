import { create } from "zustand";

export type SocialPlatform = "whatsapp" | "instagram" | "messenger" | "telegram";
export type MailProvider = "gmail" | "outlook" | "imap";

export type PlatformLink = {
  id: string;
  platform: SocialPlatform;
  handle: string;
  connected: boolean;
  lastSyncAt?: string;
};

export type OmniChatItem = {
  id: string;
  platform: SocialPlatform;
  peer: string;
  preview: string;
  unread: number;
  updatedAt: string;
};

export type ExternalMailbox = {
  id: string;
  provider: MailProvider;
  address: string;
  connected: boolean;
  syncing: boolean;
};

export type OmniMailItem = {
  id: string;
  mailboxId: string;
  subject: string;
  from: string;
  preview: string;
  unread: boolean;
  updatedAt: string;
};

type OmniState = {
  platforms: PlatformLink[];
  omniChat: OmniChatItem[];
  omniChatFilter: SocialPlatform | "all";
  mailboxes: ExternalMailbox[];
  omniMail: OmniMailItem[];
  omniMailFilter: string | "all";
  setOmniChatFilter: (f: SocialPlatform | "all") => void;
  setOmniMailFilter: (f: string | "all") => void;
  connectPlatform: (platform: SocialPlatform, handle: string) => PlatformLink;
  disconnectPlatform: (id: string) => void;
  connectMailbox: (provider: MailProvider, address: string) => ExternalMailbox;
  disconnectMailbox: (id: string) => void;
  omniChatUnread: () => number;
  omniMailUnread: () => number;
  visibleOmniChat: () => OmniChatItem[];
  visibleOmniMail: () => OmniMailItem[];
};

export const useOmniStore = create<OmniState>((set, get) => ({
  platforms: [],
  omniChat: [],
  omniChatFilter: "all",
  mailboxes: [],
  omniMail: [],
  omniMailFilter: "all",
  setOmniChatFilter: (f) => set({ omniChatFilter: f }),
  setOmniMailFilter: (f) => set({ omniMailFilter: f }),
  connectPlatform: (platform, handle) => {
    const trimmed = handle.trim();
    if (!trimmed) throw new Error("Channel handle is required");
    const existing = get().platforms.find((p) => p.platform === platform);
    if (existing) {
      const updated: PlatformLink = {
        ...existing,
        handle: trimmed,
        connected: true,
        lastSyncAt: new Date().toISOString(),
      };
      set((s) => ({
        platforms: s.platforms.map((p) => (p.id === existing.id ? updated : p)),
      }));
      return updated;
    }
    const link: PlatformLink = {
      id: `ch_${platform}_${Date.now()}`,
      platform,
      handle: trimmed,
      connected: true,
      lastSyncAt: new Date().toISOString(),
    };
    set((s) => ({ platforms: [...s.platforms, link] }));
    return link;
  },
  disconnectPlatform: (id) =>
    set((s) => ({
      platforms: s.platforms.map((p) =>
        p.id === id ? { ...p, connected: false, lastSyncAt: undefined } : p,
      ),
    })),
  connectMailbox: (provider, address) => {
    const addr = address.trim().toLowerCase();
    if (!addr || !addr.includes("@")) throw new Error("Valid email address required");
    const existing = get().mailboxes.find((m) => m.provider === provider && m.address === addr);
    if (existing) {
      const updated = { ...existing, connected: true, syncing: false };
      set((s) => ({
        mailboxes: s.mailboxes.map((m) => (m.id === existing.id ? updated : m)),
      }));
      return updated;
    }
    const box: ExternalMailbox = {
      id: `mb_${provider}_${Date.now()}`,
      provider,
      address: addr,
      connected: true,
      syncing: false,
    };
    set((s) => ({ mailboxes: [...s.mailboxes, box] }));
    return box;
  },
  disconnectMailbox: (id) =>
    set((s) => ({
      mailboxes: s.mailboxes.map((m) =>
        m.id === id ? { ...m, connected: false, syncing: false } : m,
      ),
    })),
  omniChatUnread: () => get().omniChat.reduce((n, i) => n + i.unread, 0),
  omniMailUnread: () => get().omniMail.filter((i) => i.unread).length,
  visibleOmniChat: () => {
    const { omniChat, omniChatFilter } = get();
    return omniChatFilter === "all" ? omniChat : omniChat.filter((i) => i.platform === omniChatFilter);
  },
  visibleOmniMail: () => {
    const { omniMail, omniMailFilter } = get();
    return omniMailFilter === "all" ? omniMail : omniMail.filter((i) => i.mailboxId === omniMailFilter);
  },
}));
