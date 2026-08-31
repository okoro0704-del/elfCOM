import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useAccountStore } from "../../store/accountStore";
import { useOnboardingStore } from "../../store/onboardingStore";
import { beginTrustIdLogin, resolveTrustIdSession } from "../../lib/trustidOAuth";

/** Deduplicate one-time OAuth code exchange across React StrictMode remounts. */
const exchangeByCode = new Map<
  string,
  Promise<{ accessToken: string; trustId: string; expiresAt?: string }>
>();

function exchangeOnce(code: string, state: string) {
  const existing = exchangeByCode.get(code);
  if (existing) return existing;
  const job = resolveTrustIdSession(code, state);
  exchangeByCode.set(code, job);
  job.catch(() => exchangeByCode.delete(code));
  return job;
}

function postLoginPath(trustId: string): string {
  useAccountStore.getState().hydrate(trustId);
  useOnboardingStore.getState().hydrate(trustId);
  const personalNeeded = useAccountStore.getState().needsSetup("PERSONAL");
  const onboardingNeeded = useOnboardingStore.getState().needsOnboarding();
  if (personalNeeded || onboardingNeeded) return "/onboarding";
  return "/chat";
}

/** OAuth return — exchanges code for TrustID access token, then enters ElfCom. */
export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Finishing TrustID sign-in…");
  const started = useRef(false);

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const err = params.get("error");
    const errDesc = params.get("error_description");

    if (err) {
      setError(errDesc || err);
      return;
    }
    if (!code || !state) {
      setError("Missing TrustID authorization code");
      return;
    }

    // Prevent double-start from StrictMode; shared promise still dedupes network.
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        setStatus("Exchanging TrustID credentials…");
        const session = await exchangeOnce(code, state);
        setStatus("Opening ElfCom…");
        setSession(session);
        const dest = postLoginPath(session.trustId);
        // Always navigate — ignore StrictMode cleanup races.
        navigate(dest, { replace: true });
        // Hard fallback if router stalls (rare on some mobile WebViews).
        window.setTimeout(() => {
          if (window.location.pathname.includes("/auth/callback")) {
            window.location.replace(dest);
          }
        }, 800);
      } catch (e) {
        setError(e instanceof Error ? e.message : "TrustID sign-in failed");
        started.current = false;
      }
    })();
  }, [params, navigate, setSession]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-6 text-foam">
      {error ? (
        <div className="w-full max-w-sm text-center">
          <p className="mb-4 text-sm text-danger" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink"
            onClick={() => void beginTrustIdLogin()}
          >
            Try TrustID again
          </button>
          <button
            type="button"
            className="mt-3 block w-full text-sm text-mist"
            onClick={() => navigate("/login", { replace: true })}
          >
            Back to login
          </button>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm text-mist">{status}</p>
          <p className="mt-2 text-xs text-mist/70">Usually takes a few seconds</p>
        </div>
      )}
    </div>
  );
}
