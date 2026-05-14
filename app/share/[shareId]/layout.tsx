import type { Metadata } from "next";
import {
  getDefaultSharedChatPreview,
  getSharedChatPreview,
} from "@/lib/shared-chat-metadata";

type SharedChatLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ shareId: string }>;
};

export async function generateMetadata({
  params,
}: Pick<SharedChatLayoutProps, "params">): Promise<Metadata> {
  const { shareId } = await params;
  const preview = shareId
    ? await getSharedChatPreview(shareId)
    : getDefaultSharedChatPreview();

  return {
    title: preview.title,
    description: preview.description,
    openGraph: {
      title: preview.title,
      description: preview.description,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: preview.title,
      description: preview.description,
    },
  };
}

export default function SharedChatLayout({ children }: SharedChatLayoutProps) {
  return children;
}
