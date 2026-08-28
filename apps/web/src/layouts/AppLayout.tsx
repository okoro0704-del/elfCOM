import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "../components/BottomNav";
import { useUiStore } from "../store/uiStore";

export function AppLayout() {
  const location = useLocation();
  const hideChrome = useUiStore((s) => s.hideChrome);

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col bg-ink text-foam shadow-[0_0_80px_rgba(0,0,0,0.45)]">
      <div
        key={location.pathname}
        className="app-scroll min-h-0 flex-1 overflow-y-auto safe-pt animate-[fadeSlide_220ms_ease-out]"
      >
        <Outlet />
      </div>
      {!hideChrome ? <BottomNav /> : null}
      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0.55; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
