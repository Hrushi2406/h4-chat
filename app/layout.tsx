import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientProvider } from "./client-provider";
import ChatLayout from "@/components/chat/chat-layout";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Component Showcase",
  description: "A comprehensive collection of available shadcn/ui components",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <ClientProvider>
          <ChatLayout>{children}</ChatLayout>
          {children}
        </ClientProvider>
      </body>
    </html>
  );
}
