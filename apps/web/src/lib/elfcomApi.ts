/**
 * TrustID-authenticated ElfCom node client.
 * Never mints capability JWTs or embeds ELFCOM_NODE_SECRET.
 * Session bind is performed server-side when TrustID JWKS verifies the access token.
 */
import { mergeById } from "./messageDedupe";

export type ElfComApiThread = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  unreadCount: number;
  participants: string[];
  channel?: string;
  peerRef?: string;
};

export type ElfComApiMessage = {
  id: string;
  threadId: string;
  body: string;
  senderId: string;
  createdAt: string;
  channel?: string;
  direction?: "inbound" | "outbound";
};

export type ElfComApiError = Error & { status?: number; code?: string };

function baseUrl(): string {
  return (import.meta.env.VITE_ELFCOM_BASE_URL ?? "").trim().replace(/\/$/, "");
}

export function elfcomBaseUrl(): string {
  return baseUrl();
}

function url(path: string): string {
  const base = baseUrl();
  if (!base) {
    throw Object.assign(new Error("VITE_ELFCOM_BASE_URL is not configured"), {
      code: "missing_base_url",
    });
  }
  return `${base}${path}`;
}

async function parseError(res: Response): Promise<ElfComApiError> {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 240);
  } catch {
    /* ignore */
  }
  const err = new Error(`ElfCom ${res.status}${detail ? `: ${detail}` : ""}`) as ElfComApiError;
  err.status = res.status;
  if (res.status === 401) err.code = "unauthorized";
  return err;
}

async function request<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Probe session — TrustID JWKS path auto-binds on the node. */
export async function ensureElfComSession(accessToken: string): Promise<void> {
  await request<{ threads: ElfComApiThread[] }>(accessToken, "/v1/inbox?channel=dm");
}

export async function fetchInbox(
  accessToken: string,
  channel = "dm",
): Promise<ElfComApiThread[]> {
  const qs = channel ? `?channel=${encodeURIComponent(channel)}` : "";
  const data = await request<{ threads: ElfComApiThread[] }>(accessToken, `/v1/inbox${qs}`);
  return data.threads ?? [];
}

export async function openDm(
  accessToken: string,
  peerTrustId: string,
): Promise<ElfComApiThread> {
  const data = await request<{ thread: ElfComApiThread }>(accessToken, "/v1/dm/open", {
    method: "POST",
    body: JSON.stringify({ peerTrustId }),
  });
  return data.thread;
}

export async function fetchMessages(
  accessToken: string,
  threadId: string,
): Promise<ElfComApiMessage[]> {
  const data = await request<{ messages: ElfComApiMessage[] }>(
    accessToken,
    `/v1/threads/${encodeURIComponent(threadId)}/messages`,
  );
  return data.messages ?? [];
}

export async function sendThreadMessage(
  accessToken: string,
  input: { threadId: string; body: string; peerRef?: string; channel?: string },
): Promise<ElfComApiMessage> {
  const data = await request<{ message: ElfComApiMessage }>(
    accessToken,
    `/v1/threads/${encodeURIComponent(input.threadId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        body: input.body,
        peerRef: input.peerRef,
        channel: input.channel ?? "dm",
      }),
    },
  );
  return data.message;
}

/** Merge messages by server id; keep optimistic locals until replaced. */
export function mergeMessagesById(
  existing: ElfComApiMessage[],
  incoming: ElfComApiMessage[],
): ElfComApiMessage[] {
  return mergeById(existing, incoming);
}
