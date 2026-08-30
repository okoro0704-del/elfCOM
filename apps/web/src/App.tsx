import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PWAInstaller } from "./components/PWAInstaller";
import { RequireAuth } from "./components/RequireAuth";
import { AppLayout } from "./layouts/AppLayout";
import { AuthCallback } from "./pages/Auth/AuthCallback";
import { Login } from "./pages/Auth/Login";
import { ChatPage } from "./pages/chat/ChatPage";
import { MailPage } from "./pages/mail/MailPage";
import { OmniChatPage } from "./pages/omnichat/OmniChatPage";
import { OmniMailPage } from "./pages/omnimail/OmniMailPage";
import { useAuthStore } from "./store/authStore";

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <>
      <PWAInstaller />
      <Routes>
        <Route
          path="/login"
          element={hydrated && session ? <Navigate to="/chat" replace /> : <Login />}
        />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/chat" replace />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="mail" element={<MailPage />} />
            <Route path="omnichat" element={<OmniChatPage />} />
            <Route path="omnimail" element={<OmniMailPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to={session ? "/chat" : "/login"} replace />} />
      </Routes>
    </>
  );
}
