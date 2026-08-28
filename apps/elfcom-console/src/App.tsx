import { InboxView } from "./components/InboxView";
import { SessionGate } from "./components/SessionGate";
import { useElfComSession } from "./hooks/useElfComSession";

export default function App() {
  const { client, ownerTrustId, bound, error, busy, connect, disconnect } = useElfComSession();

  if (!bound || !ownerTrustId) {
    return <SessionGate busy={busy} error={error} onConnect={(id) => void connect(id)} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>ElfCom Console</strong>
          <span>Pillar 3 · sealed omnichannel inbox</span>
        </div>
        <div className="session-chip">
          <span>
            session <code>{ownerTrustId}</code>
          </span>
          <button type="button" className="btn" onClick={disconnect}>
            End session
          </button>
        </div>
      </header>
      <InboxView client={client} bound={bound} />
    </div>
  );
}
