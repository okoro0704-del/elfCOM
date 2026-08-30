/** Mutable directory registry — seeds + user-published Personal/Business cards. */

export type DirUser = {
  trustId: string;
  tidHandle: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string | null;
  mode: "PERSONAL" | "BUSINESS";
  businessDomain?: string;
};

const SEEDS: DirUser[] = [
  {
    trustId: "TD-AMARA01",
    tidHandle: "$amara",
    displayName: "Amara Okoro",
    bio: "Front desk · Harbor Hotel",
    mode: "BUSINESS",
    businessDomain: "harbor.hotel",
  },
  {
    trustId: "TD-KOFI02",
    tidHandle: "$kofi",
    displayName: "Kofi Mensah",
    bio: "Guest relations",
    mode: "PERSONAL",
  },
  {
    trustId: "TD-SMOKE01",
    tidHandle: "$smoke",
    displayName: "Smoke Test",
    bio: "ElfCom QA identity",
    mode: "PERSONAL",
  },
  {
    trustId: "TD-MAYA03",
    tidHandle: "$maya",
    displayName: "Maya Traveler",
    bio: "Concierge desk",
    mode: "BUSINESS",
    businessDomain: "harbor.hotel",
  },
];

/** Key = `${trustId}:${mode}` */
const published = new Map<string, DirUser>();

export function listDirectoryUsers(): DirUser[] {
  const byKey = new Map<string, DirUser>();
  for (const u of SEEDS) byKey.set(`${u.trustId}:${u.mode}`, u);
  for (const [k, u] of published) byKey.set(k, u);
  return [...byKey.values()];
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
