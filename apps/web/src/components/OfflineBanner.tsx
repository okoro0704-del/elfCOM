import { useEffect, useState } from "react";

/** Compact offline banner for authenticated shell. */
export function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="shrink-0 border-b border-line bg-panel px-4 py-2 text-center text-xs text-accent"
    >
      Offline — messages and directory search need a connection. Local drafts stay on this device.
    </div>
  );
}
