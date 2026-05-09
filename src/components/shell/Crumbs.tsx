import Link from "next/link";
import type { ReactNode } from "react";

export interface CrumbItem {
  label: ReactNode;
  href?: string;
}

interface CrumbsProps {
  items: CrumbItem[];
}

export function Crumbs({ items }: CrumbsProps) {
  return (
    <div className="crumbs">
      {items.map((it, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {i > 0 ? <span aria-hidden="true">›</span> : null}
          {it.href ? <Link href={it.href}>{it.label}</Link> : <span>{it.label}</span>}
        </span>
      ))}
    </div>
  );
}
