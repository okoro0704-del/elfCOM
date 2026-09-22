import type {
  EnsureThreadInput,
  ListMessagesOpts,
  ListThreadsOpts,
  MessageStore,
  StoredMessage,
  StoredThread,
} from "./types.js";

/**
 * In-memory message store — tests / explicit non-production only.
 * Not selected when NODE_ENV=production.
 */
export class MemoryMessageStore implements MessageStore {
  readonly kind = "memory" as const;
  private readonly threads = new Map<string, StoredThread>();
  private readonly messages = new Map<string, StoredMessage[]>();

  async listThreads(ownerTrustId: string, opts?: ListThreadsOpts): Promise<StoredThread[]> {
    const limit = opts?.limit ?? 100;
    return [...this.threads.values()]
      .filter((t) => t.ownerTrustId === ownerTrustId)
      .filter((t) => !opts?.channel || t.channel === opts.channel)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  async getThread(ownerTrustId: string, threadId: string): Promise<StoredThread | null> {
    const t = this.threads.get(threadId);
    if (!t || t.ownerTrustId !== ownerTrustId) return null;
    return t;
  }

  async findDmByPeer(ownerTrustId: string, peerRef: string): Promise<StoredThread | null> {
    return (
      [...this.threads.values()].find(
        (t) => t.ownerTrustId === ownerTrustId && t.channel === "dm" && t.peerRef === peerRef,
      ) ?? null
    );
  }

  async ensureThread(input: EnsureThreadInput): Promise<StoredThread> {
    const existing = this.threads.get(input.id);
    if (existing) {
      if (existing.ownerTrustId !== input.ownerTrustId) {
        throw new Error("thread_owner_conflict");
      }
      return existing;
    }
    if (input.channel === "dm" && input.peerRef) {
      const byPeer = await this.findDmByPeer(input.ownerTrustId, input.peerRef);
      if (byPeer) return byPeer;
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

  async listMessages(
    ownerTrustId: string,
    threadId: string,
    opts?: ListMessagesOpts,
  ): Promise<StoredMessage[]> {
    const thread = await this.getThread(ownerTrustId, threadId);
    if (!thread) return [];
    const limit = opts?.limit ?? 200;
    let list = [...(this.messages.get(threadId) ?? [])].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
    if (opts?.afterCreatedAt) {
      list = list.filter((m) => {
        const cmp = m.createdAt.localeCompare(opts.afterCreatedAt!);
        if (cmp > 0) return true;
        if (cmp < 0) return false;
        return opts.afterId ? m.id.localeCompare(opts.afterId) > 0 : false;
      });
    }
    return list.slice(0, limit);
  }

  async appendMessage(msg: StoredMessage): Promise<StoredMessage> {
    const thread = await this.getThread(msg.ownerTrustId, msg.threadId);
    if (!thread) throw new Error("thread_not_found");
    const list = this.messages.get(msg.threadId) ?? [];
    if (list.some((m) => m.id === msg.id)) {
      return list.find((m) => m.id === msg.id)!;
    }
    list.push(msg);
    this.messages.set(msg.threadId, list);
    thread.updatedAt = msg.createdAt;
    if (msg.direction === "inbound") thread.unreadCount += 1;
    return msg;
  }

  async commitMessage(input: {
    thread: EnsureThreadInput | { existingId: string; ownerTrustId: string };
    message: StoredMessage;
    patchPeerRef?: string;
  }): Promise<{ thread: StoredThread; message: StoredMessage }> {
    let thread: StoredThread | null;
    if ("existingId" in input.thread) {
      thread = await this.getThread(input.thread.ownerTrustId, input.thread.existingId);
      if (!thread) throw new Error("thread_not_found");
    } else {
      thread = await this.ensureThread(input.thread);
    }
    if (input.patchPeerRef && !thread.peerRef) {
      thread.peerRef = input.patchPeerRef;
      if (!thread.participants.includes(input.patchPeerRef)) {
        thread.participants = [...thread.participants, input.patchPeerRef];
      }
    }
    const message = await this.appendMessage({
      ...input.message,
      threadId: thread.id,
      ownerTrustId: thread.ownerTrustId,
    });
    return { thread, message };
  }

  async clear(): Promise<void> {
    this.threads.clear();
    this.messages.clear();
  }
}
