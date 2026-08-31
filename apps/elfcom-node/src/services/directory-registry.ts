/** Mutable directory registry — published Personal/Business cards only (no seed users). */

export type DirUser = {
  trustId: string;
  tidHandle: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string | null;
  mode: "PERSONAL" | "BUSINESS";
  businessDomain?: string;
};

/** Key = `${trustId}:${mode}` */
const published = new Map<string, DirUser>();

export function listDirectoryUsers(): DirUser[] {
  return [...published.values()];
}

export function upsertDirectoryProfile(user: DirUser): DirUser {
  const key = `${user.trustId}:${user.mode}`;
  published.set(key, user);
  return user;
}

export function searchDirectoryUsers(query: string): DirUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const needle = q.replace(/^\$/, "");
  return listDirectoryUsers().filter(
    (u) =>
      u.trustId.toLowerCase().includes(q) ||
      u.tidHandle.toLowerCase().includes(needle) ||
      u.displayName.toLowerCase().includes(q) ||
      (u.businessDomain?.toLowerCase().includes(q) ?? false) ||
      (u.bio?.toLowerCase().includes(q) ?? false),
  );
}

export function toDirectoryCard(u: DirUser) {
  return {
    ...u,
    actions: {
      startChat: { kind: "chat" as const, targetTid: u.trustId },
      sendMail: {
        kind: "mail" as const,
        targetTid: u.trustId,
        addressHint:
          u.mode === "BUSINESS" && u.businessDomain
            ? `${u.tidHandle.replace(/^\$/, "")}@${u.businessDomain}`
            : undefined,
      },
      call: { kind: "call" as const, targetTid: u.trustId },
    },
  };
}
