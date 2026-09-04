/** Shared push provider types. */
export type PushPriority = "NORMAL" | "HIGH" | "MAX";

export type PushDispatchPayload = {
  title?: string;
  body?: string;
  priority: PushPriority;
  channelId: string;
  dataPayload?: Record<string, unknown>;
};

export type PushSendResult = {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** Provider reported the token is dead — deactivate in registry. */
  invalidateToken?: boolean;
};
