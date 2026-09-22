import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const rows = await p.$queryRawUnsafe<{ tablename: string }[]>(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
);
console.log("TABLES=" + rows.map((r) => r.tablename).join(","));
await p.$disconnect();
