import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Join Sakhi",
  description:
    "Someone invited you to Sakhi. Sign up to start chatting with your AI assistant.",
};

export default function ReferralLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
