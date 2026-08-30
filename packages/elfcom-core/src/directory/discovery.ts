import type { DirectorySearchResult, DirectoryUserCard, ProfileMode } from "../types.js";

export type DiscoveryClientConfig = {
  /** ElfCom API base, e.g. https://elfcomnode-production.up.railway.app */
  baseUrl: string;
  /** Bearer access token (TrustID / capability). */
  getAccessToken: () => string | null | undefined;
  fetchImpl?: typeof fetch;
};

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function toCard(raw: Record<string, unknown>): DirectoryUserCard {
  const trustId = String(raw.trustId ?? raw.tid ?? "");
  const mode = (raw.mode === "BUSINESS" ? "BUSINESS" : "PERSONAL") as ProfileMode;
  const tidHandle = String(raw.tidHandle ?? raw.handle ?? trustId);
  const displayName = String(raw.displayName ?? raw.name ?? tidHandle);
  const businessDomain =
    typeof raw.businessDomain === "string" ? raw.businessDomain : undefined;
  const addressHint =
    mode === "BUSINESS" && businessDomain
      ? `${tidHandle.split("@")[0] ?? "mail"}@${businessDomain}`
      : undefined;

  return {
    trustId,
    tidHandle,
    displayName,
    bio: typeof raw.bio === "string" ? raw.bio : undefined,
    avatarUrl: (raw.avatarUrl as string | null | undefined) ?? null,
    mode,
    businessDomain,
    actions: {
      startChat: { kind: "chat", targetTid: trustId },
      sendMail: { kind: "mail", targetTid: trustId, addressHint },
      call: { kind: "call", targetTid: trustId },
    },
  };
}

/** Client for `GET /v1/directory/search?query=...` */
export class DirectoryDiscovery {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => string | null | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(config: DiscoveryClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.getAccessToken = config.getAccessToken;
    this.fetchImpl = config.fetchImpl ?? fetch.bind(globalThis);
  }

  async search(query: string, signal?: AbortSignal): Promise<DirectorySearchResult> {
    const q = query.trim();
    if (!q) return { query: q, users: [] };

    const url = new URL(joinUrl(this.baseUrl, "/v1/directory/search"));
    url.searchParams.set("query", q);

    const token = this.getAccessToken();
    const res = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`directory search failed: ${res.status} ${text || res.statusText}`);
    }

    const data = (await res.json()) as {
      query?: string;
      users?: Record<string, unknown>[];
    };

    return {
      query: data.query ?? q,
      users: (data.users ?? []).map(toCard),
    };
  }
}

/** Local fallback when API is unreachable (dev / offline demos). */
export function localDirectorySearch(query: string): DirectorySearchResult {
  const q = query.trim().toLowerCase();
  const seed: DirectoryUserCard[] = [
    {
      trustId: "TD-AMARA01",
      tidHandle: "$amara",
      displayName: "Amara Okoro",
      bio: "Front desk · Harbor Hotel",
      avatarUrl: null,
      mode: "BUSINESS",
      businessDomain: "harbor.hotel",
      actions: {
        startChat: { kind: "chat", targetTid: "TD-AMARA01" },
        sendMail: {
          kind: "mail",
          targetTid: "TD-AMARA01",
          addressHint: "amara@harbor.hotel",
        },
        call: { kind: "call", targetTid: "TD-AMARA01" },
      },
    },
    {
      trustId: "TD-KOFI02",
      tidHandle: "$kofi",
      displayName: "Kofi Mensah",
      bio: "Personal",
      avatarUrl: null,
      mode: "PERSONAL",
      actions: {
        startChat: { kind: "chat", targetTid: "TD-KOFI02" },
        sendMail: { kind: "mail", targetTid: "TD-KOFI02" },
        call: { kind: "call", targetTid: "TD-KOFI02" },
      },
    },
    {
      trustId: "TD-SMOKE01",
      tidHandle: "$smoke",
      displayName: "Smoke Test",
      bio: "ElfCom QA identity",
      avatarUrl: null,
      mode: "PERSONAL",
      actions: {
        startChat: { kind: "chat", targetTid: "TD-SMOKE01" },
        sendMail: { kind: "mail", targetTid: "TD-SMOKE01" },
        call: { kind: "call", targetTid: "TD-SMOKE01" },
      },
    },
  ];

  const users = !q
    ? []
    : seed.filter(
        (u) =>
          u.trustId.toLowerCase().includes(q) ||
          u.tidHandle.toLowerCase().includes(q.replace(/^\$/, "")) ||
          u.displayName.toLowerCase().includes(q) ||
          (u.businessDomain?.toLowerCase().includes(q) ?? false),
      );

  return { query, users };
}

export async function searchDirectory(
  config: DiscoveryClientConfig,
  query: string,
  signal?: AbortSignal,
): Promise<DirectorySearchResult> {
  if (!config.baseUrl.trim()) {
    return localDirectorySearch(query);
  }
  try {
    const client = new DirectoryDiscovery(config);
    return await client.search(query, signal);
  } catch {
    return localDirectorySearch(query);
  }
}
