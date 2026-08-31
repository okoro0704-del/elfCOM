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
  startChatWith: (query: string, peerMeta?: Partial<ChatPeer>) => void;
  sendMessage: (threadId: string, body: string) => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  threads: [],
  messages: {},
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
  startChatWith: (query, peerMeta) => {
    const q = query.trim();
    if (!q) return;
    const qLower = q.toLowerCase();
    const existing = get().threads.find(
      (t) =>
        t.peer.id.toLowerCase() === qLower ||
        t.peer.handle.toLowerCase() === qLower ||
        t.peer.email?.toLowerCase() === qLower ||
        t.peer.phone?.replace(/\s/g, "") === q.replace(/\s/g, "") ||
        t.peer.displayName.toLowerCase().includes(qLower),
    );
    if (existing) {
      set({ activeThreadId: existing.id, lookupOpen: false });
      return;
    }
    const id = `t_${Date.now()}`;
    const peer: ChatPeer = {
      id: peerMeta?.id ?? q,
      displayName: peerMeta?.displayName ?? (q.startsWith("$") ? q.slice(1) : q),
      handle: peerMeta?.handle ?? (q.startsWith("$") || q.startsWith("@") ? q : `$${q}`),
      email: peerMeta?.email,
      phone: peerMeta?.phone,
      presence: peerMeta?.presence ?? "offline",
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
  },
}));
