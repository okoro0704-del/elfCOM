import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { ProfileSetupInput } from "@elfcom/core";
import type { MailProvider, SocialPlatform } from "../../store/omniStore";
import { useAccountStore } from "../../store/accountStore";
import { useAuthStore } from "../../store/authStore";
import { useMailStore } from "../../store/mailStore";
import { useOmniStore } from "../../store/omniStore";
import { useOnboardingStore } from "../../store/onboardingStore";

type Step = "elfchat" | "elfmail" | "omnichat" | "omnimail";

const STEPS: { id: Step; title: string; blurb: string }[] = [
  {
    id: "elfchat",
    title: "ElfChat",
    blurb: "Your Personal identity — name, $TID handle, and bio for directory discovery.",
  },
  {
    id: "elfmail",
    title: "ElfMail",
    blurb: "Provision your ElfCom mailbox address for Personal (and optional Business) mail.",
  },
  {
    id: "omnichat",
    title: "OmniChat",
    blurb: "Connect a social channel so WhatsApp, Instagram, Messenger, or Telegram land in one inbox.",
  },
  {
    id: "omnimail",
    title: "OmniMail",
    blurb: "Link Gmail, Outlook, or IMAP so external mail aggregates beside ElfMail.",
  },
];

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
};

const PROVIDER_LABELS: Record<MailProvider, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  imap: "IMAP",
};

/** First-run hub: ElfChat → ElfMail → OmniChat channel → OmniMail mailbox. */
export function OnboardingPage() {
  const navigate = useNavigate();
  const trustId = useAuthStore((s) => s.session?.trustId);
  const context = useAccountStore((s) => s.context);
  const completeSetup = useAccountStore((s) => s.completeSetup);
  const hydrateAccount = useAccountStore((s) => s.hydrate);
  const flags = useOnboardingStore((s) => s.flags);
  const mark = useOnboardingStore((s) => s.mark);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const syncMail = useMailStore((s) => s.syncAccountsFromProfile);
  const platforms = useOmniStore((s) => s.platforms);
  const mailboxes = useOmniStore((s) => s.mailboxes);
  const connectPlatform = useOmniStore((s) => s.connectPlatform);
  const connectMailbox = useOmniStore((s) => s.connectMailbox);

  const [step, setStep] = useState<Step>("elfchat");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ElfChat form
  const [displayName, setDisplayName] = useState("");
  const [tidHandle, setTidHandle] = useState(trustId ?? "");
  const [bio, setBio] = useState("");

  // ElfMail / business
  const [wantBusiness, setWantBusiness] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessDomain, setBusinessDomain] = useState("");

  // OmniChat
  const [platform, setPlatform] = useState<SocialPlatform>("whatsapp");
  const [channelHandle, setChannelHandle] = useState("");

  // OmniMail
  const [provider, setProvider] = useState<MailProvider>("gmail");
  const [mailboxAddress, setMailboxAddress] = useState("");

  useEffect(() => {
    if (!trustId) return;
    hydrateAccount(trustId);
    hydrateOnboarding(trustId);
  }, [trustId, hydrateAccount, hydrateOnboarding]);

  useEffect(() => {
    if (context?.personal.setupComplete && !flags.elfChat) {
      mark("elfChat", true);
    }
  }, [context?.personal.setupComplete, flags.elfChat, mark]);

  useEffect(() => {
    if (!context) return;
    if (!flags.elfChat && !context.personal.setupComplete) setStep("elfchat");
    else if (!flags.elfMail) setStep("elfmail");
    else if (!flags.omniChat) setStep("omnichat");
    else if (!flags.omniMail) setStep("omnimail");
    else navigate("/chat", { replace: true });
  }, [
    context,
    flags.elfChat,
    flags.elfMail,
    flags.omniChat,
    flags.omniMail,
    navigate,
  ]);

  if (!trustId) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-mist">Sign in required…</div>
    );
  }

  const finish = () => navigate("/chat", { replace: true });

  const saveElfChat = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const input: ProfileSetupInput = {
        displayName,
        tidHandle,
        bio,
      };
      await completeSetup("PERSONAL", input);
      mark("elfChat", true);
      setStep("elfmail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save ElfChat profile");
    } finally {
      setBusy(false);
    }
  };

  const saveElfMail = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (wantBusiness) {
        await completeSetup("BUSINESS", {
          displayName: businessName || displayName || "Business",
          tidHandle: `$${tidHandle.replace(/^\$/, "")}`,
          businessDomain,
        } satisfies ProfileSetupInput);
      }
      const ctx = useAccountStore.getState().context;
      syncMail({
        personalHandle: ctx?.personal.tidHandle || tidHandle || trustId,
        personalName: ctx?.personal.displayName || displayName,
        businessDomain: ctx?.business.businessDomain || (wantBusiness ? businessDomain : undefined),
        businessName: ctx?.business.displayName || businessName,
      });
      mark("elfMail", true);
      setStep("omnichat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set up ElfMail");
    } finally {
      setBusy(false);
    }
  };

  const saveOmniChat = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      connectPlatform(platform, channelHandle);
      mark("omniChat", true);
      setStep("omnimail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect channel");
    }
  };

  const saveOmniMail = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      connectMailbox(provider, mailboxAddress);
      mark("omniMail", true);
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect mailbox");
    }
  };

  const stepMeta = STEPS.find((s) => s.id === step)!;
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-ink px-5 py-8 text-foam safe-pt safe-pb">
      <p className="text-xs uppercase tracking-[0.2em] text-accent">Welcome to ElfCom</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Set up your workspace</h1>
      <p className="mt-2 text-sm text-mist">
        Configure ElfChat, ElfMail, then create your OmniChat channel and OmniMail inbox.
      </p>

      <ol className="mt-6 flex gap-2">
        {STEPS.map((s, i) => {
          const done =
            (s.id === "elfchat" && flags.elfChat) ||
            (s.id === "elfmail" && flags.elfMail) ||
            (s.id === "omnichat" && flags.omniChat) ||
            (s.id === "omnimail" && flags.omniMail);
          const active = s.id === step;
          return (
            <li key={s.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setStep(s.id)}
                className={[
                  "w-full truncate rounded-full px-2 py-1.5 text-[10px] font-semibold uppercase",
                  active ? "bg-accent text-ink" : done ? "bg-ok/20 text-ok" : "bg-panel text-mist",
                ].join(" ")}
              >
                {i + 1}. {s.title}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-8">
        <h2 className="font-display text-xl font-semibold">{stepMeta.title}</h2>
        <p className="mt-1 text-sm text-mist">{stepMeta.blurb}</p>
        <p className="mt-2 text-xs text-mist">
          Step {stepIndex + 1} of {STEPS.length}
        </p>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {step === "elfchat" ? (
        <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void saveElfChat(e)}>
          <Field label="Display name" value={displayName} onChange={setDisplayName} required placeholder="Your name" />
          <Field label="$TID handle" value={tidHandle} onChange={setTidHandle} placeholder="$you" />
          <label className="block">
            <span className="mb-1.5 block text-xs text-mist">Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-2xl border border-line bg-panel px-4 py-3 outline-none ring-accent focus:ring-2"
            />
          </label>
          <Primary disabled={busy}>{busy ? "Saving…" : "Save ElfChat & continue"}</Primary>
        </form>
      ) : null}

      {step === "elfmail" ? (
        <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void saveElfMail(e)}>
          <div className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm">
            <p className="text-mist">Personal mailbox</p>
            <p className="mt-1 font-medium">
              {(tidHandle.replace(/^\$/, "") || "you").toLowerCase()}@elfcom.me
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={wantBusiness}
              onChange={(e) => setWantBusiness(e.target.checked)}
            />
            Also set up a Business ElfMail domain
          </label>
          {wantBusiness ? (
            <>
              <Field
                label="Business display name"
                value={businessName}
                onChange={setBusinessName}
                required
                placeholder="Harbor Hotel Ops"
              />
              <Field
                label="Custom domain"
                value={businessDomain}
                onChange={setBusinessDomain}
                required
                placeholder="harbor.hotel"
              />
            </>
          ) : null}
          <Primary disabled={busy}>{busy ? "Saving…" : "Provision ElfMail & continue"}</Primary>
        </form>
      ) : null}

      {step === "omnichat" ? (
        <form className="mt-6 flex flex-col gap-4" onSubmit={saveOmniChat}>
          {platforms.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {platforms.map((p) => (
                <li key={p.id} className="rounded-2xl border border-line bg-panel px-3 py-2">
                  {PLATFORM_LABELS[p.platform]} · {p.handle}
                </li>
              ))}
            </ul>
          ) : null}
          <label className="block">
            <span className="mb-1.5 block text-xs text-mist">Channel</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3"
            >
              {(Object.keys(PLATFORM_LABELS) as SocialPlatform[]).map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Handle / phone / bot"
            value={channelHandle}
            onChange={setChannelHandle}
            required
            placeholder="+15551234567 · @brand · page name"
          />
          <Primary>Create OmniChat channel</Primary>
          <button
            type="button"
            className="rounded-2xl border border-line py-3 text-sm text-mist"
            onClick={() => {
              mark("omniChat", true);
              setStep("omnimail");
            }}
          >
            Skip for now
          </button>
        </form>
      ) : null}

      {step === "omnimail" ? (
        <form className="mt-6 flex flex-col gap-4" onSubmit={saveOmniMail}>
          {mailboxes.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {mailboxes.map((m) => (
                <li key={m.id} className="rounded-2xl border border-line bg-panel px-3 py-2">
                  {PROVIDER_LABELS[m.provider]} · {m.address}
                </li>
              ))}
            </ul>
          ) : null}
          <label className="block">
            <span className="mb-1.5 block text-xs text-mist">Provider</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as MailProvider)}
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3"
            >
              {(Object.keys(PROVIDER_LABELS) as MailProvider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Email address"
            value={mailboxAddress}
            onChange={setMailboxAddress}
            required
            placeholder="you@gmail.com"
          />
          <Primary>Connect OmniMail</Primary>
          <button
            type="button"
            className="rounded-2xl border border-line py-3 text-sm text-mist"
            onClick={() => {
              mark("omniMail", true);
              finish();
            }}
          >
            Skip for now
          </button>
        </form>
      ) : null}
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
