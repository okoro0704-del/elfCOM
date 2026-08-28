import { useCallback, useEffect, useState } from "react";
import type { ElfComConsoleClient } from "../lib/api";
import type { OpenedMessage } from "../lib/types";

const POLL_MS = Number(import.meta.env.VITE_POLL_MS ?? 4000);

export function useThreadMessages(
  client: ElfComConsoleClient | null,
  bound: boolean,
  threadId: string | null,
) {
  const [messages, setMessages] = useState<OpenedMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    if (!client || !bound || !threadId) {
      setMessages([]);
      return;
    }
    try {
      const opened = await client.openMessages(threadId);
      setMessages(opened);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Messages failed");
    }
  }, [client, bound, threadId]);

  useEffect(() => {
    void refresh();
    if (!bound || !client || !threadId) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh, bound, client, threadId]);

  const send = useCallback(
    async (body: string) => {
      if (!client || !threadId) return;
      setSending(true);
      try {
        await client.sendReply(threadId, body);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Send failed");
        throw err;
      } finally {
        setSending(false);
      }
    },
    [client, threadId, refresh],
  );

  return { messages, error, sending, refresh, send };
}
