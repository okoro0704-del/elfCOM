import { useEffect, useState } from "react";
import { useDevicePair, useSilentAssert } from "@trustid/ui-react";
import { useNavigate } from "react-router-dom";
import { QrPanel } from "../../components/QrPanel";
import { TRUST_ID_AUTH } from "../../lib/trustidConfig";
import { useAuthStore } from "../../store/authStore";

type Mode = "biometric" | "qr";

export function Login() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [mode, setMode] = useState<Mode>("biometric");

  const biometric = useSilentAssert(TRUST_ID_AUTH);
  const pair = useDevicePair(TRUST_ID_AUTH, { pollMs: 2000 });

  useEffect(() => {
    if (biometric.result) {
      setSession(biometric.result);
      navigate("/chat", { replace: true });
    }
  }, [biometric.result, navigate, setSession]);

  useEffect(() => {
    if (pair.result) {
      setSession(pair.result);
      navigate("/chat", { replace: true });
    }
  }, [pair.result, navigate, setSession]);

  useEffect(() => {
    if (mode !== "qr") {
      pair.stop();
      return;
    }
    void pair.start();
    return () => pair.stop();
    // Intentionally only re-run when switching into QR mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pair.start/stop are stable enough for mount
  }, [mode]);

  const onTrustIdLogin = async () => {
    setMode("biometric");
    await biometric.login();
  };

  const error = mode === "qr" ? pair.error : biometric.error;
  const busy = mode === "qr" ? pair.busy || Boolean(pair.session && !pair.result) : biometric.busy;

  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-[#0F172A] text-foam">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(232,165,75,0.18), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 80%, rgba(15,53,50,0.55), transparent 50%), linear-gradient(165deg, #0F172A 0%, #071f1e 55%, #0b2e2c 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e7f4f1' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <header className="mt-[8vh] flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-panel ring-1 ring-line/80 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
            <svg viewBox="0 0 64 64" className="h-10 w-10" aria-hidden>
              <path
                d="M18 38V26l14-8 14 8v12l-14 8-14-8Z"
                fill="none"
                stroke="#e8a54b"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <path
                d="M32 18v28M18 26l14 8 14-8"
                fill="none"
                stroke="#e7f4f1"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="font-display text-4xl font-semibold tracking-tight text-foam">ElfCom</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-mist">
            Sovereign messaging. Sign in with Trust ID — Face ID, fingerprint, or passkey. No
            passwords.
          </p>
        </header>

        <section className="mt-auto flex flex-col gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {mode === "biometric" ? (
            <>
              <button
                type="button"
                onClick={() => void onTrustIdLogin()}
                disabled={biometric.busy}
                className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-accent px-5 py-4 text-base font-semibold text-ink shadow-[0_10px_30px_rgba(232,165,75,0.28)] transition active:scale-[0.98] disabled:opacity-70"
              >
                <span
                  className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition group-hover:translate-x-full"
                  style={{ transitionDuration: "700ms" }}
                  aria-hidden
                />
                <BiometricGlyph busy={biometric.busy} />
                {biometric.busy ? "Waiting for biometrics…" : "Login with Trust ID"}
              </button>

              <button
                type="button"
                onClick={() => setMode("qr")}
                className="w-full rounded-2xl border border-line/80 bg-panel/40 px-5 py-3.5 text-sm font-medium text-foam backdrop-blur-sm transition hover:bg-panel/70"
              >
                Use Master Device QR instead
              </button>
            </>
          ) : (
            <div className="rounded-3xl border border-line/70 bg-panel/50 p-5 backdrop-blur-md">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foam">Master Device pairing</h2>
                <button
                  type="button"
                  onClick={() => {
                    pair.stop();
                    setMode("biometric");
                  }}
                  className="text-xs font-medium text-accent"
                >
                  Back
                </button>
              </div>
              {pair.session?.qrPayload ? (
                <QrPanel
                  value={pair.session.qrPayload}
                  label="Open Trust ID on your paired phone and scan this code"
                />
              ) : (
                <div className="flex h-44 items-center justify-center text-sm text-mist">
                  {pair.busy ? "Creating secure QR…" : "Preparing pairing session…"}
                </div>
              )}
              <button
                type="button"
                disabled={pair.busy}
                onClick={() => void pair.start()}
                className="mt-4 w-full rounded-xl border border-line px-4 py-2.5 text-sm text-mist hover:text-foam"
              >
                Refresh QR
              </button>
            </div>
          )}

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-center text-sm text-danger"
            >
              {error}
            </p>
          ) : null}

          <p className="text-center text-[11px] text-mist/70">
            {busy ? "Securing session…" : `Trust ID · ${TRUST_ID_AUTH.silentAssertPath}`}
          </p>
        </section>
      </main>
    </div>
  );
}

function BiometricGlyph({ busy }: { busy: boolean }) {
  return (
    <span className="relative flex h-6 w-6 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 24 24" className={`h-6 w-6 ${busy ? "animate-pulse" : ""}`} fill="none">
        <path
          d="M12 3c-2.2 0-4 1.6-4 3.8V9H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1V6.8C16 4.6 14.2 3 12 3Z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <circle cx="12" cy="14.5" r="1.4" fill="currentColor" />
      </svg>
    </span>
  );
}
