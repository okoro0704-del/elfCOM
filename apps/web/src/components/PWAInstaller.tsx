import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "elfcom.pwa.install.dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const ios = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || ios;
}

/**
 * Captures `beforeinstallprompt` and surfaces an immediate Install ElfCom App banner.
 */
export function PWAInstaller() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBip);
    // Show soft prompt even before BIP on capable browsers (iOS / already deferred).
    const t = window.setTimeout(() => {
      if (!isStandalone() && sessionStorage.getItem(DISMISS_KEY) !== "1") {
        setVisible(true);
      }
    }, 600);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.clearTimeout(t);
    };
  }, []);

  const dismiss = useCallback(() => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) {
      // iOS / browsers without BIP — guide is still useful; keep banner open.
      return;
    }
    setInstalling(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      setVisible(false);
    } finally {
      setInstalling(false);
    }
  }, [deferred]);

  if (!visible || isStandalone()) return null;

  const canPrompt = Boolean(deferred);

  return (
    <div
      role="dialog"
      aria-label="Install ElfCom App"
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center p-3 safe-pt"
    >
      <div className="pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-2xl border border-line/80 bg-ink-soft/95 px-3 py-3 shadow-[0_16px_50px_rgba(0,0,0,0.45)] backdrop-blur-md animate-[slideDown_280ms_ease-out]">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-panel ring-1 ring-line">
          <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
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
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foam">Install ElfCom App</p>
          <p className="truncate text-xs text-mist">
            {canPrompt ? "Add to home screen for one-tap access" : "Share → Add to Home Screen"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-2.5 py-2 text-xs font-medium text-mist hover:text-foam"
          >
            Later
          </button>
          {canPrompt ? (
            <button
              type="button"
              disabled={installing}
              onClick={() => void install()}
              className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-ink disabled:opacity-70"
            >
              {installing ? "…" : "Install"}
            </button>
          ) : null}
        </div>
      </div>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
