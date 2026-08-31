import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useAccountStore } from "../store/accountStore";
import { useOnboardingStore } from "../store/onboardingStore";

/**
 * Sync-hydrate account + onboarding, then send incomplete users to /onboarding.
 */
export function RequireProfileSetup() {
  const location = useLocation();
  const trustId = useAuthStore((s) => s.session?.trustId);
  const context = useAccountStore((s) => s.context);
  const hydrateAccount = useAccountStore((s) => s.hydrate);
  const onboardingOwner = useOnboardingStore((s) => s.ownerTrustId);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const needsOnboarding = useOnboardingStore((s) => s.needsOnboarding);

  if (trustId && (!context || context.ownerTrustId !== trustId)) {
    hydrateAccount(trustId);
  }
  if (trustId && onboardingOwner !== trustId) {
    hydrateOnboarding(trustId);
  }

  // Re-subscribe after possible hydrate
  const freshContext = useAccountStore((s) => s.context);

  if (!trustId) return <Outlet />;

  const personalNeeded = !freshContext?.personal.setupComplete;
  const onSetup =
    location.pathname.startsWith("/onboarding") || location.pathname.startsWith("/setup");

  if ((personalNeeded || needsOnboarding()) && !onSetup) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
