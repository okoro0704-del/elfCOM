import { useCallback, useMemo, useRef, useState } from "react";
import { ElfComConsoleClient } from "../lib/api";

function readConfig() {
  return {
    baseUrl: import.meta.env.VITE_ELFCOM_BASE_URL || "",
    nodeSecret: import.meta.env.VITE_ELFCOM_NODE_SECRET || "elfcom-dev-node-secret-change-me",
    iss: import.meta.env.VITE_ELFCOM_JWT_ISS || "lifeos",
    aud: import.meta.env.VITE_ELFCOM_JWT_AUD || "elfcom",
  };
}

export function useElfComSession() {
  const clientRef = useRef<ElfComConsoleClient | null>(null);
  const [ownerTrustId, setOwnerTrustId] = useState<string | null>(null);
  const [bound, setBound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const client = useMemo(() => {
    if (!clientRef.current) {
      clientRef.current = new ElfComConsoleClient(readConfig());
    }
    return clientRef.current;
  }, []);

  const connect = useCallback(
    async (trustId: string) => {
      setBusy(true);
      setError(null);
      try {
        await client.connect(trustId.trim());
        setOwnerTrustId(client.ownerTrustId);
        setBound(client.isBound);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connect failed");
        setBound(false);
      } finally {
        setBusy(false);
      }
    },
    [client],
  );

  const disconnect = useCallback(() => {
    client.disconnect();
    setOwnerTrustId(null);
    setBound(false);
    setError(null);
  }, [client]);

  return { client, ownerTrustId, bound, error, busy, connect, disconnect };
}
