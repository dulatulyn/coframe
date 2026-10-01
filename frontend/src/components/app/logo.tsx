import Link from "next/link";

import { APP_NAME } from "@/config/brand";
import { cn } from "@/lib/utils";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <path d="M72.72 32.6A26 26 0 1 0 72.72 67.4" stroke="currentColor" strokeWidth="14" strokeLinecap="round" />
      <circle cx="57.4" cy="50" r="9" fill="#A7AAB1" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-1.5 text-ink", className)}>
      <LogoMark size={32} className="-ml-1" />
      <span className="text-[18px] font-semibold tracking-[-0.03em]">{APP_NAME}</span>
    </Link>
  );
}
