import type { Metadata } from "next";
import Link from "next/link";
import { LegalNav } from "@/components/legal/legal-nav";

export const metadata: Metadata = {
  title: {
    default: "Legal | Sakhi AI",
    template: "%s | Sakhi AI",
  },
  description: "Legal policies and customer information for Sakhi AI.",
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh overflow-y-auto overscroll-contain bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
          <Link
            href="/"
            className="shrink-0 text-base font-semibold tracking-tight transition-opacity hover:opacity-70"
          >
            Sakhi AI
          </Link>
          <LegalNav />
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} WestCoast Technologies LLP</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/legal" className="hover:text-foreground">
              Legal centre
            </Link>
            <a href="mailto:support@trysakhi.com" className="hover:text-foreground">
              support@trysakhi.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
