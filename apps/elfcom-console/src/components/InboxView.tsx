import { useMemo, useState } from "react";
import { useElfComEvents } from "../hooks/useElfComEvents";
import { useInbox } from "../hooks/useInbox";
import { useThreadMessages } from "../hooks/useThreadMessages";
import type { ElfComConsoleClient } from "../lib/api";
import type { ElfComChannel } from "../lib/types";
import { ChannelFilter } from "./ChannelFilter";
import { ThreadList } from "./ThreadList";
import { ThreadPane } from "./ThreadPane";

type Props = {
  client: ElfComConsoleClient;
  bound: boolean;
};

/**
 * Multi-column omnichannel inbox.
 * Polls sealed envelopes and opens them client-side; WS bus triggers refresh.
 */
export function InboxView({ client, bound }: Props) {
  const [channel, setChannel] = useState<ElfComChannel | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { threads, loading, refresh, error: inboxError } = useInbox(client, bound, channel);
  const { messages, sending, send, error: msgError, refresh: refreshMessages } = useThreadMessages(
    client,
    bound,
    selectedId,
  );

  useElfComEvents(client, bound, (ev) => {
    if (
      ev.typ === "message.created" ||
      ev.typ === "thread.updated" ||
      ev.typ === "message.delivered"
    ) {
      void refresh();
      if (selectedId && ev.threadId === selectedId) void refreshMessages();
    }
  });

  const selected = useMemo(
    () => threads.find((t) => t.id === selectedId) ?? null,
    [threads, selectedId],
  );

  return (
    <div className="inbox">
      <ChannelFilter
        value={channel}
        onChange={(v) => {
          setChannel(v);
          setSelectedId(null);
        }}
      />
      <div>
        {inboxError ? <p className="err" style={{ padding: "0.75rem 1rem" }}>{inboxError}</p> : null}
        <ThreadList
          threads={threads}
          selectedId={selectedId}
          loading={loading}
          onSelect={setSelectedId}
          onRefresh={() => void refresh()}
        />
      </div>
      <ThreadPane
        thread={selected}
        messages={messages}
        sending={sending}
        error={msgError}
        onSend={send}
      />
    </div>
  );
}
