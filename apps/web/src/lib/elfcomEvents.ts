/**
 * ElfCom /v1/events WebSocket with reconnect and single-subscription discipline.
 * Auth: TrustID access token (query). No capability secret.
 */

export type ElfComConnectionStatus =
  | "idle"
  | "connecting"
  | "online"
  | "reconnecting"
  | "offline";

export type ElfComRealtimeEvent = {
  typ: string;
  userId?: string;
  threadId?: string;
  messageId?: string;
  channel?: string;
  ts?: string;
  meta?: Record<string, unknown>;
};

export type ElfComEventsHandle = {
  close: () => void;
};

function wsUrl(baseHttp: string, accessToken: string): string {
  const u = new URL(baseHttp);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/v1/events";
  u.search = `access_token=${encodeURIComponent(accessToken)}`;
  return u.toString();
}

export function connectElfComEvents(input: {
  baseUrl: string;
  accessToken: string;
  onEvent: (ev: ElfComRealtimeEvent) => void;
  onStatus: (status: ElfComConnectionStatus) => void;
}): ElfComEventsHandle {
  let closed = false;
  let ws: WebSocket | null = null;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let intentionalClose = false;

  const clearTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed || intentionalClose) return;
    clearTimer();
    attempt += 1;
    const delay = Math.min(30_000, 800 * 2 ** Math.min(attempt, 5));
    input.onStatus("reconnecting");
    reconnectTimer = setTimeout(open, delay);
  };

  const open = () => {
    if (closed) return;
    clearTimer();
    input.onStatus(attempt === 0 ? "connecting" : "reconnecting");
    try {
      ws = new WebSocket(wsUrl(input.baseUrl, input.accessToken));
    } catch {
      input.onStatus("offline");
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      attempt = 0;
      input.onStatus("online");
    };
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(String(msg.data)) as ElfComRealtimeEvent;
        if (data && typeof data.typ === "string") input.onEvent(data);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onerror = () => {
      /* close handler drives reconnect */
    };
    ws.onclose = () => {
      ws = null;
      if (closed || intentionalClose) {
        input.onStatus("offline");
        return;
      }
      scheduleReconnect();
    };
  };

  open();

  return {
    close: () => {
      closed = true;
      intentionalClose = true;
      clearTimer();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
      input.onStatus("offline");
    },
  };
}
