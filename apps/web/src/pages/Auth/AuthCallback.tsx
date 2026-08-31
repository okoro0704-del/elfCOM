import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useAccountStore } from "../../store/accountStore";
import { useOnboardingStore } from "../../store/onboardingStore";
import { useMailStore } from "../../store/mailStore";
import { trustIdCreateUrl } from "../../lib/trustidConfig";
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
  useMailStore.getState().hydrate(trustId);
  const personalNeeded = useAccountStore.getState().needsSetup("PERSONAL");
  const onboardingNeeded = useOnboardingStore.getState().needsOnboarding();
  if (personalNeeded || onboardingNeeded) return "/onboarding";
  return "/chat";
}

function isMissingTrustIdError(err: string | null, desc: string | null): boolean {
  const blob = `${err ?? ""} ${desc ?? ""}`.toLowerCase();
  return (
    err === "login_required" ||
    err === "interaction_required" ||
    /no.*(passkey|credential|account|trust.?id)|user.?not.?found|not.?registered/.test(blob)
  );
}

/** OAuth return — exchanges code, then enters ElfCom with zero chrome. */
export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const [needsCreate, setNeedsCreate] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const err = params.get("error");
    const errDesc = params.get("error_description");

    if (err) {
      if (isMissingTrustIdError(err, errDesc)) {
        setNeedsCreate(true);
        return;
      }
      // Bounce silent failures back to login for retry / create.
      navigate(`/login?error=${encodeURIComponent(err)}`, { replace: true });
      return;
    }
    if (!code || !state) {
      navigate("/login", { replace: true });
      return;
    }

    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        const session = await exchangeOnce(code, state);
        setSession(session);
        const dest = postLoginPath(session.trustId);
        navigate(dest, { replace: true });
        window.setTimeout(() => {
          if (window.location.pathname.includes("/auth/callback")) {
            window.location.replace(dest);
          }
        }, 600);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "TrustID sign-in failed";
        if (isMissingTrustIdError(null, msg)) {
          setNeedsCreate(true);
        } else {
          setError(msg);
          started.current = false;
        }
      }
    })();
  }, [params, navigate, setSession]);

  if (needsCreate) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-6 text-foam">
        <p className="font-display text-3xl font-semibold">ElfCom</p>
        <p className="mt-6 max-w-xs text-center text-sm text-mist">
          No Trust ID found. Create one, then return here to unlock with biometrics.
        </p>
        <a
          href={trustIdCreateUrl()}
          className="mt-8 text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          Create Trust ID
        </a>
        <button
          type="button"
          className="mt-4 text-xs text-mist"
          onClick={() => navigate("/login", { replace: true })}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-6 text-foam">
      {error ? (
        <div className="w-full max-w-sm text-center">
          <p className="mb-4 text-sm text-danger" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="text-sm font-semibold text-accent"
            onClick={() => void beginTrustIdLogin({ silent: true })}
          >
            Unlock again
          </button>
        </div>
      ) : (
        <p className="text-sm text-mist animate-pulse">Unlocking…</p>
      )}
    </div>
  );
}
