import type { CallType, SignalingConfig } from "./types.js";

export type RemoteCallEvent =
  | {
      typ: "call.ready";
      userId: string;
      ts: string;
    }
  | {
      typ: "call.invite";
      callId: string;
      fromTid: string;
      toTid: string;
      callType: CallType;
      ts: string;
    }
  | {
      typ: "call.accepted";
      callId: string;
      fromTid: string;
      toTid: string;
      callType: CallType;
      ts: string;
    }
  | {
      typ: "call.signal";
      callId: string;
      fromTid: string;
      toTid: string;
      kind: "offer" | "answer" | "ice" | "hangup";
      payload: unknown;
      callType: CallType;
      ts: string;
    }
  | {
      typ: "call.ended";
      callId: string;
      fromTid: string;
      toTid: string;
      callType: CallType;
      ts: string;
    };

type EventHandler = (ev: RemoteCallEvent) => void;

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function toWsUrl(httpBase: string, path: string, token: string): string {
  const u = new URL(joinUrl(httpBase, path));
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.searchParams.set("access_token", token);
  return u.toString();
}

/** Persistent signaling channel: HTTP create/signal + WebSocket push. */
export class CallSignalingClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private readonly handlers = new Set<EventHandler>();

  constructor(private readonly config: SignalingConfig) {}

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  connect() {
    this.closed = false;
    this.openSocket();
  }

  disconnect() {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  async createCall(targetTid: string, type: CallType): Promise<{ id: string }> {
    const data = await this.postJson("/v1/calls", { targetTid, type });
    const call = data.call as { id?: string } | undefined;
    if (!call?.id) throw new Error("call create returned no id");
    return { id: call.id };
  }

  async acceptCall(callId: string): Promise<void> {
    await this.postJson(`/v1/calls/${encodeURIComponent(callId)}/accept`, {});
  }

  async sendSignal(
    callId: string,
    kind: "offer" | "answer" | "ice" | "hangup",
    payload: unknown,
  ): Promise<void> {
    await this.postJson(`/v1/calls/${encodeURIComponent(callId)}/signal`, { kind, payload });
  }

  async hangup(callId: string): Promise<void> {
    await this.postJson(`/v1/calls/${encodeURIComponent(callId)}/hangup`, {});
  }

  private openSocket() {
    if (this.closed) return;
    const token = this.config.getAccessToken()?.trim();
    if (!token || !this.config.baseUrl.trim()) return;

    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }

    const ws = new WebSocket(toWsUrl(this.config.baseUrl, "/v1/calls/ws", token));
    this.ws = ws;

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as RemoteCallEvent;
        for (const h of this.handlers) h(data);
      } catch {
        /* ignore bad frames */
      }
    };

    ws.onclose = () => {
      if (this.closed) return;
      this.reconnectTimer = setTimeout(() => this.openSocket(), 2000);
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  private async postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
    const token = this.config.getAccessToken()?.trim();
    if (!token) throw new Error("missing access token for call signaling");
    const res = await fetch(joinUrl(this.config.baseUrl, path), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`call signaling ${path} failed: ${res.status} ${text || res.statusText}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }
}
