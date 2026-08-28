import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { ChatPage } from "./pages/chat/ChatPage";
import { MailPage } from "./pages/mail/MailPage";
import { OmniChatPage } from "./pages/omnichat/OmniChatPage";
import { OmniMailPage } from "./pages/omnimail/OmniMailPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="mail" element={<MailPage />} />
        <Route path="omnichat" element={<OmniChatPage />} />
        <Route path="omnimail" element={<OmniMailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
