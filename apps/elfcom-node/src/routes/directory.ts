import type { FastifyInstance } from "fastify";
import { requireTrustIdOrCapability } from "../middleware/trustid-auth.js";
import {
  searchDirectoryUsers,
  toDirectoryCard,
  upsertDirectoryProfile,
  type DirUser,
} from "../services/directory-registry.js";

export async function directoryRoutes(app: FastifyInstance) {
  app.get("/v1/directory/search", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, []);
    if (reply.sent) return;

    const query = String((req.query as { query?: string }).query ?? "").trim();
    const users = searchDirectoryUsers(query).map(toDirectoryCard);
    return { query, users };
  });

  /** Publish / update the caller's Personal or Business card in the live directory. */
  app.put("/v1/directory/me", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, []);
    if (reply.sent) return;

    const body = (req.body ?? {}) as Partial<DirUser>;
    const mode = body.mode === "BUSINESS" ? "BUSINESS" : "PERSONAL";
    const displayName = String(body.displayName ?? "").trim();
    if (!displayName) {
      return reply.code(400).send({ error: "bad_request", message: "displayName required" });
    }

    const trustId = req.elfcomAuth!.sub;
    const tidHandle =
      String(body.tidHandle ?? "").trim() ||
      (mode === "PERSONAL"
        ? trustId.startsWith("TD-")
          ? trustId
          : `TD-${trustId.slice(0, 8).toUpperCase()}`
        : `$${trustId.replace(/^TD-/i, "").toLowerCase()}`);

    let businessDomain: string | undefined;
    if (mode === "BUSINESS") {
      businessDomain = String(body.businessDomain ?? "")
        .trim()
        .toLowerCase();
      if (!businessDomain || !/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(businessDomain)) {
        return reply.code(400).send({
          error: "bad_request",
          message: "businessDomain required for BUSINESS mode",
        });
      }
    }

    const user = upsertDirectoryProfile({
      trustId,
      tidHandle,
      displayName,
      bio: String(body.bio ?? "").trim() || undefined,
      avatarUrl: (body.avatarUrl as string | null | undefined) ?? null,
      mode,
      businessDomain,
    });

    return { user: toDirectoryCard(user) };
  });
}
