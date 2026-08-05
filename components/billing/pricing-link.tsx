"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { getPricingHref } from "@/lib/billing/pricing-return";

type PricingLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  section?: "recharge";
};

export function PricingLink({ section, ...props }: PricingLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const returnTo = `${pathname}${query ? `?${query}` : ""}`;

  return (
    <Link href={getPricingHref(returnTo, section)} {...props} />
  );
}
