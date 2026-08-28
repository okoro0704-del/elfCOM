import { useCallback, useEffect, useState } from "react";
import type { ElfComConsoleClient } from "../lib/api";
import type { ElfComChannel, OpenedThread } from "../lib/types";

const POLL_MS = Number(import.meta.env.VITE_POLL_MS ?? 4000);

export function useInbox(
  client: ElfComConsoleClient | null,
  bound: boolean,
  channel: ElfComChannel | "all",
) {
  const [threads, setThreads] = useState<OpenedThread[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!client || !bound) return;
    setLoading(true);
    try {
      const opened = await client.openInbox(channel);
      setThreads(opened);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inbox refresh failed");
    } finally {
      setLoading(false);
    }
  }, [client, bound, channel]);

  useEffect(() => {
    void refresh();
    if (!bound || !client) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh, bound, client]);

  return { threads, error, loading, refresh };
}
