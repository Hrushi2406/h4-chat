import type { Metadata } from "next";

import { PricingPage } from "@/components/pricing/pricing-page";

export const metadata: Metadata = {
  title: "Pricing | Sakhi AI",
  description:
    "Choose a Sakhi AI plan for everyday conversations, connected apps, and automations.",
};

export default function Pricing() {
  return <PricingPage />;
}
