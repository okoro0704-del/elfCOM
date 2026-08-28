import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
};

export function TopAppBar({ title, subtitle, left, right }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-ink/90 px-4 pb-3 pt-3 backdrop-blur-md safe-pt">
      <div className="flex items-center gap-3">
        {left ? <div className="shrink-0">{left}</div> : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-semibold tracking-tight text-foam">
            {title}
          </h1>
          {subtitle ? <p className="truncate text-xs text-mist">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </header>
  );
}
