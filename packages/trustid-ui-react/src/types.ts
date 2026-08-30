export type SilentAssertOptions = {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: UserVerificationRequirement;
  allowCredentials?: Array<{
    id: string;
    type: "public-key";
    transports?: AuthenticatorTransport[];
  }>;
};

export type SilentAssertResult = {
  accessToken: string;
  trustId: string;
  sid?: string;
  expiresAt?: string;
};

export type DevicePairSession = {
  pairId: string;
  /** Payload encoded into the QR (deep link / opaque token). */
  qrPayload: string;
  expiresAt: string;
};

export type DevicePairStatus =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "approved"; result: SilentAssertResult };

export type TrustIdClientConfig = {
  /** TrustID auth base, e.g. https://trustid.example.com */
  baseUrl: string;
  /** ElfCom / relying-party client id sent with auth requests. */
  clientId?: string;
  fetchImpl?: typeof fetch;
};
