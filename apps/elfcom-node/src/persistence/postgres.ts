/**
 * Optional Postgres persistence (Prisma).
 * When DATABASE_URL is unset, all methods no-op so memory store remains source of truth.
 */
import type { SealedBlob } from "@elfcom/contract";

type PrismaLike = {
  thread: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  message: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  channelLink: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  auditLog: {
    create: (args: unknown) => Promise<unknown>;
  };
  outboxDelivery: {
    create: (args: unknown) => Promise<unknown>;
  };
  $disconnect: () => Promise<void>;
};

let prisma: PrismaLike | null = null;
let initAttempted = false;

export function persistenceEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function getPrisma(): Promise<PrismaLike | null> {
  if (!persistenceEnabled()) return null;
  if (prisma) return prisma;
  if (initAttempted) return null;
  initAttempted = true;
  try {
    const mod = await import("@prisma/client");
    prisma = new mod.PrismaClient() as unknown as PrismaLike;
    return prisma;
  } catch (err) {
    console.warn("[elfcom] Prisma unavailable — continuing with memory store only", err);
    return null;
  }
}

export async function persistThread(input: {
  id: string;
  ownerTrustId: string;
  channel: string;
  peerRef?: string;
  titleCipher: SealedBlob;
  titleCreatedAt: string;
  titleSealMode: string;
  peerHandleCipher?: SealedBlob;
  participants: string[];
  unreadCount: number;
}) {
  const db = await getPrisma();
  if (!db) return;
  await db.thread.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      ownerTrustId: input.ownerTrustId,
      channel: input.channel,
      peerRef: input.peerRef,
      titleCipherJson: JSON.stringify(input.titleCipher),
      titleCreatedAt: new Date(input.titleCreatedAt),
      titleSealMode: input.titleSealMode,
      peerHandleCipher: input.peerHandleCipher
        ? JSON.stringify(input.peerHandleCipher)
        : null,
      participantsJson: JSON.stringify(input.participants),
      unreadCount: input.unreadCount,
    },
    update: {
      unreadCount: input.unreadCount,
      peerRef: input.peerRef,
      updatedAt: new Date(),
    },
  });
}

export async function persistMessage(input: {
  id: string;
  threadId: string;
  ownerTrustId: string;
  senderId: string;
  channel: string;
  direction: string;
  sealMode: string;
  bodyCipher: SealedBlob;
  createdAt: string;
}) {
  const db = await getPrisma();
  if (!db) return;
  await db.message.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      threadId: input.threadId,
      ownerTrustId: input.ownerTrustId,
      senderId: input.senderId,
      channel: input.channel,
      direction: input.direction,
      sealMode: input.sealMode,
      bodyCipherJson: JSON.stringify(input.bodyCipher),
      createdAt: new Date(input.createdAt),
    },
    update: {},
  });
}

export async function persistChannelLink(input: {
  ownerTrustId: string;
  channel: string;
  handleBlindIndex: string;
  handleCipherJson?: string;
}) {
  const db = await getPrisma();
  if (!db) return;
  await db.channelLink.upsert({
    where: {
      channel_handleBlindIndex: {
        channel: input.channel,
        handleBlindIndex: input.handleBlindIndex,
      },
    },
    create: {
      ownerTrustId: input.ownerTrustId,
      channel: input.channel,
      handleBlindIndex: input.handleBlindIndex,
      handleCipherJson: input.handleCipherJson,
    },
    update: {
      ownerTrustId: input.ownerTrustId,
      handleCipherJson: input.handleCipherJson,
    },
  });
}

export async function persistAudit(input: {
  ownerTrustId?: string;
  op: string;
  channel?: string;
  threadId?: string;
  messageId?: string;
  meta?: Record<string, unknown>;
}) {
  const db = await getPrisma();
  if (!db) return;
  await db.auditLog.create({
    data: {
      ownerTrustId: input.ownerTrustId,
      op: input.op,
      channel: input.channel,
      threadId: input.threadId,
      messageId: input.messageId,
      metaJson: input.meta ? JSON.stringify(input.meta) : null,
    },
  });
}

export async function persistOutbox(input: {
  ownerTrustId: string;
  threadId: string;
  messageId: string;
  channel: string;
  status: string;
  attempts: number;
  lastError?: string;
  providerMessageId?: string;
}) {
  const db = await getPrisma();
  if (!db) return;
  await db.outboxDelivery.create({
    data: input,
  });
}
