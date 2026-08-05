import type { ReactNode } from "react";

export const LEGAL_EFFECTIVE_DATE = "August 2, 2026";

export type LegalTocItem = {
  id: string;
  title: string;
};

export function LegalDocument({
  title,
  summary,
  children,
}: {
  documentType: string;
  title: string;
  summary: string;
  sections: readonly LegalTocItem[];
  children: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-5 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-14">
      <header className="border-b border-border pb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">{summary}</p>
        <p className="mt-5 text-sm text-muted-foreground">
          Effective {LEGAL_EFFECTIVE_DATE} · WestCoast Technologies LLP
        </p>
      </header>
      <div className="legal-copy pt-8">{children}</div>
    </article>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-border py-7 first:pt-0 last:border-b-0">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-muted-foreground sm:text-base">{children}</div>
    </section>
  );
}

export function LegalNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 border-l-2 border-border pl-4 text-sm leading-6 text-muted-foreground">
      {children}
    </div>
  );
}
