import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { ProfileSetupInput } from "@elfcom/core";
import { useAccountStore } from "../../store/accountStore";
import { useAuthStore } from "../../store/authStore";
import { useMailStore } from "../../store/mailStore";
import { useOnboardingStore } from "../../store/onboardingStore";

/**
 * First-run: set up ElfChat identity, then land in ElfChat.
 * ElfMail / Omni are optional and can be skipped entirely.
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const trustId = useAuthStore((s) => s.session?.trustId);
  const context = useAccountStore((s) => s.context);
  const completeSetup = useAccountStore((s) => s.completeSetup);
  const hydrateAccount = useAccountStore((s) => s.hydrate);
  const flags = useOnboardingStore((s) => s.flags);
  const mark = useOnboardingStore((s) => s.mark);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const createMailbox = useMailStore((s) => s.createMailbox);
  const hydrateMail = useMailStore((s) => s.hydrate);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showMail, setShowMail] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [mailLocal, setMailLocal] = useState("");

  useEffect(() => {
    if (!trustId) return;
    hydrateAccount(trustId);
    hydrateOnboarding(trustId);
    hydrateMail(trustId);
  }, [trustId, hydrateAccount, hydrateOnboarding, hydrateMail]);

  useEffect(() => {
    if (context?.personal.setupComplete && !flags.elfChat) {
      mark("elfChat", true);
    }
  }, [context?.personal.setupComplete, flags.elfChat, mark]);

  useEffect(() => {
    if (flags.elfChat || context?.personal.setupComplete) {
      navigate("/chat", { replace: true });
    }
  }, [flags.elfChat, context?.personal.setupComplete, navigate]);

  if (!trustId) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-mist">Sign in required…</div>
    );
  }

  const enterChat = () => navigate("/chat", { replace: true });

  const saveElfChat = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const uname = username.trim().replace(/^@/, "") || displayName.trim().toLowerCase().replace(/\s+/g, ".");
      const input: ProfileSetupInput = {
        displayName,
        tidHandle: uname.startsWith("$") ? uname : `$${uname}`,
        username: uname,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        bio,
        mailLocal: showMail ? mailLocal : undefined,
      };
      await completeSetup("PERSONAL", input);
      mark("elfChat", true);

      if (showMail && mailLocal.trim()) {
        createMailbox({
          localPart: mailLocal,
          displayName,
        });
        mark("elfMail", true);
      }

      enterChat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-ink px-5 py-8 text-foam safe-pt safe-pb">
      <p className="text-xs uppercase tracking-[0.2em] text-accent">Welcome to ElfCom</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Set up ElfChat</h1>
      <p className="mt-2 text-sm text-mist">
        Create your identity so people can find you by username, email, or phone. You can skip
        ElfMail and the rest for now.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <form className="mt-8 flex flex-col gap-4" onSubmit={(e) => void saveElfChat(e)}>
        <Field
          label="Display name"
          value={displayName}
          onChange={setDisplayName}
          required
          placeholder="Your name"
        />
        <Field
          label="Username"
          value={username}
          onChange={(v) => {
            setUsername(v);
            if (!mailLocal) setMailLocal(v.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9._-]/g, ""));
          }}
          required
          placeholder="amara"
        />
        <Field
          label="Email (optional)"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
        />
        <Field
          label="Phone (optional)"
          value={phone}
          onChange={setPhone}
          placeholder="+2348012345678"
        />
        <label className="block">
          <span className="mb-1.5 block text-xs text-mist">Bio (optional)</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-2xl border border-line bg-panel px-4 py-3 outline-none ring-accent focus:ring-2"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-mist">
          <input
            type="checkbox"
            checked={showMail}
            onChange={(e) => setShowMail(e.target.checked)}
          />
          Also create an ElfMail address (like Gmail)
        </label>

        {showMail ? (
          <div className="rounded-2xl border border-line bg-panel px-4 py-3">
            <p className="mb-2 text-xs text-mist">Choose your address</p>
            <div className="flex items-center gap-1">
              <input
                required={showMail}
                value={mailLocal}
                onChange={(e) =>
                  setMailLocal(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))
                }
                placeholder="amara"
                className="min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 py-2 outline-none"
              />
              <span className="shrink-0 text-sm text-mist">@elfcom.me</span>
            </div>
          </div>
        ) : null}

        <Primary disabled={busy}>
          {busy ? "Saving…" : "Save & open ElfChat"}
        </Primary>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-mist">{label}</span>
      <input
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-line bg-panel px-4 py-3 outline-none ring-accent focus:ring-2"
      />
    </label>
  );
}

function Primary({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-2 rounded-2xl bg-accent py-3.5 text-sm font-semibold text-ink disabled:opacity-50"
    >
      {children}
    </button>
  );
}
