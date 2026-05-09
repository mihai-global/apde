interface ThumbPlaceholderProps {
  seed?: number;
  label?: string;
}

export function ThumbPlaceholder({ seed = 1, label }: ThumbPlaceholderProps) {
  const n = Math.abs(seed) % 4;
  return (
    <div className="thumb-placeholder">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {n === 0 && (
          <g stroke="currentColor" strokeWidth="0.4" fill="none">
            <rect x="20" y="30" width="60" height="40" />
            <line x1="20" y1="50" x2="80" y2="50" />
          </g>
        )}
        {n === 1 && (
          <g stroke="currentColor" strokeWidth="0.4" fill="none">
            <circle cx="50" cy="50" r="25" />
            <circle cx="50" cy="50" r="14" />
          </g>
        )}
        {n === 2 && (
          <g stroke="currentColor" strokeWidth="0.4" fill="none">
            <path d="M20 70 L50 25 L80 70 Z" />
            <line x1="35" y1="70" x2="65" y2="70" />
          </g>
        )}
        {n === 3 && (
          <g stroke="currentColor" strokeWidth="0.4" fill="none">
            <rect x="28" y="20" width="44" height="60" rx="2" />
            <line x1="28" y1="36" x2="72" y2="36" />
          </g>
        )}
      </svg>
      {label ? <span style={{ position: "relative" }}>{label}</span> : null}
    </div>
  );
}
