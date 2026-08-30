import { base64UrlToBuffer, bufferToBase64Url } from "./base64url.js";
import type {
  DevicePairSession,
  DevicePairStatus,
  SilentAssertOptions,
  SilentAssertResult,
  TrustIdClientConfig,
} from "./types.js";

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return `${res.status} ${res.statusText}`;
  try {
    const json = JSON.parse(text) as { error?: string; message?: string };
    return json.message || json.error || text;
  } catch {
    return text;
  }
}

export class TrustIdAuthClient {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: TrustIdClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.clientId = config.clientId ?? "elfcom-web";
    this.fetchImpl = config.fetchImpl ?? fetch.bind(globalThis);
  }

  /** Begin silent-assert — returns WebAuthn publicKey options from TrustID. */
  async beginSilentAssert(): Promise<SilentAssertOptions> {
    const res = await this.fetchImpl(joinUrl(this.baseUrl, "/v1/auth/silent-assert"), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ phase: "begin", clientId: this.clientId }),
    });
    if (!res.ok) throw new Error(`silent-assert begin failed: ${await readError(res)}`);
    const data = (await res.json()) as SilentAssertOptions & { publicKey?: SilentAssertOptions };
    return data.publicKey ?? data;
  }

  /** Finish silent-assert with the WebAuthn assertion credential. */
  async finishSilentAssert(credential: PublicKeyCredential): Promise<SilentAssertResult> {
    const response = credential.response as AuthenticatorAssertionResponse;
    const body = {
      phase: "finish",
      clientId: this.clientId,
      id: credential.id,
      rawId: bufferToBase64Url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        authenticatorData: bufferToBase64Url(response.authenticatorData),
        signature: bufferToBase64Url(response.signature),
        userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null,
      },
    };

    const res = await this.fetchImpl(joinUrl(this.baseUrl, "/v1/auth/silent-assert"), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`silent-assert finish failed: ${await readError(res)}`);
    const data = (await res.json()) as SilentAssertResult & {
      access_token?: string;
      trust_id?: string;
    };
    return {
      accessToken: data.accessToken ?? data.access_token ?? "",
      trustId: data.trustId ?? data.trust_id ?? "",
      sid: data.sid,
      expiresAt: data.expiresAt,
    };
  }

  /**
   * Full biometric / passkey login:
   * begin → navigator.credentials.get (uv=required) → finish.
   */
  async silentAssert(): Promise<SilentAssertResult> {
    if (!globalThis.PublicKeyCredential) {
      throw new Error("WebAuthn is not available on this device");
    }

    const options = await this.beginSilentAssert();
    const allowCredentials = (options.allowCredentials ?? []).map((c) => ({
      id: base64UrlToBuffer(c.id),
      type: "public-key" as const,
      transports: c.transports,
    }));

    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlToBuffer(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout ?? 60_000,
        userVerification: options.userVerification ?? "required",
        allowCredentials: allowCredentials.length ? allowCredentials : undefined,
      },
    })) as PublicKeyCredential | null;

    if (!credential) throw new Error("Biometric assertion was cancelled");
    return this.finishSilentAssert(credential);
  }

  /** Start QR pairing for an unpaired terminal (Master Device scan). */
  async beginDevicePair(): Promise<DevicePairSession> {
    const res = await this.fetchImpl(joinUrl(this.baseUrl, "/v1/auth/device-pair"), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ phase: "begin", clientId: this.clientId }),
    });
    if (!res.ok) throw new Error(`device-pair begin failed: ${await readError(res)}`);
    const data = (await res.json()) as DevicePairSession & {
      pair_id?: string;
      qr_payload?: string;
      expires_at?: string;
    };
    return {
      pairId: data.pairId ?? data.pair_id ?? "",
      qrPayload: data.qrPayload ?? data.qr_payload ?? "",
      expiresAt: data.expiresAt ?? data.expires_at ?? "",
    };
  }

  async pollDevicePair(pairId: string): Promise<DevicePairStatus> {
    const res = await this.fetchImpl(
      joinUrl(this.baseUrl, `/v1/auth/device-pair/${encodeURIComponent(pairId)}`),
      { headers: { accept: "application/json" } },
    );
    if (res.status === 404) return { status: "expired" };
    if (!res.ok) throw new Error(`device-pair poll failed: ${await readError(res)}`);
    const data = (await res.json()) as {
      status: string;
      accessToken?: string;
      access_token?: string;
      trustId?: string;
      trust_id?: string;
      sid?: string;
      expiresAt?: string;
    };
    if (data.status === "approved") {
      return {
        status: "approved",
        result: {
          accessToken: data.accessToken ?? data.access_token ?? "",
          trustId: data.trustId ?? data.trust_id ?? "",
          sid: data.sid,
          expiresAt: data.expiresAt,
        },
      };
    }
    if (data.status === "expired") return { status: "expired" };
    return { status: "pending" };
  }
}

export function createTrustIdClient(config: TrustIdClientConfig): TrustIdAuthClient {
  return new TrustIdAuthClient(config);
}
