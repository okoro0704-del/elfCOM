type Props = {
  busy: boolean;
  error: string | null;
  onConnect: (trustId: string) => void;
};

export function SessionGate({ busy, error, onConnect }: Props) {
  return (
    <div className="gate">
      <form
        className="gate-card"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const trustId = String(fd.get("trustId") ?? "");
          if (trustId.trim()) onConnect(trustId);
        }}
      >
        <h1>ElfCom Console</h1>
        <p>
          Omnichannel inbox for sealed streams. Session keys stay in browser RAM; bodies open
          only after ZK session bind.
        </p>
        <label htmlFor="trustId">Owner TrustID</label>
        <input
          id="trustId"
          name="trustId"
          placeholder="TD-SMOKE01"
          defaultValue="TD-SMOKE01"
          autoComplete="off"
          required
        />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Binding session…" : "Open inbox"}
        </button>
        {error ? <p className="err">{error}</p> : null}
      </form>
    </div>
  );
}
