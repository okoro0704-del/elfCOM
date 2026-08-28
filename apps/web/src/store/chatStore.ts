import { create } from "zustand";

export type Presence = "online" | "away" | "offline";
export type Delivery = "sent" | "delivered" | "read";

export type ChatPeer = {
  id: string;
  displayName: string;
  handle: string;
  email?: string;
  phone?: string;
  presence: Presence;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  body: string;
  fromMe: boolean;
  createdAt: string;
  delivery: Delivery;
};

export type ChatThread = {
  id: string;
  peer: ChatPeer;
  preview: string;
  unread: number;
  typing: boolean;
  updatedAt: string;
};

type ChatState = {
  threads: ChatThread[];
  messages: Record<string, ChatMessage[]>;
  activeThreadId: string | null;
  lookupOpen: boolean;
  setLookupOpen: (open: boolean) => void;
  setActiveThread: (id: string | null) => void;
  unreadTotal: () => number;
  startChatWith: (query: string) => void;
  sendMessage: (threadId: string, body: string) => void;
};

const seedPeers: ChatPeer[] = [
  {
    id: "p1",
    displayName: "Amara Okoro",
    handle: "@amara",
    email: "amara@elfcom.mail",
    phone: "+2348012345678",
    presence: "online",
  },
  {
    id: "p2",
    displayName: "Kofi Mensah",
    handle: "@kofi",
    email: "kofi@hotel.example",
    phone: "+2335550123",
    presence: "away",
  },
];

export const useChatStore = create<ChatState>((set, get) => ({
  threads: [
    {
      id: "t1",
      peer: seedPeers[0]!,
      preview: "See you at the lobby desk.",
      unread: 2,
      typing: false,
      updatedAt: new Date().toISOString(),
    },
    {
      id: "t2",
      peer: seedPeers[1]!,
      preview: "Invoice attached for tonight.",
      unread: 0,
      typing: true,
      updatedAt: new Date(Date.now() - 3600_000).toISOString(),
    },
  ],
  messages: {
    t1: [
      {
        id: "m1",
        threadId: "t1",
        body: "Room 412 is ready.",
        fromMe: false,
        createdAt: new Date(Date.now() - 7200_000).toISOString(),
        delivery: "read",
      },
      {
        id: "m2",
        threadId: "t1",
        body: "Perfect — on my way.",
        fromMe: true,
        createdAt: new Date(Date.now() - 7000_000).toISOString(),
        delivery: "read",
      },
      {
        id: "m3",
        threadId: "t1",
        body: "See you at the lobby desk.",
        fromMe: false,
        createdAt: new Date(Date.now() - 600_000).toISOString(),
        delivery: "delivered",
      },
    ],
  },
  activeThreadId: null,
  lookupOpen: false,
  setLookupOpen: (open) => set({ lookupOpen: open }),
  setActiveThread: (id) => {
    set({ activeThreadId: id });
    if (!id) return;
    set((s) => ({
      threads: s.threads.map((t) => (t.id === id ? { ...t, unread: 0 } : t)),
    }));
  },
  unreadTotal: () => get().threads.reduce((n, t) => n + t.unread, 0),
  startChatWith: (query) => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const existing = get().threads.find(
      (t) =>
        t.peer.handle.toLowerCase() === q ||
        t.peer.email?.toLowerCase() === q ||
        t.peer.phone?.replace(/\s/g, "") === q.replace(/\s/g, "") ||
        t.peer.displayName.toLowerCase().includes(q),
    );
    if (existing) {
      set({ activeThreadId: existing.id, lookupOpen: false });
      return;
    }
    const id = `t_${Date.now()}`;
    const peer: ChatPeer = {
      id: `p_${Date.now()}`,
      displayName: query.startsWith("@") ? query.slice(1) : query,
      handle: query.startsWith("@") ? query : `@${query.split("@")[0] ?? "guest"}`,
      email: query.includes("@") && !query.startsWith("@") ? query : undefined,
      phone: /^\+?\d[\d\s-]{6,}$/.test(query) ? query : undefined,
      presence: "offline",
    };
    set((s) => ({
      threads: [
        {
          id,
          peer,
          preview: "Conversation started",
          unread: 0,
          typing: false,
          updatedAt: new Date().toISOString(),
        },
        ...s.threads,
      ],
      messages: { ...s.messages, [id]: [] },
      activeThreadId: id,
      lookupOpen: false,
    }));
  },
  sendMessage: (threadId, body) => {
    const text = body.trim();
    if (!text) return;
    const msg: ChatMessage = {
      id: `m_${Date.now()}`,
      threadId,
      body: text,
      fromMe: true,
      createdAt: new Date().toISOString(),
      delivery: "sent",
    };
    set((s) => ({
      messages: {
        ...s.messages,
        [threadId]: [...(s.messages[threadId] ?? []), msg],
      },
      threads: s.threads.map((t) =>
        t.id === threadId
          ? { ...t, preview: text, updatedAt: msg.createdAt, typing: false }
          : t,
      ),
    }));
    window.setTimeout(() => {
      set((s) => ({
        messages: {
          ...s.messages,
          [threadId]: (s.messages[threadId] ?? []).map((m) =>
            m.id === msg.id ? { ...m, delivery: "delivered" } : m,
          ),
        },
      }));
    }, 600);
  },
}));
