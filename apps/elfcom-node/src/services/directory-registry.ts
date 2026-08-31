/** Mutable directory registry — published Personal/Business cards only (no seed users). */

export type DirUser = {
  trustId: string;
  tidHandle: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string | null;
  username?: string;
  email?: string;
  phone?: string;
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

function digits(s: string) {
  return s.replace(/\D/g, "");
}

export function searchDirectoryUsers(query: string): DirUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const needle = q.replace(/^[@$]/, "");
  const qDigits = digits(q);
  return listDirectoryUsers().filter((u) => {
    const phoneDigits = u.phone ? digits(u.phone) : "";
    return (
      u.trustId.toLowerCase().includes(q) ||
      u.tidHandle.toLowerCase().includes(needle) ||
      u.displayName.toLowerCase().includes(q) ||
      (u.username?.toLowerCase().includes(needle) ?? false) ||
      (u.email?.toLowerCase().includes(q) ?? false) ||
      (qDigits.length >= 3 && phoneDigits.includes(qDigits)) ||
      (u.businessDomain?.toLowerCase().includes(q) ?? false) ||
      (u.bio?.toLowerCase().includes(q) ?? false)
    );
  });
}

export function toDirectoryCard(u: DirUser) {
  const addressHint =
    u.mode === "BUSINESS" && u.businessDomain
      ? `${(u.username || u.tidHandle).replace(/^[@$]/, "")}@${u.businessDomain}`
      : u.email;
  return {
    ...u,
    actions: {
      startChat: { kind: "chat" as const, targetTid: u.trustId },
      sendMail: {
        kind: "mail" as const,
        targetTid: u.trustId,
        addressHint,
      },
      call: { kind: "call" as const, targetTid: u.trustId },
    },
  };
}
