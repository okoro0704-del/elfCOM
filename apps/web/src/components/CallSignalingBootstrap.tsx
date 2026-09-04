import { useEffect } from "react";
import { configureCallSignaling } from "@elfcom/webrtc";
import { useAuthStore } from "../store/authStore";
import { refreshPushRegistration } from "../lib/pushBootstrap";

/** Keep WebRTC signaling + push registration alive while authenticated. */
export function CallSignalingBootstrap() {
  const accessToken = useAuthStore((s) => s.session?.accessToken);
  const trustId = useAuthStore((s) => s.session?.trustId);

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_ELFCOM_BASE_URL?.trim() || "";
    if (!accessToken || !trustId || !baseUrl) {
      configureCallSignaling(null);
      return;
    }
    configureCallSignaling({
      baseUrl,
      selfTid: trustId,
      getAccessToken: () => useAuthStore.getState().session?.accessToken,
    });
    void refreshPushRegistration();
    return () => configureCallSignaling(null);
  }, [accessToken, trustId]);

  return null;
}
