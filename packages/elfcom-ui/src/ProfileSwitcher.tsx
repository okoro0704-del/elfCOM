import type { ProfileMode } from "@elfcom/core";

type Props = {
  activeMode: ProfileMode;
  personalLabel?: string;
  businessLabel?: string;
  onSwitch: (mode: ProfileMode) => void;
  className?: string;
};

export function ProfileSwitcher({
  activeMode,
  personalLabel = "Personal",
  businessLabel = "Business",
  onSwitch,
  className = "",
}: Props) {
  return (
    <div
      className={`inline-flex rounded-full border border-line bg-panel p-0.5 ${className}`}
      role="tablist"
      aria-label="Account workspace"
    >
      {(
        [
          ["PERSONAL", personalLabel],
          ["BUSINESS", businessLabel],
        ] as const
      ).map(([mode, label]) => {
        const active = activeMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSwitch(mode)}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-semibold transition",
              active ? "bg-accent text-ink" : "text-mist hover:text-foam",
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
