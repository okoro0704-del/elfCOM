import { useEffect, useRef, useState } from "react";
import {
  hasTrustIdOnDevice,
  trustIdCreateUrl,
} from "../../lib/trustidConfig";
import { beginTrustIdLogin } from "../../lib/trustidOAuth";

type Phase = "unlocking" | "needs_trustid" | "retry";

/**
 * Zero-input ElfCom login.
 * - Known device: immediately silent TrustID passkey (Face ID / fingerprint).
 * - No TrustID yet: offer create — never a username/password form.
 */
export function Login() {
  const [phase, setPhase] = useState<Phase>("unlocking");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    const errDesc = params.get("error_description") || err;

    // Returned from silent authorize with no passkey / no account.
    if (
      err === "login_required" ||
      err === "interaction_required" ||
      err === "access_denied" ||
      (errDesc && /no.*(passkey|credential|account|trust.?id)/i.test(errDesc))
    ) {
      setPhase(hasTrustIdOnDevice() ? "retry" : "needs_trustid");
      window.history.replaceState({}, "", "/login");
      return;
    }

    // Returning from TrustID create — try silent unlock.
    if (params.get("created") === "1" || params.get("enrolled") === "1") {
      window.history.replaceState({}, "", "/login");
    }

    void (async () => {
      try {
        await beginTrustIdLogin({ silent: true });
      } catch {
        setPhase(hasTrustIdOnDevice() ? "retry" : "needs_trustid");
      }
    })();
  }, []);

  const unlock = () => {
    setPhase("unlocking");
    void beginTrustIdLogin({ silent: true }).catch(() => setPhase("retry"));
  };

  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ink text-foam"
      onClick={phase === "retry" ? unlock : undefined}
      role={phase === "retry" ? "button" : undefined}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 35%, rgba(232,165,75,0.12), transparent 60%), linear-gradient(180deg, #071f1e 0%, #0b2e2c 100%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center px-8 text-center">
        <p className="font-display text-5xl font-semibold tracking-tight text-foam">ElfCom</p>

        {phase === "unlocking" ? (
          <p className="mt-8 text-sm text-mist animate-pulse">Looking for your Trust ID…</p>
        ) : null}

        {phase === "needs_trustid" ? (
          <div className="mt-10 flex flex-col items-center gap-6">
            <p className="max-w-xs text-sm leading-relaxed text-mist">
              No Trust ID on this device. Create one to unlock ElfCom with Face ID or fingerprint.
            </p>
            <a
              href={trustIdCreateUrl()}
              className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              Create Trust ID
            </a>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                unlock();
              }}
              className="text-xs text-mist/80 hover:text-foam"
            >
              I already have one — unlock
            </button>
          </div>
        ) : null}

        {phase === "retry" ? (
          <p className="mt-8 max-w-xs text-sm text-mist">
            Tap anywhere to unlock with Face ID or fingerprint
          </p>
        ) : null}
      </div>
    </div>
  );
}
