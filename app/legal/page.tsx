import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legal centre",
};

const policies = [
  ["Terms and Conditions", "Terms governing your use of Sakhi AI.", "/legal/terms"],
  ["Privacy Policy", "How we collect, use and protect personal data.", "/legal/privacy"],
  ["Subscription and Credits Terms", "Rules for subscriptions, renewals and credits.", "/legal/subscription-terms"],
  ["Cancellation and Refund Policy", "Cancellation, refund eligibility and processing.", "/legal/refunds"],
  ["Shipping and Delivery Policy", "How digital purchases are delivered.", "/legal/shipping"],
  ["Contact and Grievance Redressal", "Business, support and grievance information.", "/legal/contact"],
] as const;

export default function LegalIndexPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-14">
      <header className="border-b border-border pb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Legal</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">Policies and business information for Sakhi AI, operated by WestCoast Technologies LLP.</p>
        <p className="mt-4 text-sm text-muted-foreground">Effective August 2, 2026</p>
      </header>
      <div>
        {policies.map(([title, description, href]) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start justify-between gap-6 border-b border-border py-6"
          >
            <span>
              <span className="block font-medium text-foreground group-hover:underline">{title}</span>
              <span className="mt-1 block text-sm leading-6 text-muted-foreground">{description}</span>
            </span>
            <span aria-hidden className="text-muted-foreground">→</span>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">Questions? <a className="text-foreground underline underline-offset-4" href="mailto:support@trysakhi.com">support@trysakhi.com</a></p>
    </div>
  );
}
