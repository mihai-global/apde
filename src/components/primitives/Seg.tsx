"use client";

interface SegOption<T extends string> {
  value: T;
  label: string;
}

interface SegProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegOption<T>>;
  onChange: (next: T) => void;
}

export function Seg<T extends string>({ value, options, onChange }: SegProps<T>) {
  return (
    <div className="seg" role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={value === opt.value ? "active" : ""}
          onClick={() => onChange(opt.value)}
          role="tab"
          aria-selected={value === opt.value}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
