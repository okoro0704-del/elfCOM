export type CallType = "AUDIO" | "VIDEO";

export type CallDirection = "outbound" | "inbound";

export type CallSession = {
  id: string;
  targetTid: string;
  type: CallType;
  status: "ringing" | "connecting" | "active" | "ended" | "failed";
  startedAt: string;
  error?: string;
  displayName?: string;
  direction?: CallDirection;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
};

export type CallListener = (session: CallSession | null) => void;

export type InitiateOptions = {
  /** Optional display name for the overlay. */
  displayName?: string;
};

export type SignalingConfig = {
  baseUrl: string;
  getAccessToken: () => string | null | undefined;
  selfTid: string;
  /** Optional ICE servers; defaults to public Google STUN. */
  iceServers?: RTCIceServer[];
};
