import { useState } from "react";
import { useChatStore } from "../../store/chatStore";

export function UserLookupModal() {
  const [query, setQuery] = useState("");
  const setLookupOpen = useChatStore((s) => s.setLookupOpen);
  const startChatWith = useChatStore((s) => s.startChatWith);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/55 p-0 sm:items-center sm:justify-center sm:p-4">
      <div
        className="w-full max-w-lg rounded-t-3xl border border-line bg-ink-soft p-5 safe-pb sm:rounded-3xl"
        role="dialog"
        aria-labelledby="lookup-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="lookup-title" className="font-display text-lg font-semibold">
            Start ElfChat
          </h2>
          <button type="button" className="text-mist" onClick={() => setLookupOpen(false)}>
            Close
          </button>
        </div>
        <p className="mb-3 text-sm text-mist">Search by email, phone, or @elfchat username.</p>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="@amara · you@mail.com · +1555…"
          className="w-full rounded-2xl border border-line bg-panel px-4 py-3 outline-none ring-accent focus:ring-2"
        />
        <button
          type="button"
          disabled={!query.trim()}
          onClick={() => startChatWith(query)}
          className="mt-4 w-full rounded-2xl bg-accent py-3 text-sm font-semibold text-ink disabled:opacity-40"
        >
          Open conversation
        </button>
      </div>
    </div>
  );
}
