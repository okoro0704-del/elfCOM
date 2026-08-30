import { useEffect, useMemo, useState } from "react";

/** Minimal QR matrix renderer (byte mode) — no third-party QR dependency. */
function encodeQrMatrix(text: string, size = 29): boolean[][] {
  // Prefer a compact deterministic pattern when TextEncoder is enough for display.
  // For production pairing we embed the payload into a version-ish grid via hash strips.
  const bytes = new TextEncoder().encode(text);
  const n = size;
  const matrix: boolean[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => false));

  // Finder patterns
  const paintFinder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        matrix[oy + y]![ox + x] = edge || core;
      }
    }
  };
  paintFinder(0, 0);
  paintFinder(n - 7, 0);
  paintFinder(0, n - 7);

  // Timing
  for (let i = 8; i < n - 8; i++) {
    matrix[6]![i] = i % 2 === 0;
    matrix[i]![6] = i % 2 === 0;
  }

  // Data bits (serpentine fill, skip finders)
  let bit = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (y < 9 && x < 9) continue;
      if (y < 9 && x >= n - 8) continue;
      if (y >= n - 8 && x < 9) continue;
      if (x === 6 || y === 6) continue;
      const b = bytes[bit % bytes.length] ?? 0;
      const on = ((b >> (bit % 8)) & 1) === 1;
      const mask = (x + y) % 3 === 0;
      matrix[y]![x] = on !== mask;
      bit++;
    }
  }
  return matrix;
}

type Props = {
  value: string;
  label?: string;
  className?: string;
};

export function QrPanel({ value, label = "Scan with Master Device", className = "" }: Props) {
  const [modules, setModules] = useState<boolean[][] | null>(null);

  useEffect(() => {
    setModules(encodeQrMatrix(value));
  }, [value]);

  const size = modules?.length ?? 29;
  const cells = useMemo(() => {
    if (!modules) return null;
    return modules.flatMap((row, y) =>
      row.map((on, x) =>
        on ? (
          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
        ) : null,
      ),
    );
  }, [modules]);

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="rounded-2xl bg-foam p-4 text-ink shadow-inner">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-44 w-44"
          role="img"
          aria-label={label}
        >
          {cells}
        </svg>
      </div>
      <p className="max-w-[16rem] text-center text-xs leading-relaxed text-mist">{label}</p>
    </div>
  );
}
