export {
  seal,
  open,
  openUtf8,
  encodeAad,
  hashAad,
  type SealAad,
} from "./seal.js";

export {
  parseMasterKey,
  deriveUserKey,
  derivePhaseASessionKey,
  computeZkBind,
  randomSessionKey,
  sha256Hex,
  blindIndexHandle,
  deriveOmniThreadId,
} from "./keys.js";

export {
  SessionBinder,
  SessionBindError,
  type SessionBinding,
  type BindInput,
} from "./session-bind.js";

export {
  P2pKeyExchange,
  type PeerKeyRecord,
  type P2pEnvelope,
} from "./p2p.js";
