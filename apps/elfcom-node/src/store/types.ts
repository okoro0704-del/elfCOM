import type { ElfComChannel, SealedBlob } from "@elfcom/contract";

export type StoredThread = {
  id: string;
  ownerTrustId: string;
  titleCipher: SealedBlob;
  titleCreatedAt: string;
  titleSealMode: "session" | "user";
  channel: ElfComChannel | string;
  peerRef?: string;
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

export type EnsureThreadInput = {
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
};

export type ListThreadsOpts = {
  channel?: string;
  limit?: number;
};

export type ListMessagesOpts = {
  limit?: number;
  /** ISO createdAt cursor — return messages strictly after this timestamp/id pair. */
  afterCreatedAt?: string;
  afterId?: string;
};

/**
 * Durable messaging store — Postgres in production, memory for tests only.
 */
export interface MessageStore {
  readonly kind: "memory" | "postgres";

  listThreads(ownerTrustId: string, opts?: ListThreadsOpts): Promise<StoredThread[]>;
  getThread(ownerTrustId: string, threadId: string): Promise<StoredThread | null>;
  findDmByPeer(ownerTrustId: string, peerRef: string): Promise<StoredThread | null>;
  ensureThread(input: EnsureThreadInput): Promise<StoredThread>;
  listMessages(
    ownerTrustId: string,
    threadId: string,
    opts?: ListMessagesOpts,
  ): Promise<StoredMessage[]>;
  appendMessage(msg: StoredMessage): Promise<StoredMessage>;
  /**
   * Atomically ensure thread + append message (+ bump unread/updatedAt).
   * Used for outbound/inbound so WS never fires before durable commit.
   */
  commitMessage(input: {
    thread: EnsureThreadInput | { existingId: string; ownerTrustId: string };
    message: StoredMessage;
    patchPeerRef?: string;
  }): Promise<{ thread: StoredThread; message: StoredMessage }>;
  clear(): Promise<void>;
}
