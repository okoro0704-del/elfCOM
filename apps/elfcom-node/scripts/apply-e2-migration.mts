import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const sql = readFileSync(
  new URL("../prisma/migrations/20260922060000_e2_thread_dm_unique/migration.sql", import.meta.url),
  "utf8",
);
const p = new PrismaClient();
// Split on statements carefully — DO $$ blocks contain semicolons
const parts: string[] = [];
let buf = "";
let inDo = false;
for (const line of sql.split("\n")) {
  const trimmed = line.trim();
  if (trimmed.startsWith("--") || trimmed.length === 0) {
    buf += line + "\n";
    continue;
  }
  if (trimmed.startsWith("DO $$")) inDo = true;
  buf += line + "\n";
  if (inDo && trimmed.endsWith("$$;")) {
    parts.push(buf);
    buf = "";
    inDo = false;
  } else if (!inDo && trimmed.endsWith(";")) {
    parts.push(buf);
    buf = "";
  }
}
if (buf.trim()) parts.push(buf);

for (const stmt of parts) {
  const s = stmt.trim();
  if (!s || s.split("\n").every((l) => l.trim().startsWith("--") || !l.trim())) continue;
  await p.$executeRawUnsafe(s);
}
const rows = await p.$queryRawUnsafe<{ tablename: string }[]>(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`,
);
console.log("TABLES=" + rows.map((r) => r.tablename).join(","));
await p.$disconnect();
