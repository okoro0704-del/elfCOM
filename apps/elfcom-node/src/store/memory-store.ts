import type { ElfComChannel, SealedBlob } from "@elfcom/contract";

export type StoredThread = {
  id: string;
  ownerTrustId: string;
  titleCipher: SealedBlob;
  titleCreatedAt: string;
  titleSealMode: "session" | "user";
  channel: ElfComChannel | string;
  peerRef?: string;
  /** User-key sealed peer handle for outbound (base64 JSON SealedBlob). */
  peerHandleCipher?: SealedBlob;
  providerThreadHint?: string;
  updatedAt: string;
  unreadCount: number;
  participants: string[];
};

export type StoredMessage = {
  id: string;
  threadId: string;
  ownerTrustId: string;
  senderId: string;
  channel: string;
  createdAt: string;
  bodyCipher: SealedBlob;
  sealMode: "session" | "user";
  direction: "inbound" | "outbound";
};

/**
 * In-memory durability — ciphertext only.
 * Replace with Postgres in a later wave.
 */
export class MemoryMessageStore {
  private readonly threads = new Map<string, StoredThread>();
  private readonly messages = new Map<string, StoredMessage[]>();

  listThreads(
    ownerTrustId: string,
    filter?: { channel?: string },
  ): StoredThread[] {
    return [...this.threads.values()]
      .filter((t) => t.ownerTrustId === ownerTrustId)
      .filter((t) => !filter?.channel || t.channel === filter.channel)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getThread(ownerTrustId: string, threadId: string): StoredThread | null {
    const t = this.threads.get(threadId);
    if (!t || t.ownerTrustId !== ownerTrustId) return null;
    return t;
  }

  ensureThread(input: {
    id: string;
    ownerTrustId: string;
    titleCipher: SealedBlob;
    titleCreatedAt: string;
    titleSealMode: "session" | "user";
    channel: string;
    participants?: string[];
    peerRef?: string;
    peerHandleCipher?: SealedBlob;
    providerThreadHint?: string;
  }): StoredThread {
    const existing = this.threads.get(input.id);
    if (existing) {
      if (existing.ownerTrustId !== input.ownerTrustId) {
        throw new Error("thread_owner_conflict");
      }
      return existing;
    }
    const now = new Date().toISOString();
    const thread: StoredThread = {
      id: input.id,
      ownerTrustId: input.ownerTrustId,
      titleCipher: input.titleCipher,
      titleCreatedAt: input.titleCreatedAt,
      titleSealMode: input.titleSealMode,
      channel: input.channel,
      peerRef: input.peerRef,
      peerHandleCipher: input.peerHandleCipher,
      providerThreadHint: input.providerThreadHint,
      updatedAt: now,
      unreadCount: 0,
      participants: input.participants ?? [],
    };
    this.threads.set(thread.id, thread);
    this.messages.set(thread.id, []);
    return thread;
  }

  listMessages(ownerTrustId: string, threadId: string): StoredMessage[] {
    const thread = this.getThread(ownerTrustId, threadId);
    if (!thread) return [];
    return [...(this.messages.get(threadId) ?? [])].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  appendMessage(msg: StoredMessage): StoredMessage {
    const thread = this.getThread(msg.ownerTrustId, msg.threadId);
    if (!thread) throw new Error("thread_not_found");
    const list = this.messages.get(msg.threadId) ?? [];
    list.push(msg);
    this.messages.set(msg.threadId, list);
    thread.updatedAt = msg.createdAt;
    if (msg.direction === "inbound") thread.unreadCount += 1;
    return msg;
  }

  clear() {
    this.threads.clear();
    this.messages.clear();
  }
}
