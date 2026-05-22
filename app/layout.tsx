import type { Metadata } from "next";
import { Inter, STIX_Two_Text } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { ClientProvider } from "./client-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const stix = STIX_Two_Text({
  subsets: ["latin"],
  variable: "--font-stix",
  style: "italic",
});

export const metadata: Metadata = {
  applicationName: "Sakhi AI",
  title: "Sakhi AI",
  description: "Fast & personalized AI chat assistant for your conversations",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Sakhi AI",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${stix.variable} font-sans antialiased`}
      >
        <ClientProvider>{children}</ClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
