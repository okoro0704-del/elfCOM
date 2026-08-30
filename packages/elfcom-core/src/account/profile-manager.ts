import type {
  ElfAccountContext,
  ElfProfile,
  ProfileMode,
  ProfileSetupInput,
} from "../types.js";

const STORAGE_KEY = "elfcom.account.context";

function emptyProfile(mode: ProfileMode, ownerTrustId: string): ElfProfile {
  const handle =
    mode === "PERSONAL"
      ? ownerTrustId.startsWith("TD-")
        ? ownerTrustId
        : `TD-${ownerTrustId.slice(0, 8).toUpperCase()}`
      : `${ownerTrustId.replace(/^TD-/, "").toLowerCase()}.biz`;
  return {
    mode,
    displayName: mode === "PERSONAL" ? "Personal" : "Business",
    bio: "",
    avatarUrl: null,
    tidHandle: handle,
    businessDomain: mode === "BUSINESS" ? undefined : undefined,
    setupComplete: false,
  };
}

export function createDefaultAccountContext(ownerTrustId: string): ElfAccountContext {
  return {
    ownerTrustId,
    activeMode: "PERSONAL",
    personal: emptyProfile("PERSONAL", ownerTrustId),
    business: emptyProfile("BUSINESS", ownerTrustId),
  };
}

/** In-memory + sessionStorage profile manager for Personal / Business modes. */
export class ProfileManager {
  private ctx: ElfAccountContext;

  constructor(ownerTrustId: string, initial?: ElfAccountContext | null) {
    this.ctx = initial ?? readStored(ownerTrustId) ?? createDefaultAccountContext(ownerTrustId);
    if (this.ctx.ownerTrustId !== ownerTrustId) {
      this.ctx = createDefaultAccountContext(ownerTrustId);
    }
    this.persist();
  }

  getContext(): ElfAccountContext {
    return structuredClone(this.ctx);
  }

  getActiveProfile(): ElfProfile {
    return structuredClone(
      this.ctx.activeMode === "PERSONAL" ? this.ctx.personal : this.ctx.business,
    );
  }

  switchMode(mode: ProfileMode): ElfAccountContext {
    this.ctx = { ...this.ctx, activeMode: mode };
    this.persist();
    return this.getContext();
  }

  completeSetup(mode: ProfileMode, input: ProfileSetupInput): ElfAccountContext {
    const name = input.displayName.trim();
    if (!name) throw new Error("Display name is required");

    const patch: ElfProfile = {
      ...(mode === "PERSONAL" ? this.ctx.personal : this.ctx.business),
      displayName: name,
      bio: (input.bio ?? "").trim(),
      avatarUrl: input.avatarUrl ?? null,
      tidHandle: (input.tidHandle ?? "").trim() || (mode === "PERSONAL" ? this.ctx.personal.tidHandle : this.ctx.business.tidHandle),
      setupComplete: true,
    };

    if (mode === "BUSINESS") {
      const domain = (input.businessDomain ?? patch.businessDomain ?? "").trim().toLowerCase();
      if (!domain || !/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
        throw new Error("Business profile requires a valid custom domain (e.g. harbor.hotel)");
      }
      patch.businessDomain = domain;
    }

    this.ctx =
      mode === "PERSONAL"
        ? { ...this.ctx, personal: patch }
        : { ...this.ctx, business: patch };
    this.persist();
    return this.getContext();
  }

  needsSetup(mode: ProfileMode = this.ctx.activeMode): boolean {
    const p = mode === "PERSONAL" ? this.ctx.personal : this.ctx.business;
    return !p.setupComplete;
  }

  private persist() {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.ctx));
      }
    } catch {
      /* ignore quota / private mode */
    }
  }
}

function readStored(ownerTrustId: string): ElfAccountContext | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ElfAccountContext;
    if (parsed?.ownerTrustId !== ownerTrustId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadProfileManager(ownerTrustId: string): ProfileManager {
  return new ProfileManager(ownerTrustId);
}
