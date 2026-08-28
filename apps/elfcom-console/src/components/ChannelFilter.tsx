import type { ElfComChannel } from "../lib/types";

const CHANNELS: Array<{ id: ElfComChannel | "all"; label: string }> = [
  { id: "all", label: "All channels" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telegram", label: "Telegram" },
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X" },
  { id: "email", label: "Email" },
  { id: "dm", label: "Native DM" },
];

type Props = {
  value: ElfComChannel | "all";
  onChange: (v: ElfComChannel | "all") => void;
};

export function ChannelFilter({ value, onChange }: Props) {
  return (
    <aside className="rail">
      <h2>Channels</h2>
      {CHANNELS.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`channel-btn${value === c.id ? " active" : ""}`}
          onClick={() => onChange(c.id)}
        >
          <span className={`dot ${c.id}`} />
          {c.label}
        </button>
      ))}
    </aside>
  );
}
