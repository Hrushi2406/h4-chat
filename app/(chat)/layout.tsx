import ChatLayout from "@/components/chat/chat-layout";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ChatLayout>{children}</ChatLayout>;
}
