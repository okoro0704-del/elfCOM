import { useEffect } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PWAInstaller } from "./components/PWAInstaller";
import { RequireAuth } from "./components/RequireAuth";
import { RequireProfileSetup } from "./components/RequireProfileSetup";
import { AppLayout } from "./layouts/AppLayout";
import { AuthCallback } from "./pages/Auth/AuthCallback";
import { Login } from "./pages/Auth/Login";
import { ProfileSetupPage } from "./pages/account/ProfileSetupPage";
import { ChatPage } from "./pages/chat/ChatPage";
import { MailPage } from "./pages/mail/MailPage";
import { OmniChatPage } from "./pages/omnichat/OmniChatPage";
import { OmniMailPage } from "./pages/omnimail/OmniMailPage";
import { useAuthStore } from "./store/authStore";
import type { ProfileMode } from "@elfcom/core";

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
            element={hydrated && session ? <Navigate to="/chat" replace /> : <Login />}
          />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<RequireAuth />}>
            <Route element={<RequireProfileSetup />}>
              <Route path="setup" element={<ProfileSetupPage />} />
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
          <Route path="*" element={<Navigate to={session ? "/chat" : "/login"} replace />} />
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
