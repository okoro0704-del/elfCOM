export type ProfileMode = "PERSONAL" | "BUSINESS";

export type ElfProfile = {
  mode: ProfileMode;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  /** TrustID / $TID handle, e.g. TD-AMARA01 or $amara */
  tidHandle: string;
  /** Public username for discovery (no @ required). */
  username?: string;
  /** Contact email for discovery / ElfMail. */
  email?: string;
  /** E.164-ish phone for discovery. */
  phone?: string;
  /** Personal ElfMail local-part, e.g. amara → amara@elfcom.me */
  mailLocal?: string;
  /** Business-only custom mail domain, e.g. harbor.hotel */
  businessDomain?: string;
  setupComplete: boolean;
};

export type ElfAccountContext = {
  ownerTrustId: string;
  activeMode: ProfileMode;
  personal: ElfProfile;
  business: ElfProfile;
};

export type ProfileSetupInput = {
  displayName: string;
  bio?: string;
  avatarUrl?: string | null;
  tidHandle?: string;
  username?: string;
  email?: string;
  phone?: string;
  mailLocal?: string;
  businessDomain?: string;
};

export type DirectoryUserCard = {
  trustId: string;
  tidHandle: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string | null;
  username?: string;
  email?: string;
  phone?: string;
  mode: ProfileMode;
  businessDomain?: string;
  actions: {
    startChat: { kind: "chat"; targetTid: string };
    sendMail: { kind: "mail"; targetTid: string; addressHint?: string };
    call: { kind: "call"; targetTid: string };
  };
};

export type DirectorySearchResult = {
  query: string;
  users: DirectoryUserCard[];
};
