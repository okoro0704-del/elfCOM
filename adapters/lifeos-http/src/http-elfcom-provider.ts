import { createSecretKey } from "node:crypto";
import type {
  ElfComMessage,
  ElfComThread,
  IElfComMessagingProvider,
} from "@elfcom/contract";
import { computeZkBind, derivePhaseASessionKey } from "@elfcom/crypto";
import * as jose from "jose";

export type HttpElfComProviderOptions = {
  baseUrl: string;
  /** Shared HS256 secret with ElfCom LIFEOS_JWT_SECRET. */
  nodeSecret: string;
  jwtIss?: string;
  jwtAud?: string;
  /** JWT lifetime seconds (default 300). */
  tokenTtlSeconds?: number;
  /**
   * Resolve LifeOS session id for capability + bind.
   * Default: `lifeos:${ownerTrustId}` (Phase A).
   */
  resolveSid?: (ownerTrustId: string) => string;
};

/**
 * LifeOS → ElfCom HTTP adapter implementing IElfComMessagingProvider.
 * Mints capability JWTs, ensures RAM session bind, then calls the node.
 */
export class HttpElfComProvider implements IElfComMessagingProvider {
  readonly nodeId = "elfcom" as const;
  readonly bound = true;

  private readonly baseUrl: string;
  private readonly nodeSecret: string;
  private readonly jwtIss: string;
  private readonly jwtAud: string;
  private readonly tokenTtlSeconds: number;
  private readonly resolveSid: (ownerTrustId: string) => string;
  private readonly ensuredBinds = new Set<string>();

  constructor(opts: HttpElfComProviderOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.nodeSecret = opts.nodeSecret;
    this.jwtIss = opts.jwtIss ?? "lifeos";
    this.jwtAud = opts.jwtAud ?? "elfcom";
    this.tokenTtlSeconds = opts.tokenTtlSeconds ?? 300;
    this.resolveSid = opts.resolveSid ?? ((id) => `lifeos:${id}`);
  }

  async listThreads(ownerTrustId: string): Promise<ElfComThread[]> {
    await this.ensureBind(ownerTrustId);
    const res = await this.fetch(ownerTrustId, "GET", `/v1/threads/${encodeURIComponent(ownerTrustId)}`);
    const data = (await res.json()) as { threads: ElfComThread[] };
    return data.threads ?? [];
  }

  async getThread(ownerTrustId: string, threadId: string): Promise<ElfComThread | null> {
    await this.ensureBind(ownerTrustId);
    const res = await this.fetch(ownerTrustId, "GET", `/v1/threads/${encodeURIComponent(threadId)}`, {
      okStatuses: [200, 404],
    });
    if (res.status === 404) return null;
    const data = (await res.json()) as { thread: ElfComThread };
    return data.thread ?? null;
  }

  async listMessages(ownerTrustId: string, threadId: string): Promise<ElfComMessage[]> {
    await this.ensureBind(ownerTrustId);
    const res = await this.fetch(
      ownerTrustId,
      "GET",
      `/v1/threads/${encodeURIComponent(threadId)}/messages`,
    );
    const data = (await res.json()) as { messages: ElfComMessage[] };
    return data.messages ?? [];
  }

  async sendMessage(input: {
    ownerTrustId: string;
    threadId: string;
    body: string;
  }): Promise<ElfComMessage> {
    await this.ensureBind(input.ownerTrustId);
    const res = await this.fetch(input.ownerTrustId, "POST", "/v1/messages/send", {
      body: {
        recipientId: input.ownerTrustId,
        threadId: input.threadId,
        body: input.body,
      },
    });
    const data = (await res.json()) as { message: ElfComMessage };
    return data.message;
  }

  /** Primitive batch helper for HospitalityOS / LifeOS shells. */
  async sendBatch(
    ownerTrustId: string,
    messages: Array<{ threadId?: string; body: string; channel?: string }>,
  ): Promise<ElfComMessage[]> {
    await this.ensureBind(ownerTrustId);
    const res = await this.fetch(ownerTrustId, "POST", "/v1/messages/batch", {
      body: {
        messages: messages.map((m) => ({
          recipientId: ownerTrustId,
          ...m,
        })),
      },
    });
    const data = (await res.json()) as { results: Array<{ message: ElfComMessage }> };
    return data.results.map((r) => r.message);
  }

  /** WebSocket URL for realtime bus (console / shell frontends). */
  eventsUrl(ownerTrustId: string, accessToken: string, tenantId?: string): string {
    const base = this.baseUrl.replace(/^http/, "ws");
    const qs = new URLSearchParams({ access_token: accessToken });
    if (tenantId) qs.set("tenantId", tenantId);
    void ownerTrustId;
    return `${base}/v1/events?${qs}`;
  }

  /** Drop cached bind marker (call on LifeOS logout). */
  forgetBind(ownerTrustId: string) {
    const sid = this.resolveSid(ownerTrustId);
    this.ensuredBinds.delete(`${ownerTrustId}:${sid}`);
  }

  private sessionMaterial(ownerTrustId: string) {
    const sid = this.resolveSid(ownerTrustId);
    const sessionKey = derivePhaseASessionKey(this.nodeSecret, ownerTrustId, sid);
    const zk_bind = computeZkBind(sessionKey, {
      aud: this.jwtAud,
      sid,
      ownerTrustId,
    });
    return { sid, sessionKey, zk_bind };
  }

  private async ensureBind(ownerTrustId: string) {
    const { sid, sessionKey, zk_bind } = this.sessionMaterial(ownerTrustId);
    const cacheKey = `${ownerTrustId}:${sid}`;
    if (this.ensuredBinds.has(cacheKey)) return;

    const token = await this.mintJwt(ownerTrustId, sid, zk_bind);
    const res = await fetch(`${this.baseUrl}/v1/session/bind`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sid,
        ownerTrustId,
        zk_bind,
        sessionKeyBase64: sessionKey.toString("base64"),
      }),
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`ElfCom session bind failed (${res.status}): ${text}`);
    }
    this.ensuredBinds.add(cacheKey);
  }

  private async mintJwt(ownerTrustId: string, sid: string, zk_bind: string): Promise<string> {
    const key = createSecretKey(Buffer.from(this.nodeSecret, "utf8"));
    return new jose.SignJWT({
      sid,
      zk_bind,
      scp: [
        "thread:read",
        "thread:write",
        "message:send",
        "session:bind",
        "channel:link",
        "events:subscribe",
      ],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(this.jwtIss)
      .setAudience(this.jwtAud)
      .setSubject(ownerTrustId)
      .setIssuedAt()
      .setExpirationTime(`${this.tokenTtlSeconds}s`)
      .sign(key);
  }

  private async fetch(
    ownerTrustId: string,
    method: string,
    path: string,
    opts?: { body?: unknown; okStatuses?: number[] },
  ): Promise<Response> {
    const { sid, zk_bind } = this.sessionMaterial(ownerTrustId);
    const token = await this.mintJwt(ownerTrustId, sid, zk_bind);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });
    const ok = opts?.okStatuses ?? [200];
    if (!ok.includes(res.status)) {
      const text = await res.text();
      throw new Error(`ElfCom ${method} ${path} failed (${res.status}): ${text}`);
    }
    return res;
  }
}
