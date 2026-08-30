import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useAccountStore } from "../store/accountStore";

/**
 * Ensures Personal profile is complete before chat/mail.
 * Allows `/setup` itself and does not block Business-only incompleteness.
 */
export function RequireProfileSetup() {
  const location = useLocation();
  const trustId = useAuthStore((s) => s.session?.trustId);
  const context = useAccountStore((s) => s.context);
  const hydrate = useAccountStore((s) => s.hydrate);

  useEffect(() => {
    if (trustId) hydrate(trustId);
  }, [trustId, hydrate]);

  if (!trustId) return <Outlet />;

  if (!context) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-mist">
        Loading profile…
      </div>
    );
  }

  const personalNeeded = !context.personal.setupComplete;
  const onSetup = location.pathname.startsWith("/setup");

  if (personalNeeded && !onSetup) {
    return <Navigate to="/setup" replace state={{ from: location.pathname }} />;
  }

  if (!personalNeeded && onSetup && location.pathname === "/setup") {
    // Allow staying on setup to finish business; don't auto-bounce.
  }

  return <Outlet />;
}
