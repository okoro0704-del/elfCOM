import { initiateCall, type CallType, type InitiateOptions, type CallSession } from "@elfcom/webrtc";
import { ensureCallPermissions } from "./mediaPermissions";

/** Request OS media permissions, then start a WebRTC call. */
export async function startCall(
  targetTid: string,
  type: CallType,
  opts?: InitiateOptions,
): Promise<CallSession> {
  await ensureCallPermissions(type === "VIDEO");
  return initiateCall(targetTid, type, opts);
}
