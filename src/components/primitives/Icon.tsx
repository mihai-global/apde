// Inline SVG icon set, 1.5px stroke, currentColor.
// Original から TSX に書き直し、必要な型を付ける。
import type { SVGProps } from "react";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
  size?: number;
}

const baseProps = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

export function SearchIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ChevronUpIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

export function ArrowIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

export function CheckIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} strokeWidth={2} {...rest}>
      <path d="M5 12.5 10 17l9-10" />
    </svg>
  );
}

export function CloseIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} strokeWidth={2} {...rest}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function AlertIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </svg>
  );
}

export function FilterIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

export function RefreshIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M21 12a9 9 0 1 1-3.5-7.1M21 4v5h-5" />
    </svg>
  );
}

export function BookmarkIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M5 4h14v17l-7-4-7 4z" />
    </svg>
  );
}

export function ExternalIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M14 5h5v5M19 5l-9 9M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

export function GoogleIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
      <path d="M21.6 12.2c0-.7-.06-1.3-.18-1.97H12v3.74h5.4c-.23 1.27-.94 2.34-2 3.06v2.55h3.24c1.9-1.75 2.96-4.32 2.96-7.38Z" fill="#4285F4" />
      <path d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.55c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.6-4.13H3.06v2.6A10 10 0 0 0 12 22Z" fill="#34A853" />
      <path d="M6.4 13.87a6 6 0 0 1 0-3.74V7.53H3.06a10 10 0 0 0 0 8.94l3.34-2.6Z" fill="#FBBC05" />
      <path d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 3 14.7 2 12 2A10 10 0 0 0 3.06 7.53l3.34 2.6c.8-2.37 3-4.18 5.6-4.18Z" fill="#EA4335" />
    </svg>
  );
}

export function AppleIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}>
      <path d="M16.5 12.6c0-2.5 2-3.7 2.1-3.7-1.1-1.7-2.9-1.9-3.5-2-1.5-.1-2.9 1-3.7 1-.8 0-1.9-.9-3.2-.9-1.6 0-3.2 1-4 2.5-1.7 3-.4 7.4 1.3 9.8.8 1.2 1.7 2.5 3 2.5 1.2-.1 1.7-.8 3.2-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.7s-2.6-1-2.7-3.9zM14 6.4c.7-.8 1.1-1.9 1-3-1 0-2.2.6-2.9 1.4-.6.7-1.2 1.8-1 2.9 1.2.1 2.3-.6 2.9-1.3z" />
    </svg>
  );
}

export function MenuIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function BellIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M5 17h14l-2-2.5V11a5 5 0 0 0-10 0v3.5L5 17zM10 20.5h4" />
    </svg>
  );
}

export function SparklesIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.5 6.5l2 2M15.5 15.5l2 2M6.5 17.5l2-2M15.5 8.5l2-2" />
    </svg>
  );
}

export function PlusIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function EditIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M4 20h4l10.5-10.5-4-4L4 16v4zM14 6l4 4" />
    </svg>
  );
}
