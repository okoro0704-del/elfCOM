import { Outlet, useLocation } from "react-router-dom";
import { CallOverlay } from "@elfcom/ui";
import { BottomNav } from "../components/BottomNav";
import { CallSignalingBootstrap } from "../components/CallSignalingBootstrap";
import { OfflineBanner } from "../components/OfflineBanner";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useUiStore } from "../store/uiStore";

export function AppLayout() {
  const location = useLocation();
  const hideChrome = useUiStore((s) => s.hideChrome);

  return (
    <div className="mx-auto flex min-h-dvh h-full max-w-lg flex-col bg-ink text-foam shadow-[0_0_80px_rgba(0,0,0,0.45)] md:max-w-5xl">
      <CallSignalingBootstrap />
      <OfflineBanner />
      <div className="app-scroll min-h-0 flex-1 overflow-y-auto safe-pt">
        <ErrorBoundary key={location.pathname} label={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </div>
      {!hideChrome ? <BottomNav /> : null}
      <CallOverlay />
    </div>
  );
}
