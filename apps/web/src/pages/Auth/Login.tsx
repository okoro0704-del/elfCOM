import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import {
  hasTrustIdOnDevice,
  trustIdCreateUrl,
} from "../../lib/trustidConfig";
import { beginTrustIdLogin } from "../../lib/trustidOAuth";

type Phase = "unlocking" | "needs_trustid" | "retry";

async function openExternal(url: string) {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url, toolbarColor: "#071f1e" });
    return;
  }
  window.location.assign(url);
}

/**
 * Zero-input ElfCom login.
 * - Known device: immediately silent TrustID passkey (Face ID / fingerprint).
 * - No TrustID yet: offer create — never a username/password form.
 */
export function Login() {
  const [phase, setPhase] = useState<Phase>("unlocking");
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const started = useRef(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    const errDesc = params.get("error_description") || err;

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

    if (params.get("created") === "1" || params.get("enrolled") === "1") {
      window.history.replaceState({}, "", "/login");
    }

    if (!navigator.onLine) {
      setPhase(hasTrustIdOnDevice() ? "retry" : "needs_trustid");
      return;
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
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ink text-foam safe-pt safe-pb"
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

        {!online ? (
          <p className="mt-6 max-w-xs text-sm text-accent">
            Offline — connect to the internet to unlock with Trust ID.
          </p>
        ) : null}

        {phase === "unlocking" && online ? (
          <p className="mt-8 text-sm text-mist animate-pulse">Looking for your Trust ID…</p>
        ) : null}

        {phase === "needs_trustid" ? (
          <div className="mt-10 flex flex-col items-center gap-6">
            <p className="max-w-xs text-sm leading-relaxed text-mist">
              No Trust ID on this device. Create one to unlock ElfCom with Face ID or fingerprint.
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void openExternal(trustIdCreateUrl());
              }}
              className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              Create Trust ID
            </button>
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

        {phase === "retry" && online ? (
          <p className="mt-8 max-w-xs text-sm text-mist">
            Tap anywhere to unlock with Face ID or fingerprint
          </p>
        ) : null}
      </div>
    </div>
  );
}
