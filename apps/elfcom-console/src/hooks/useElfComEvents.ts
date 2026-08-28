import { useEffect, useRef } from "react";
import type { ElfComConsoleClient } from "../lib/api";

type RealtimeEvent = {
  typ: string;
  userId?: string;
  threadId?: string;
  messageId?: string;
  ts?: string;
};

/**
 * Subscribe to ElfCom WS bus; falls back silently if WS unavailable (polling remains).
 */
export function useElfComEvents(
  client: ElfComConsoleClient | null,
  bound: boolean,
  onEvent: (ev: RealtimeEvent) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!client || !bound) return;
    let ws: WebSocket | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const token = await client.mintAccessToken();
        const proto = window.location.protocol === "https:" ? "wss" : "ws";
        const host = window.location.host;
        const url = `${proto}://${host}/v1/events?access_token=${encodeURIComponent(token)}`;
        ws = new WebSocket(url);
        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(String(msg.data)) as RealtimeEvent;
            onEventRef.current(data);
          } catch {
            /* ignore */
          }
        };
      } catch {
        /* polling remains active */
      }
    })();

    return () => {
      cancelled = true;
      void cancelled;
      ws?.close();
    };
  }, [client, bound]);
}
