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
      ...(lastDbError ? { error: lastDbError } : {}),
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
 * Production requires DATABASE_URL and a working Postgres — fail closed.
 * Development may use memory when DATABASE_URL is unset (tests).
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
    if (!config.isDev) {
      throw new Error(`PostgreSQL unavailable at startup: ${lastDbError}`);
    }
    console.warn(
      "[elfcom] PostgreSQL unavailable — falling back to MemoryMessageStore (dev only)",
      lastDbError,
    );
    store = new MemoryMessageStore();
    return store;
  }
}

export async function pingDatabase(): Promise<boolean> {
  if (!prisma) {
    dbReady = false;
    return false;
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbReady = true;
    lastDbError = null;
    return true;
  } catch (err) {
    dbReady = false;
    lastDbError = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/** Test helper — force a store instance. */
export function __setMessageStoreForTests(next: MessageStore | null) {
  store = next;
  dbReady = next?.kind === "postgres";
}
