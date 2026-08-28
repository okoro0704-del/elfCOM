import { openUtf8 } from "./crypto";
import {
  createSessionMaterial,
  destroySession,
  mintCapabilityJwt,
  sessionKeyBase64,
} from "./session";
import type {
  ElfComChannel,
  OpenedMessage,
  OpenedThread,
  SealedMessageEnvelope,
  SealedThreadEnvelope,
  SessionMaterial,
} from "./types";

export type ElfComClientConfig = {
  baseUrl: string;
  nodeSecret: string;
  iss?: string;
  aud?: string;
};

export class ElfComConsoleClient {
  private material: SessionMaterial | null = null;
  private bound = false;

  constructor(private readonly cfg: ElfComClientConfig) {}

  get ownerTrustId() {
    return this.material?.ownerTrustId ?? null;
  }

  get isBound() {
    return this.bound && !!this.material;
  }

  /** Session key stays in this instance only — never persisted. */
  getSessionKey(): Uint8Array | null {
    return this.material?.sessionKey ?? null;
  }

  async connect(ownerTrustId: string) {
    destroySession(this.material);
    this.material = await createSessionMaterial({
      ownerTrustId,
      nodeSecret: this.cfg.nodeSecret,
      aud: this.cfg.aud,
    });
    this.bound = false;
    await this.ensureBind();
  }

  disconnect() {
    destroySession(this.material);
    this.material = null;
    this.bound = false;
  }

  private async authHeaders(): Promise<HeadersInit> {
    if (!this.material) throw new Error("Not connected");
    const token = await mintCapabilityJwt({
      material: this.material,
      nodeSecret: this.cfg.nodeSecret,
      iss: this.cfg.iss,
      aud: this.cfg.aud,
    });
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  private url(path: string) {
    const base = this.cfg.baseUrl.replace(/\/$/, "");
    return `${base}${path}`;
  }

  async ensureBind() {
    if (!this.material) throw new Error("Not connected");
    if (this.bound) return;
    const headers = await this.authHeaders();
    const res = await fetch(this.url("/v1/session/bind"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        sid: this.material.sid,
        ownerTrustId: this.material.ownerTrustId,
        zk_bind: this.material.zkBind,
        sessionKeyBase64: sessionKeyBase64(this.material),
      }),
    });
    if (!res.ok && res.status !== 204) {
      const detail = (await res.text()).slice(0, 200);
      if (res.status === 404) {
        throw new Error(
          `session bind failed: 404 — elfcom-node API not found at ${this.cfg.baseUrl || "(same origin)"}. ` +
            `Set VITE_ELFCOM_BASE_URL to your API URL (Netlify only hosts the UI). ${detail}`,
        );
      }
      throw new Error(`session bind failed: ${res.status} ${detail}`);
    }
    this.bound = true;
  }

  /** Capability JWT for WebSocket subscription. */
  async mintAccessToken(): Promise<string> {
    if (!this.material) throw new Error("Not connected");
    return mintCapabilityJwt({
      material: this.material,
      nodeSecret: this.cfg.nodeSecret,
      iss: this.cfg.iss,
      aud: this.cfg.aud,
    });
  }

  async fetchInboxEnvelopes(channel?: ElfComChannel | "all"): Promise<SealedThreadEnvelope[]> {
    await this.ensureBind();
    const qs = new URLSearchParams({ envelope: "1" });
    if (channel && channel !== "all") qs.set("channel", channel);
    const res = await fetch(this.url(`/v1/inbox?${qs}`), { headers: await this.authHeaders() });
    if (!res.ok) throw new Error(`inbox failed: ${res.status}`);
    const data = (await res.json()) as { threads: SealedThreadEnvelope[] };
    return data.threads ?? [];
  }

  async openInbox(channel?: ElfComChannel | "all"): Promise<OpenedThread[]> {
    const key = this.getSessionKey();
    if (!key) throw new Error("No session key");
    const envelopes = await this.fetchInboxEnvelopes(channel);
    const opened: OpenedThread[] = [];
    for (const env of envelopes) {
      let title = env.channel ?? "Thread";
      let preview = "";
      try {
        if (env.titleCipher && env.titleAad) {
          title = await openUtf8(env.titleCipher, key, env.titleAad);
        }
        if (env.previewCipher && env.previewAad) {
          preview = await openUtf8(env.previewCipher, key, env.previewAad);
        }
      } catch {
        title = "🔒";
        preview = "";
      }
      opened.push({
        id: env.id,
        title,
        preview,
        updatedAt: env.updatedAt,
        unreadCount: env.unreadCount,
        channel: env.channel,
        peerRef: env.peerRef,
        participants: env.participants,
      });
    }
    return opened;
  }

  async fetchMessageEnvelopes(threadId: string): Promise<SealedMessageEnvelope[]> {
    await this.ensureBind();
    const res = await fetch(
      this.url(`/v1/threads/${encodeURIComponent(threadId)}/messages?envelope=1`),
      { headers: await this.authHeaders() },
    );
    if (!res.ok) throw new Error(`messages failed: ${res.status}`);
    const data = (await res.json()) as { messages: SealedMessageEnvelope[] };
    return data.messages ?? [];
  }

  async openMessages(threadId: string): Promise<OpenedMessage[]> {
    const key = this.getSessionKey();
    if (!key) throw new Error("No session key");
    const envelopes = await this.fetchMessageEnvelopes(threadId);
    const out: OpenedMessage[] = [];
    for (const env of envelopes) {
      let body = "";
      try {
        body = await openUtf8(env.bodyCipher, key, env.aad);
      } catch {
        body = "🔒 Unable to open";
      }
      out.push({
        id: env.id,
        threadId: env.threadId,
        body,
        senderId: env.senderId,
        createdAt: env.createdAt,
        channel: env.channel,
        direction: env.direction,
      });
    }
    return out;
  }

  /** Reply — routes through node to origin connector. */
  async sendReply(threadId: string, body: string): Promise<OpenedMessage> {
    await this.ensureBind();
    const res = await fetch(this.url(`/v1/threads/${encodeURIComponent(threadId)}/messages`), {
      method: "POST",
      headers: await this.authHeaders(),
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error(`send failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { message: OpenedMessage };
    return data.message;
  }

  async linkChannel(channel: ElfComChannel, handle: string) {
    await this.ensureBind();
    const res = await fetch(this.url("/v1/channels/link"), {
      method: "POST",
      headers: await this.authHeaders(),
      body: JSON.stringify({ channel, handle }),
    });
    if (!res.ok) throw new Error(`link failed: ${res.status}`);
    return res.json();
  }
}
