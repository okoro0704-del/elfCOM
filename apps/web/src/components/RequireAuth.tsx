import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

/** Redirects unauthenticated sessions to /login. */
export function RequireAuth() {
  const location = useLocation();
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center bg-ink text-mist">
        <p className="text-sm">Restoring Trust ID session…</p>
      </div>
    );
  }

  if (!session?.accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
