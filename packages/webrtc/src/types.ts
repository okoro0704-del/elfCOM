export type CallType = "AUDIO" | "VIDEO";

export type CallSession = {
  id: string;
  targetTid: string;
  type: CallType;
  status: "ringing" | "connecting" | "active" | "ended" | "failed";
  startedAt: string;
  error?: string;
};

export type CallListener = (session: CallSession | null) => void;

export type InitiateOptions = {
  /** Optional display name for the overlay. */
  displayName?: string;
};
