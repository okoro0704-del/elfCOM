/**
 * PostgreSQL-backed message store — durable source of truth for threads/messages.
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import type { SealedBlob } from "@elfcom/contract";
import type {
  EnsureThreadInput,
  ListMessagesOpts,
  ListThreadsOpts,
  MessageStore,
  StoredMessage,
  StoredThread,
} from "./types.js";

function parseCipher(json: string): SealedBlob {
  return JSON.parse(json) as SealedBlob;
}

function rowToThread(row: {
  id: string;
  ownerTrustId: string;
  channel: string;
  peerRef: string | null;
  titleCipherJson: string;
  titleCreatedAt: Date;
  titleSealMode: string;
  peerHandleCipher: string | null;
  providerThreadHint: string | null;
  participantsJson: string;
  unreadCount: number;
  updatedAt: Date;
}): StoredThread {
  return {
    id: row.id,
    ownerTrustId: row.ownerTrustId,
    channel: row.channel,
    peerRef: row.peerRef ?? undefined,
    titleCipher: parseCipher(row.titleCipherJson),
    titleCreatedAt: row.titleCreatedAt.toISOString(),
    titleSealMode: row.titleSealMode === "session" ? "session" : "user",
    peerHandleCipher: row.peerHandleCipher
      ? parseCipher(row.peerHandleCipher)
      : undefined,
    providerThreadHint: row.providerThreadHint ?? undefined,
    participants: JSON.parse(row.participantsJson || "[]") as string[],
    unreadCount: row.unreadCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToMessage(row: {
  id: string;
  threadId: string;
  ownerTrustId: string;
  senderId: string;
  channel: string;
  direction: string;
  sealMode: string;
  bodyCipherJson: string;
  createdAt: Date;
}): StoredMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    ownerTrustId: row.ownerTrustId,
    senderId: row.senderId,
    channel: row.channel,
    direction: row.direction === "inbound" ? "inbound" : "outbound",
    sealMode: row.sealMode === "session" ? "session" : "user",
    bodyCipher: parseCipher(row.bodyCipherJson),
    createdAt: row.createdAt.toISOString(),
  };
}

export class PostgresMessageStore implements MessageStore {
  readonly kind = "postgres" as const;

  constructor(private readonly prisma: PrismaClient) {}

  async listThreads(ownerTrustId: string, opts?: ListThreadsOpts): Promise<StoredThread[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
    const rows = await this.prisma.thread.findMany({
      where: {
        ownerTrustId,
        ...(opts?.channel ? { channel: opts.channel } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToThread);
  }

  async getThread(ownerTrustId: string, threadId: string): Promise<StoredThread | null> {
    const row = await this.prisma.thread.findFirst({
      where: { id: threadId, ownerTrustId },
    });
    return row ? rowToThread(row) : null;
  }

  async findDmByPeer(ownerTrustId: string, peerRef: string): Promise<StoredThread | null> {
    const row = await this.prisma.thread.findFirst({
      where: { ownerTrustId, channel: "dm", peerRef },
    });
    return row ? rowToThread(row) : null;
  }

  async ensureThread(input: EnsureThreadInput): Promise<StoredThread> {
    if (input.channel === "dm" && input.peerRef) {
      const byPeer = await this.findDmByPeer(input.ownerTrustId, input.peerRef);
      if (byPeer) return byPeer;
    }

    const existing = await this.prisma.thread.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.ownerTrustId !== input.ownerTrustId) {
        throw new Error("thread_owner_conflict");
      }
      return rowToThread(existing);
    }

    try {
      const created = await this.prisma.thread.create({
        data: {
          id: input.id,
          ownerTrustId: input.ownerTrustId,
          channel: input.channel,
          peerRef: input.peerRef ?? null,
          titleCipherJson: JSON.stringify(input.titleCipher),
          titleCreatedAt: new Date(input.titleCreatedAt),
          titleSealMode: input.titleSealMode,
          peerHandleCipher: input.peerHandleCipher
            ? JSON.stringify(input.peerHandleCipher)
            : null,
          providerThreadHint: input.providerThreadHint ?? null,
          participantsJson: JSON.stringify(input.participants ?? []),
          unreadCount: 0,
        },
      });
      return rowToThread(created);
    } catch (err) {
      // Unique race on id or (owner, channel, peer)
      if (isUniqueViolation(err)) {
        if (input.channel === "dm" && input.peerRef) {
          const again = await this.findDmByPeer(input.ownerTrustId, input.peerRef);
          if (again) return again;
        }
        const again = await this.prisma.thread.findUnique({ where: { id: input.id } });
        if (again && again.ownerTrustId === input.ownerTrustId) return rowToThread(again);
      }
      throw err;
    }
  }

  async listMessages(
    ownerTrustId: string,
    threadId: string,
    opts?: ListMessagesOpts,
  ): Promise<StoredMessage[]> {
    const thread = await this.getThread(ownerTrustId, threadId);
    if (!thread) return [];
    const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);

    const rows = await this.prisma.message.findMany({
      where: {
        threadId,
        ownerTrustId,
        ...(opts?.afterCreatedAt
          ? {
              OR: [
                { createdAt: { gt: new Date(opts.afterCreatedAt) } },
                ...(opts.afterId
                  ? [
                      {
                        createdAt: new Date(opts.afterCreatedAt),
                        id: { gt: opts.afterId },
                      },
                    ]
                  : []),
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    return rows.map(rowToMessage);
  }

  async appendMessage(msg: StoredMessage): Promise<StoredMessage> {
    const result = await this.commitMessage({
      thread: { existingId: msg.threadId, ownerTrustId: msg.ownerTrustId },
      message: msg,
    });
    return result.message;
  }

  async commitMessage(input: {
    thread: EnsureThreadInput | { existingId: string; ownerTrustId: string };
    message: StoredMessage;
    patchPeerRef?: string;
  }): Promise<{ thread: StoredThread; message: StoredMessage }> {
    // Postgres aborts the whole TX on unique violation — never continue after P2002;
    // retry the interactive transaction from scratch instead.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            let threadRow;

            if ("existingId" in input.thread) {
              threadRow = await tx.thread.findFirst({
                where: {
                  id: input.thread.existingId,
                  ownerTrustId: input.thread.ownerTrustId,
                },
              });
              if (!threadRow) throw new Error("thread_not_found");
            } else {
              const ensure = input.thread;
              if (ensure.channel === "dm" && ensure.peerRef) {
                const byPeer = await tx.thread.findFirst({
                  where: {
                    ownerTrustId: ensure.ownerTrustId,
                    channel: "dm",
                    peerRef: ensure.peerRef,
                  },
                });
                if (byPeer) threadRow = byPeer;
              }
              if (!threadRow) {
                threadRow = await tx.thread.findUnique({ where: { id: ensure.id } });
                if (threadRow && threadRow.ownerTrustId !== ensure.ownerTrustId) {
                  throw new Error("thread_owner_conflict");
                }
              }
              if (!threadRow) {
                // Let P2002 bubble — outer loop retries after concurrent creator wins.
                threadRow = await tx.thread.create({
                  data: {
                    id: ensure.id,
                    ownerTrustId: ensure.ownerTrustId,
                    channel: ensure.channel,
                    peerRef: ensure.peerRef ?? null,
                    titleCipherJson: JSON.stringify(ensure.titleCipher),
                    titleCreatedAt: new Date(ensure.titleCreatedAt),
                    titleSealMode: ensure.titleSealMode,
                    peerHandleCipher: ensure.peerHandleCipher
                      ? JSON.stringify(ensure.peerHandleCipher)
                      : null,
                    providerThreadHint: ensure.providerThreadHint ?? null,
                    participantsJson: JSON.stringify(ensure.participants ?? []),
                    unreadCount: 0,
                  },
                });
              }
            }

            if (input.patchPeerRef && !threadRow.peerRef) {
              const participants = JSON.parse(threadRow.participantsJson || "[]") as string[];
              if (!participants.includes(input.patchPeerRef)) {
                participants.push(input.patchPeerRef);
              }
              threadRow = await tx.thread.update({
                where: { id: threadRow.id },
                data: {
                  peerRef: input.patchPeerRef,
                  participantsJson: JSON.stringify(participants),
                },
              });
            }

            const msg = input.message;
            const existingMsg = await tx.message.findUnique({
              where: {
                id_ownerTrustId: { id: msg.id, ownerTrustId: threadRow.ownerTrustId },
              },
            });
            if (existingMsg) {
              return {
                thread: rowToThread(threadRow),
                message: rowToMessage(existingMsg),
              };
            }

            const createdMsg = await tx.message.create({
              data: {
                id: msg.id,
                threadId: threadRow.id,
                ownerTrustId: threadRow.ownerTrustId,
                senderId: msg.senderId,
                channel: msg.channel,
                direction: msg.direction,
                sealMode: msg.sealMode,
                bodyCipherJson: JSON.stringify(msg.bodyCipher),
                createdAt: new Date(msg.createdAt),
              },
            });

            const unreadInc = msg.direction === "inbound" ? 1 : 0;
            threadRow = await tx.thread.update({
              where: { id: threadRow.id },
              data: {
                updatedAt: new Date(msg.createdAt),
                unreadCount: { increment: unreadInc },
              },
            });

            return {
              thread: rowToThread(threadRow),
              message: rowToMessage(createdMsg),
            };
          },
          { maxWait: 15_000, timeout: 60_000 },
        );
      } catch (err) {
        lastErr = err;
        if (isUniqueViolation(err)) continue;
        throw err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("commit_message_failed");
  }

  async clear(): Promise<void> {
    await this.prisma.message.deleteMany({});
    await this.prisma.thread.deleteMany({});
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

export type { Prisma };
