"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const legalLinks = [
  ["Overview", "/legal"],
  ["Terms", "/legal/terms"],
  ["Privacy", "/legal/privacy"],
  ["Subscriptions", "/legal/subscription-terms"],
  ["Refunds", "/legal/refunds"],
  ["Delivery", "/legal/shipping"],
  ["Contact", "/legal/contact"],
] as const;

export function LegalNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Legal policies" className="flex min-w-0 items-center gap-5 overflow-x-auto py-4 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {legalLinks.map(([label, href]) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "font-medium text-foreground underline underline-offset-4" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
