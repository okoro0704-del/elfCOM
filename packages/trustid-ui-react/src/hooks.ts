import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createTrustIdClient } from "./client.js";
import type { DevicePairSession, SilentAssertResult, TrustIdClientConfig } from "./types.js";

export type UseSilentAssertState = {
  busy: boolean;
  error: string | null;
  result: SilentAssertResult | null;
  login: () => Promise<SilentAssertResult | null>;
  reset: () => void;
};

export function useSilentAssert(config: TrustIdClientConfig): UseSilentAssertState {
  const client = useMemo(() => createTrustIdClient(config), [config.baseUrl, config.clientId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SilentAssertResult | null>(null);

  const login = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await client.silentAssert();
      setResult(next);
      return next;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Trust ID login failed";
      setError(message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [client]);

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
  }, []);

  return { busy, error, result, login, reset };
}

export type UseDevicePairState = {
  busy: boolean;
  error: string | null;
  session: DevicePairSession | null;
  result: SilentAssertResult | null;
  start: () => Promise<DevicePairSession | null>;
  stop: () => void;
};

export function useDevicePair(
  config: TrustIdClientConfig,
  opts?: { pollMs?: number },
): UseDevicePairState {
  const client = useMemo(() => createTrustIdClient(config), [config.baseUrl, config.clientId]);
  const pollMs = opts?.pollMs ?? 2000;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<DevicePairSession | null>(null);
  const [result, setResult] = useState<SilentAssertResult | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    stop();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const next = await client.beginDevicePair();
      setSession(next);
      timer.current = setInterval(async () => {
        try {
          const status = await client.pollDevicePair(next.pairId);
          if (status.status === "approved") {
            stop();
            setResult(status.result);
          } else if (status.status === "expired") {
            stop();
            setError("QR session expired — generate a new code");
            setSession(null);
          }
        } catch (e) {
          stop();
          setError(e instanceof Error ? e.message : "Device pair failed");
        }
      }, pollMs);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start QR pairing");
      return null;
    } finally {
      setBusy(false);
    }
  }, [client, pollMs, stop]);

  return { busy, error, session, result, start, stop };
}
