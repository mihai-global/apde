"use client";

interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}

export function Toggle({ on, onChange, label }: ToggleProps) {
  return (
    <button
      className={`toggle${on ? " on" : ""}`}
      onClick={() => onChange(!on)}
      type="button"
      aria-pressed={on}
    >
      <span className="sw" />
      {label}
    </button>
  );
}
