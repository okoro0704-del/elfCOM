import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { exchangeTrustIdCode, fetchTrustIdUserInfo } from "../../lib/trustidOAuth";

/** OAuth return — exchanges code for TrustID access token, then enters ElfCom. */
export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);

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

    let cancelled = false;
    void (async () => {
      try {
        const tokens = await exchangeTrustIdCode(code, state);
        const info = await fetchTrustIdUserInfo(tokens.access_token);
        if (cancelled) return;
        const trustId = info.trustId || info.sub;
        if (!trustId || !tokens.access_token) {
          throw new Error("TrustID did not return an identity");
        }
        const expiresAt =
          typeof tokens.expires_in === "number"
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : undefined;
        setSession({
          accessToken: tokens.access_token,
          trustId,
          expiresAt,
        });
        navigate("/chat", { replace: true });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "TrustID sign-in failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, navigate, setSession]);

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[#0F172A] px-6 text-foam">
      {error ? (
        <div className="w-full max-w-sm text-center">
          <p className="mb-4 text-sm text-danger" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink"
            onClick={() => navigate("/login", { replace: true })}
          >
            Back to login
          </button>
        </div>
      ) : (
        <p className="text-sm text-mist">Finishing TrustID sign-in…</p>
      )}
    </div>
  );
}
