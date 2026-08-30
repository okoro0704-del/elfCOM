import type { FastifyInstance } from "fastify";
import { requireTrustIdOrCapability } from "../middleware/trustid-auth.js";

type DirUser = {
  trustId: string;
  tidHandle: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string | null;
  mode: "PERSONAL" | "BUSINESS";
  businessDomain?: string;
};

const DIRECTORY: DirUser[] = [
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

export async function directoryRoutes(app: FastifyInstance) {
  app.get("/v1/directory/search", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, []);
    if (reply.sent) return;

    const query = String((req.query as { query?: string }).query ?? "").trim();
    const q = query.toLowerCase();
    const users = !q
      ? []
      : DIRECTORY.filter(
          (u) =>
            u.trustId.toLowerCase().includes(q) ||
            u.tidHandle.toLowerCase().includes(q.replace(/^\$/, "")) ||
            u.displayName.toLowerCase().includes(q) ||
            (u.businessDomain?.toLowerCase().includes(q) ?? false),
        ).map((u) => ({
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
        }));

    return { query, users };
  });
}
