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
  omniChatUnread: () => number;
  omniMailUnread: () => number;
  visibleOmniChat: () => OmniChatItem[];
  visibleOmniMail: () => OmniMailItem[];
};

export const useOmniStore = create<OmniState>((set, get) => ({
  platforms: [
    { id: "wa", platform: "whatsapp", handle: "+15550001111", connected: true, lastSyncAt: new Date().toISOString() },
    { id: "ig", platform: "instagram", handle: "@harbor.hotel", connected: true, lastSyncAt: new Date().toISOString() },
    { id: "ms", platform: "messenger", handle: "Harbor Hotel", connected: false },
    { id: "tg", platform: "telegram", handle: "@harbor_bot", connected: true, lastSyncAt: new Date().toISOString() },
  ],
  omniChat: [
    {
      id: "oc1",
      platform: "whatsapp",
      peer: "+15551234567",
      preview: "Is late checkout possible?",
      unread: 3,
      updatedAt: new Date().toISOString(),
    },
    {
      id: "oc2",
      platform: "instagram",
      peer: "@traveler.maya",
      preview: "Loved the rooftop photos!",
      unread: 1,
      updatedAt: new Date(Date.now() - 1200_000).toISOString(),
    },
    {
      id: "oc3",
      platform: "telegram",
      peer: "Guest Bot",
      preview: "Room service menu please",
      unread: 0,
      updatedAt: new Date(Date.now() - 7200_000).toISOString(),
    },
  ],
  omniChatFilter: "all",
  mailboxes: [
    { id: "gm", provider: "gmail", address: "ops@gmail.com", connected: true, syncing: false },
    { id: "ol", provider: "outlook", address: "ops@outlook.com", connected: true, syncing: true },
    { id: "im", provider: "imap", address: "mail@custom.host", connected: false, syncing: false },
  ],
  omniMail: [
    {
      id: "om1",
      mailboxId: "gm",
      subject: "Supplier invoice #8821",
      from: "billing@linen.co",
      preview: "Payment due Friday.",
      unread: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: "om2",
      mailboxId: "ol",
      subject: "OTA rate plan update",
      from: "partners@booking.example",
      preview: "New weekend multipliers.",
      unread: true,
      updatedAt: new Date(Date.now() - 4000_000).toISOString(),
    },
  ],
  omniMailFilter: "all",
  setOmniChatFilter: (f) => set({ omniChatFilter: f }),
  setOmniMailFilter: (f) => set({ omniMailFilter: f }),
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
