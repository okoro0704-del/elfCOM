import { useEffect, useState } from "react";
import { searchDirectory, type DirectoryUserCard } from "@elfcom/core";
import { UserDiscoveryCard } from "@elfcom/ui";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useChatStore } from "../../store/chatStore";
import { useMailStore } from "../../store/mailStore";

function peerMetaFromQuery(query: string) {
  const q = query.trim();
  if (q.includes("@") && !q.startsWith("@") && !q.startsWith("$")) {
    return { email: q.toLowerCase(), displayName: q.split("@")[0] ?? q, handle: q };
  }
  if (/^\+?\d[\d\s()-]{6,}$/.test(q)) {
    return { phone: q.replace(/\s+/g, ""), displayName: q, handle: q };
  }
  const uname = q.replace(/^[@$]/, "");
  return { displayName: uname, handle: q.startsWith("$") || q.startsWith("@") ? q : `@${uname}` };
}

export function UserLookupModal() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<DirectoryUserCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setLookupOpen = useChatStore((s) => s.setLookupOpen);
  const startChatWith = useChatStore((s) => s.startChatWith);
  const setComposerOpen = useMailStore((s) => s.setComposerOpen);
  const accessToken = useAuthStore((s) => s.session?.accessToken);
  const navigate = useNavigate();

  useEffect(() => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      setBusy(true);
      setError(null);
      void searchDirectory(
        {
          baseUrl: import.meta.env.VITE_ELFCOM_BASE_URL?.trim() || "",
          getAccessToken: () => accessToken,
        },
        query,
        ac.signal,
        { failLoud: Boolean(accessToken) },
      )
        .then((r) => setUsers(r.users))
        .catch((e) => {
          if (ac.signal.aborted) return;
          setError(e instanceof Error ? e.message : "Search failed");
          setUsers([]);
        })
        .finally(() => {
          if (!ac.signal.aborted) setBusy(false);
        });
    }, 280);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [query, accessToken]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/55 p-0 sm:items-center sm:justify-center sm:p-4">
      <div
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl border border-line bg-ink-soft p-5 safe-pb sm:rounded-3xl"
        role="dialog"
        aria-labelledby="lookup-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="lookup-title" className="font-display text-lg font-semibold">
            Find people
          </h2>
          <button type="button" className="text-mist" onClick={() => setLookupOpen(false)}>
            Close
          </button>
        </div>
        <p className="mb-3 text-sm text-mist">Search by email, phone number, or username.</p>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="name@mail.com · +234… · @username"
          className="w-full rounded-2xl border border-line bg-panel px-4 py-3 outline-none ring-accent focus:ring-2"
        />
        {busy ? <p className="mt-3 text-xs text-mist">Searching directory…</p> : null}
        {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}

        <div className="app-scroll mt-4 space-y-2 overflow-y-auto">
          {users.map((u) => (
            <UserDiscoveryCard
              key={`${u.trustId}:${u.mode}`}
              user={u}
              onStartChat={(tid) => {
                startChatWith(tid, {
                  id: tid,
                  displayName: u.displayName,
                  handle: u.username ? `@${u.username}` : u.tidHandle,
                  email: u.email,
                  phone: u.phone,
                  presence: "offline",
                });
                setLookupOpen(false);
              }}
              onSendMail={() => {
                setLookupOpen(false);
                navigate("/mail");
                setComposerOpen(true);
              }}
            />
          ))}
          {!busy && query.trim() && users.length === 0 ? (
            <p className="py-6 text-center text-sm text-mist">No matches</p>
          ) : null}
        </div>

        <button
          type="button"
          disabled={!query.trim()}
          onClick={() => {
            startChatWith(query, peerMetaFromQuery(query));
            setLookupOpen(false);
          }}
          className="mt-4 w-full rounded-2xl border border-line py-3 text-sm font-medium text-foam disabled:opacity-40"
        >
          Open conversation with “{query.trim() || "…"}”
        </button>
      </div>
    </div>
  );
}
