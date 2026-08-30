import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { ProfileMode, ProfileSetupInput } from "@elfcom/core";
import { useAccountStore } from "../../store/accountStore";
import { useAuthStore } from "../../store/authStore";

type Props = {
  /** When set, only this mode is edited (e.g. after switch). */
  forcedMode?: ProfileMode;
  onDone?: () => void;
};

/** Complete Personal and/or Business profile setup (avatar, name, bio, domain). */
export function ProfileSetupPage({ forcedMode, onDone }: Props = {}) {
  const navigate = useNavigate();
  const trustId = useAuthStore((s) => s.session?.trustId);
  const context = useAccountStore((s) => s.context);
  const completeSetup = useAccountStore((s) => s.completeSetup);
  const switchMode = useAccountStore((s) => s.switchMode);
  const publishError = useAccountStore((s) => s.publishError);

  const mode: ProfileMode = forcedMode ?? context?.activeMode ?? "PERSONAL";
  const profile = mode === "PERSONAL" ? context?.personal : context?.business;

  const [displayName, setDisplayName] = useState(() => {
    const n = profile?.displayName ?? "";
    return n === "Personal" || n === "Business" ? "" : n;
  });
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [tidHandle, setTidHandle] = useState(profile?.tidHandle ?? trustId ?? "");
  const [businessDomain, setBusinessDomain] = useState(profile?.businessDomain ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const personalDone = context?.personal.setupComplete ?? false;
  const businessDone = context?.business.setupComplete ?? false;

  const subtitle = useMemo(() => {
    if (forcedMode) return `Finish your ${mode === "BUSINESS" ? "Business" : "Personal"} profile`;
    if (!personalDone) return "Set up your Personal profile to start chatting and mailing";
    if (!businessDone) return "Optional: add a Business workspace with your custom domain";
    return "Update your active profile";
  }, [forcedMode, mode, personalDone, businessDone]);

  if (!trustId) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-mist">
        Sign in required…
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const input: ProfileSetupInput = {
        displayName,
        bio,
        tidHandle,
        avatarUrl: avatarUrl.trim() || null,
        businessDomain: mode === "BUSINESS" ? businessDomain : undefined,
      };
      await completeSetup(mode, input);
      switchMode(mode);

      if (forcedMode) {
        onDone?.();
        navigate("/chat", { replace: true });
        return;
      }

      const st = useAccountStore.getState();
      if (!st.needsSetup("PERSONAL") && st.needsSetup("BUSINESS") && mode === "PERSONAL") {
        switchMode("BUSINESS");
        setDisplayName("");
        setBio("");
        setBusinessDomain("");
        setAvatarUrl("");
        setTidHandle(`$${trustId.replace(/^TD-/i, "").toLowerCase()}`);
        return;
      }

      onDone?.();
      navigate("/chat", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  const skipBusiness = () => {
    switchMode("PERSONAL");
    navigate("/chat", { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-ink px-5 py-8 text-foam safe-pt safe-pb">
      <p className="text-xs uppercase tracking-[0.2em] text-accent">ElfCom</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">
        {mode === "BUSINESS" ? "Business profile" : "Personal profile"}
      </h1>
      <p className="mt-2 text-sm text-mist">{subtitle}</p>

      <div className="mt-4 flex gap-2">
        <span
          className={[
            "rounded-full px-3 py-1 text-[11px] font-semibold",
            personalDone ? "bg-ok/20 text-ok" : "bg-panel text-mist",
          ].join(" ")}
        >
          Personal {personalDone ? "ready" : "needed"}
        </span>
        <span
          className={[
            "rounded-full px-3 py-1 text-[11px] font-semibold",
            businessDone ? "bg-ok/20 text-ok" : "bg-panel text-mist",
          ].join(" ")}
        >
          Business {businessDone ? "ready" : "optional"}
        </span>
      </div>

      <form className="mt-8 flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <label className="block">
          <span className="mb-1.5 block text-xs text-mist">Display name</span>
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={mode === "BUSINESS" ? "Harbor Hotel Ops" : "Your name"}
            className="w-full rounded-2xl border border-line bg-panel px-4 py-3 outline-none ring-accent focus:ring-2"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs text-mist">$TID handle</span>
          <input
            value={tidHandle}
            onChange={(e) => setTidHandle(e.target.value)}
            placeholder="$you"
            className="w-full rounded-2xl border border-line bg-panel px-4 py-3 outline-none ring-accent focus:ring-2"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs text-mist">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Short intro"
            className="w-full resize-none rounded-2xl border border-line bg-panel px-4 py-3 outline-none ring-accent focus:ring-2"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs text-mist">Avatar URL (optional)</span>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-2xl border border-line bg-panel px-4 py-3 outline-none ring-accent focus:ring-2"
          />
        </label>

        {mode === "BUSINESS" ? (
          <label className="block">
            <span className="mb-1.5 block text-xs text-mist">Custom business domain</span>
            <input
              required
              value={businessDomain}
              onChange={(e) => setBusinessDomain(e.target.value)}
              placeholder="harbor.hotel"
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3 outline-none ring-accent focus:ring-2"
            />
          </label>
        ) : null}

        {error || publishError ? (
          <p className="text-sm text-danger" role="alert">
            {error || publishError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-2xl bg-accent py-3.5 text-sm font-semibold text-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save & continue"}
        </button>

        {!forcedMode && personalDone && mode === "BUSINESS" && !businessDone ? (
          <button
            type="button"
            onClick={skipBusiness}
            className="rounded-2xl border border-line py-3 text-sm text-mist"
          >
            Skip business for now
          </button>
        ) : null}

        {forcedMode ? (
          <button
            type="button"
            onClick={() => navigate("/chat")}
            className="rounded-2xl border border-line py-3 text-sm text-mist"
          >
            Cancel
          </button>
        ) : null}
      </form>
    </div>
  );
}
