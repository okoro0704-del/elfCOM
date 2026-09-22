import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { useChatStore } from "../store/chatStore";

/**
 * Connects ElfChat to elfcom-node after TrustID session is available.
 * Uses TrustID access token only — no node signing secret in the browser.
 */
export function ElfComChatBootstrap() {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const connectEngine = useChatStore((s) => s.connectEngine);
  const disconnectEngine = useChatStore((s) => s.disconnectEngine);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken || !session.trustId) {
      disconnectEngine();
      return;
    }
    void connectEngine({
      accessToken: session.accessToken,
      trustId: session.trustId,
    });
    return () => {
      /* keep socket across route changes; disconnect on logout only */
    };
  }, [hydrated, session?.accessToken, session?.trustId, connectEngine, disconnectEngine]);

  return null;
}
