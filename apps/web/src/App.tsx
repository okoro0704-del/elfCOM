import { useEffect } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PWAInstaller } from "./components/PWAInstaller";
import { RequireAuth } from "./components/RequireAuth";
import { RequireProfileSetup } from "./components/RequireProfileSetup";
import { AppLayout } from "./layouts/AppLayout";
import { AuthCallback } from "./pages/Auth/AuthCallback";
import { Login } from "./pages/Auth/Login";
import { OnboardingPage } from "./pages/account/OnboardingPage";
import { ProfileSetupPage } from "./pages/account/ProfileSetupPage";
import { ChatPage } from "./pages/chat/ChatPage";
import { MailPage } from "./pages/mail/MailPage";
import { OmniChatPage } from "./pages/omnichat/OmniChatPage";
import { OmniMailPage } from "./pages/omnimail/OmniMailPage";
import { useAuthStore } from "./store/authStore";
import { useAccountStore } from "./store/accountStore";
import { useOnboardingStore } from "./store/onboardingStore";
import type { ProfileMode } from "@elfcom/core";

function postAuthHome(): string {
  const session = useAuthStore.getState().session;
  if (!session?.trustId) return "/login";
  useAccountStore.getState().hydrate(session.trustId);
  useOnboardingStore.getState().hydrate(session.trustId);
  if (
    useAccountStore.getState().needsSetup("PERSONAL") ||
    useOnboardingStore.getState().needsOnboarding()
  ) {
    return "/onboarding";
  }
  return "/chat";
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="min-h-dvh bg-ink text-foam">
      <PWAInstaller />
      <ErrorBoundary label="app">
        <Routes>
          <Route
            path="/login"
            element={
              hydrated && session ? <Navigate to={postAuthHome()} replace /> : <Login />
            }
          />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<RequireAuth />}>
            <Route element={<RequireProfileSetup />}>
              <Route path="onboarding" element={<OnboardingPage />} />
              <Route path="setup" element={<Navigate to="/onboarding" replace />} />
              <Route path="setup/:mode" element={<ProfileSetupByMode />} />
              <Route element={<AppLayout />}>
                <Route index element={<Navigate to="/chat" replace />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="mail" element={<MailPage />} />
                <Route path="omnichat" element={<OmniChatPage />} />
                <Route path="omnimail" element={<OmniMailPage />} />
              </Route>
            </Route>
          </Route>
          <Route
            path="*"
            element={<Navigate to={session ? postAuthHome() : "/login"} replace />}
          />
        </Routes>
      </ErrorBoundary>
    </div>
  );
}

function ProfileSetupByMode() {
  const { mode } = useParams();
  const forcedMode: ProfileMode =
    mode?.toUpperCase() === "BUSINESS" ? "BUSINESS" : "PERSONAL";
  return <ProfileSetupPage forcedMode={forcedMode} />;
}
