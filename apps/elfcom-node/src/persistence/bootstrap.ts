/**
 * Messaging persistence bootstrap — Postgres is the durable source of truth.
 */
import { PrismaClient } from "@prisma/client";
import { config } from "../config.js";
import { MemoryMessageStore } from "../store/memory-store.js";
import { PostgresMessageStore } from "../store/postgres-store.js";
import type { MessageStore } from "../store/types.js";

let prisma: PrismaClient | null = null;
let store: MessageStore | null = null;
let dbReady = false;
let lastDbError: string | null = null;

export function getMessageStore(): MessageStore {
  if (!store) {
    throw new Error("message_store_not_initialized");
  }
  return store;
}

export function getPrismaClient(): PrismaClient | null {
  return prisma;
}

export function messagingPersistenceStatus(): {
  sourceOfTruth: "postgres" | "memory";
  database: "READY" | "UNAVAILABLE" | "NOT_CONFIGURED";
  status: "READY" | "DEGRADED";
  error?: string;
} {
  if (!store) {
    return {
      sourceOfTruth: "memory",
      database: "NOT_CONFIGURED",
      status: "DEGRADED",
      error: "not_initialized",
    };
  }
  if (store.kind === "postgres") {
    return {
      sourceOfTruth: "postgres",
      database: dbReady ? "READY" : "UNAVAILABLE",
      status: dbReady ? "READY" : "DEGRADED",
      // Raw driver errors include internal hostnames — expose a stable code only.
      ...(dbReady ? {} : { error: "database_unreachable" }),
    };
  }
  return {
    sourceOfTruth: "memory",
    database: "NOT_CONFIGURED",
    status: "READY",
  };
}

/**
 * Initialize message store.
 * Production requires DATABASE_URL. Whenever DATABASE_URL is set, an unreachable
 * Postgres fails startup in every environment. Memory is used only when the URL is
 * unset outside production (tests / isolated dev).
 */
export async function initMessageStore(): Promise<MessageStore> {
  const hasUrl = Boolean(process.env.DATABASE_URL);
  if (!hasUrl) {
    if (!config.isDev) {
      throw new Error(
        "DATABASE_URL is required in production — ElfCom messaging refuses memory fallback",
      );
    }
    store = new MemoryMessageStore();
    dbReady = false;
    lastDbError = null;
    console.warn("[elfcom] DATABASE_URL unset — using MemoryMessageStore (dev/test only)");
    return store;
  }

  try {
    prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    store = new PostgresMessageStore(prisma);
    dbReady = true;
    lastDbError = null;
    console.log("[elfcom] Messaging source of truth: PostgreSQL");
    return store;
  } catch (err) {
    lastDbError = err instanceof Error ? err.message : String(err);
    dbReady = false;
    // DATABASE_URL set means durability was requested — never pretend with memory.
    throw new Error(`PostgreSQL unavailable at startup: ${lastDbError}`);
  }
}

export async function pingDatabase(timeoutMs = 2000): Promise<boolean> {
  if (!prisma) {
    dbReady = false;
    return false;
  }
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("database_ping_timeout")), timeoutMs);
      }),
    ]);
    dbReady = true;
    lastDbError = null;
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message.trim() : String(err);
    if (dbReady || lastDbError !== message) {
      console.warn("[elfcom] Postgres health ping failed:", message);
    }
    dbReady = false;
    lastDbError = message;
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test helper — force a store instance. */
export function __setMessageStoreForTests(next: MessageStore | null) {
  store = next;
  dbReady = next?.kind === "postgres";
}
