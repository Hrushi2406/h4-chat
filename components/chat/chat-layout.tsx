import { Plus } from "lucide-react";
import { Button } from "../ui/button";
import { blurBackground } from "@/lib/utils";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className=" bg-background p-2 h-screen">
      <div className="max-w-6xl overflow-hidden mx-auto rounded-lg shadow-sm flex flex-col h-full w-full bg-white dark:bg-black">
        <div
          className={`border-b w-full bg-white/40 dark:bg-black/80 backdrop-blur-2xl `}
        >
          <div className="max-w-4xl mx-auto flex h-16 shrink-0 justify-between items-center gap-2 px-4 md:px-0">
            <h1 className="text-lg font-medium">H4 Chat</h1>

            <Button variant="secondary" size="sm">
              <Plus className="h-4 w-4" />
              New Thread
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
