/** Pure message merge helpers for ElfChat (testable without Zustand). */

export type IdBody = { id: string; createdAt: string };

export function mergeById<T extends IdBody>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  for (const m of existing) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
