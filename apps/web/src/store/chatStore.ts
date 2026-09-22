import { create } from "zustand";
import {
  ensureElfComSession,
  fetchInbox,
  fetchMessages,
  openDm,
  sendThreadMessage,
  type ElfComApiMessage,
  type ElfComApiThread,
  elfcomBaseUrl,
} from "../lib/elfcomApi";
import { mergeById } from "../lib/messageDedupe";
import {
  connectElfComEvents,
  type ElfComConnectionStatus,
  type ElfComEventsHandle,
  type ElfComRealtimeEvent,
} from "../lib/elfcomEvents";

export type Presence = "online" | "away" | "offline";

/** Optimistic / server message client status — never claim DELIVERED/READ in E1. */
export type ClientSendStatus = "LOCAL_PENDING" | "SERVER_ACCEPTED" | "FAILED";

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
  status: ClientSendStatus;
  /** Local-only id while pending; replaced by server id on accept. */
  clientId?: string;
};

export type ChatThread = {
  id: string;
  peer: ChatPeer;
  preview: string;
  unread: number;
  typing: boolean;
  updatedAt: string;
  channel: string;
};

type ChatState = {
  threads: ChatThread[];
  messages: Record<string, ChatMessage[]>;
  activeThreadId: string | null;
  lookupOpen: boolean;
  connectionStatus: ElfComConnectionStatus;
  inboxLoading: boolean;
  messagesLoading: boolean;
  inboxError: string | null;
  sendError: string | null;
  ownerTrustId: string | null;
  setLookupOpen: (open: boolean) => void;
  setActiveThread: (id: string | null) => void;
  unreadTotal: () => number;
  /** Boot after TrustID login — loads inbox + WS. */
  connectEngine: (input: { accessToken: string; trustId: string }) => Promise<void>;
  disconnectEngine: () => void;
  refreshInbox: () => Promise<void>;
  openConversationWith: (
    peerTrustId: string,
    peerMeta?: Partial<ChatPeer>,
  ) => Promise<void>;
  loadMessages: (threadId: string) => Promise<void>;
  sendMessage: (threadId: string, body: string) => Promise<void>;
  retryMessage: (threadId: string, clientId: string) => Promise<void>;
  handleRealtime: (ev: ElfComRealtimeEvent) => void;
};

let accessTokenRef: string | null = null;
let eventsHandle: ElfComEventsHandle | null = null;
let connectGen = 0;

function peerFromThread(t: ElfComApiThread): ChatPeer {
  const id = t.peerRef || t.participants.find((p) => p !== t.id) || t.title || t.id;
  return {
    id,
    displayName: t.title || id,
    handle: id.startsWith("TD-") || id.startsWith("$") ? id : `$${id}`,
    presence: "offline",
  };
}

function mapThread(t: ElfComApiThread): ChatThread {
  return {
    id: t.id,
    peer: peerFromThread(t),
    preview: t.preview || "",
    unread: t.unreadCount ?? 0,
    typing: false,
    updatedAt: t.updatedAt,
    channel: t.channel ?? "dm",
  };
}

function mapServerMessage(m: ElfComApiMessage, myTrustId: string): ChatMessage {
  return {
    id: m.id,
    threadId: m.threadId,
    body: m.body,
    fromMe: m.senderId === myTrustId || m.direction === "outbound",
    createdAt: m.createdAt,
    status: "SERVER_ACCEPTED",
  };
}

function sortMessages(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export const useChatStore = create<ChatState>((set, get) => ({
  threads: [],
  messages: {},
  activeThreadId: null,
  lookupOpen: false,
  connectionStatus: "idle",
  inboxLoading: false,
  messagesLoading: false,
  inboxError: null,
  sendError: null,
  ownerTrustId: null,

  setLookupOpen: (open) => set({ lookupOpen: open }),

  setActiveThread: (id) => {
    set({ activeThreadId: id, sendError: null });
    if (!id) return;
    set((s) => ({
      threads: s.threads.map((t) => (t.id === id ? { ...t, unread: 0 } : t)),
    }));
    void get().loadMessages(id);
  },

  unreadTotal: () => get().threads.reduce((n, t) => n + t.unread, 0),

  disconnectEngine: () => {
    connectGen += 1;
    eventsHandle?.close();
    eventsHandle = null;
    accessTokenRef = null;
    set({
      connectionStatus: "offline",
      ownerTrustId: null,
      threads: [],
      messages: {},
      activeThreadId: null,
      inboxError: null,
    });
  },

  connectEngine: async ({ accessToken, trustId }) => {
    const gen = ++connectGen;
    accessTokenRef = accessToken;
    eventsHandle?.close();
    eventsHandle = null;
    set({
      ownerTrustId: trustId,
      inboxLoading: true,
      inboxError: null,
      connectionStatus: "connecting",
    });

    try {
      await ensureElfComSession(accessToken);
      if (gen !== connectGen) return;
      const threads = await fetchInbox(accessToken, "dm");
      if (gen !== connectGen) return;
      set({
        threads: threads.map(mapThread),
        inboxLoading: false,
        inboxError: null,
      });

      const base = elfcomBaseUrl();
      if (!base) {
        set({ connectionStatus: "offline", inboxError: "VITE_ELFCOM_BASE_URL missing" });
        return;
      }

      eventsHandle = connectElfComEvents({
        baseUrl: base,
        accessToken,
        onStatus: (status) => {
          if (gen !== connectGen) return;
          set({ connectionStatus: status });
        },
        onEvent: (ev) => {
          if (gen !== connectGen) return;
          get().handleRealtime(ev);
        },
      });
    } catch (err) {
      if (gen !== connectGen) return;
      const msg = err instanceof Error ? err.message : "Failed to connect to ElfCom";
      set({
        inboxLoading: false,
        inboxError: msg,
        connectionStatus: "offline",
      });
    }
  },

  refreshInbox: async () => {
    const token = accessTokenRef;
    if (!token) return;
    try {
      const threads = await fetchInbox(token, "dm");
      set({ threads: threads.map(mapThread), inboxError: null });
    } catch (err) {
      set({
        inboxError: err instanceof Error ? err.message : "Inbox refresh failed",
      });
    }
  },

  openConversationWith: async (peerTrustId, peerMeta) => {
    const token = accessTokenRef;
    const me = get().ownerTrustId;
    if (!token || !me) {
      set({ inboxError: "Not connected to ElfCom" });
      return;
    }
    const peer = peerTrustId.trim();
    if (!peer || peer === me) {
      set({ inboxError: "Cannot message yourself" });
      return;
    }

    const existing = get().threads.find(
      (t) => t.peer.id === peer || t.id === `dm:${me}:${peer}`,
    );
    if (existing) {
      set({ activeThreadId: existing.id, lookupOpen: false });
      void get().loadMessages(existing.id);
      return;
    }

    try {
      const thread = await openDm(token, peer);
      const mapped = mapThread(thread);
      if (peerMeta) {
        mapped.peer = {
          ...mapped.peer,
          displayName: peerMeta.displayName ?? mapped.peer.displayName,
          handle: peerMeta.handle ?? mapped.peer.handle,
          email: peerMeta.email,
          phone: peerMeta.phone,
          presence: peerMeta.presence ?? "offline",
          id: peer,
        };
      } else {
        mapped.peer.id = peer;
      }
      set((s) => ({
        threads: [mapped, ...s.threads.filter((t) => t.id !== mapped.id)],
        messages: { ...s.messages, [mapped.id]: s.messages[mapped.id] ?? [] },
        activeThreadId: mapped.id,
        lookupOpen: false,
        inboxError: null,
      }));
      void get().loadMessages(mapped.id);
    } catch (err) {
      set({
        inboxError: err instanceof Error ? err.message : "Could not open conversation",
        lookupOpen: false,
      });
    }
  },

  loadMessages: async (threadId) => {
    const token = accessTokenRef;
    const me = get().ownerTrustId;
    if (!token || !me) return;
    set({ messagesLoading: true });
    try {
      const list = await fetchMessages(token, threadId);
      const pending = (get().messages[threadId] ?? []).filter(
        (m) => m.status === "LOCAL_PENDING" || m.status === "FAILED",
      );
      const accepted = list.map((m) => mapServerMessage(m, me));
      const byId = new Map<string, ChatMessage>();
      for (const m of accepted) byId.set(m.id, m);
      for (const m of pending) {
        if (m.clientId && !byId.has(m.id)) byId.set(m.id, m);
      }
      set((s) => ({
        messages: { ...s.messages, [threadId]: sortMessages([...byId.values()]) },
        messagesLoading: false,
      }));
    } catch (err) {
      set({
        messagesLoading: false,
        inboxError: err instanceof Error ? err.message : "Failed to load messages",
      });
    }
  },

  sendMessage: async (threadId, body) => {
    const text = body.trim();
    if (!text) return;
    const token = accessTokenRef;
    const me = get().ownerTrustId;
    const thread = get().threads.find((t) => t.id === threadId);
    if (!token || !me || !thread) {
      set({ sendError: "Not ready to send" });
      return;
    }

    const clientId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: ChatMessage = {
      id: clientId,
      clientId,
      threadId,
      body: text,
      fromMe: true,
      createdAt: new Date().toISOString(),
      status: "LOCAL_PENDING",
    };

    set((s) => ({
      messages: {
        ...s.messages,
        [threadId]: sortMessages([...(s.messages[threadId] ?? []), optimistic]),
      },
      threads: s.threads.map((t) =>
        t.id === threadId
          ? { ...t, preview: text, updatedAt: optimistic.createdAt }
          : t,
      ),
      sendError: null,
    }));

    try {
      const accepted = await sendThreadMessage(token, {
        threadId,
        body: text,
        peerRef: thread.peer.id,
        channel: "dm",
      });
      set((s) => {
        const prev = s.messages[threadId] ?? [];
        const withoutLocal = prev.filter((m) => m.clientId !== clientId && m.id !== accepted.id);
        const mapped = mapServerMessage(accepted, me);
        return {
          messages: {
            ...s.messages,
            [threadId]: sortMessages([...withoutLocal, mapped]),
          },
          threads: s.threads.map((t) =>
            t.id === threadId
              ? { ...t, preview: mapped.body, updatedAt: mapped.createdAt }
              : t,
          ),
        };
      });
    } catch (err) {
      set((s) => ({
        messages: {
          ...s.messages,
          [threadId]: (s.messages[threadId] ?? []).map((m) =>
            m.clientId === clientId ? { ...m, status: "FAILED" as const } : m,
          ),
        },
        sendError: err instanceof Error ? err.message : "Send failed",
      }));
    }
  },

  retryMessage: async (threadId, clientId) => {
    const msg = (get().messages[threadId] ?? []).find((m) => m.clientId === clientId);
    if (!msg || msg.status !== "FAILED") return;
    set((s) => ({
      messages: {
        ...s.messages,
        [threadId]: (s.messages[threadId] ?? []).filter((m) => m.clientId !== clientId),
      },
    }));
    await get().sendMessage(threadId, msg.body);
  },

  handleRealtime: (ev) => {
    if (ev.typ === "session.ready") return;
    if (ev.typ === "message.created" || ev.typ === "thread.updated") {
      const threadId = ev.threadId;
      void get().refreshInbox();
      if (threadId && (get().activeThreadId === threadId || get().messages[threadId])) {
        void get().loadMessages(threadId);
      }
    }
  },
}));

/** Test helper — merge without store. */
export function dedupeChatMessages(
  existing: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  return mergeById(existing, incoming);
}
