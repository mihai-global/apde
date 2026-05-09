"use client";

import type { ReactNode } from "react";

interface ChipProps {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}

export function Chip({ active, children, onClick }: ChipProps) {
  return (
    <button className={`chip${active ? " active" : ""}`} onClick={onClick} type="button">
      {children}
    </button>
  );
}
