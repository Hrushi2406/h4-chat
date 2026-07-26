"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronRight,
  BookOpen,
  Loader2,
  Plus,
  Search,
  Pencil,
  Trash2,
  ImagePlus,
  Share,
  X,
  BadgeCheck,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import Modal from "@/components/ui/modal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useHelper,
  useHelperActions,
  useHelpers,
} from "@/lib/hooks/helpers/use-helpers";
import { useStorageActions } from "@/lib/hooks/storage/use-storage-actions";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { auth } from "@/lib/clients/firebase";
import type { Helper } from "@/lib/types/helper";

const helperEmojis = ["📖", "💼", "✍️", "🎯", "💡", "📚", "🧭", "✨"];

const generatingMessages = [
  "Reading your idea…",
  "Naming your Helper…",
  "Writing the instructions…",
  "Almost there…",
];

const tones = [
  ["#eaf2ff", "#3978f6"],
  ["#fff0e8", "#ed6a3a"],
  ["#ecf8ef", "#2d9a55"],
  ["#f4edff", "#8a55d9"],
  ["#fff7d9", "#bb8513"],
] as const;

const toneFor = (value: string) => {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return tones[Math.abs(hash) % tones.length];
};

const MIN_VISIBLE_USAGE_COUNT = 5;

const formatUsageCount = (count: number) => {
  const value = Intl.NumberFormat("en", { notation: "compact" }).format(count);
  return `Used ${value} times`;
};

export default function HelpersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sharedHelperId = searchParams.get("helper");
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useHelpers();
  const { data: sharedHelper } = useHelper(sharedHelperId);
  const actions = useHelperActions();
  const [tab, setTab] = useState<"discover" | "mine">("discover");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [selected, setSelected] = useState<Helper | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Helper | null>(null);
  const [deleting, setDeleting] = useState<Helper | null>(null);

  useEffect(() => {
    if (sharedHelper) setSelected(sharedHelper);
  }, [sharedHelper]);

  const added = useMemo(() => new Set(data?.addedHelperIds ?? []), [data]);
  const owned = useMemo(() => new Set(data?.ownedHelperIds ?? []), [data]);
  const helpers = useMemo(() => {
    const source = data?.helpers ?? [];
    return source.filter((helper) => {
      const inTab =
        tab === "mine"
          ? owned.has(helper.id) || added.has(helper.id)
          : helper.status === "published";
      if (!inTab) return false;
      if (!deferredQuery) return true;
      return `${helper.title} ${helper.whenToUse} ${helper.authorName}`
        .toLowerCase()
        .includes(deferredQuery);
    });
  }, [added, data, deferredQuery, owned, tab]);

  const verified = helpers.filter(
    (helper) => helper.verificationStatus === "verified",
  );
  const community = helpers.filter(
    (helper) => helper.verificationStatus !== "verified",
  );

  const startHelperChat = async (helper: Helper) => {
    const isAvailable =
      helper.verificationStatus === "verified" ||
      owned.has(helper.id) ||
      added.has(helper.id);

    try {
      if (!isAvailable) {
        await actions.addHelper.mutateAsync(helper.id);
        toast.success("Added to My Helpers", {
          description: "Sakhi can now use it automatically when it fits.",
        });
      }
      router.push(
        `/chat?draft=${encodeURIComponent(`Use the ${helper.title} Helper for my next request. `)}`,
      );
    } catch {
      // The mutation hook owns the error toast.
    }
  };

  const shareHelper = async (helper: Helper) => {
    const isVerified = helper.verificationStatus === "verified";
    const url = isVerified
      ? `${window.location.origin}/chat?draft=${encodeURIComponent(`Use the ${helper.title} Helper for my next request. `)}`
      : `${window.location.origin}/helpers?helper=${encodeURIComponent(helper.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", {
        description: isVerified
          ? "Opens a chat with this Helper ready to go."
          : "Opens this Helper's page.",
      });
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const toggleAdded = async (helper: Helper) => {
    try {
      if (added.has(helper.id)) {
        await actions.unaddHelper.mutateAsync(helper.id);
        toast.success("Removed from My Helpers");
      } else {
        await actions.addHelper.mutateAsync(helper.id);
        toast.success("Added to My Helpers", {
          description: "Sakhi can now use it automatically when it fits.",
        });
      }
    } catch {
      // The mutation hook owns the error toast.
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <main className="mx-auto w-full max-w-[1120px] px-5 pb-24 pt-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              Helpers
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Add simple instructions that teach Sakhi how to help.
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-secondary px-3 text-muted-foreground transition-colors focus-within:ring-2 focus-within:ring-ring/30 sm:w-64 sm:flex-none">
              <Search className="size-4 shrink-0" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Helpers"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <Button
              onClick={() => setCreating(true)}
              aria-label="Create Helper"
              className="h-9 shrink-0 rounded-full px-3 text-sm shadow-none min-[390px]:px-4"
            >
              <Plus className="size-4" />
              <span className="hidden min-[390px]:inline">Create Helper</span>
            </Button>
          </div>
        </header>

        <div className="mt-6">
          <div className="inline-flex rounded-full bg-secondary p-1">
            {(["discover", "mine"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  "cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  tab === value
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "discover" ? "Discover" : "My Helpers"}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingGrid />
        ) : helpers.length === 0 ? (
          <EmptyState tab={tab} onCreate={() => setCreating(true)} />
        ) : (
          <div className="mt-10">
            <HelperSection
              helpers={[...verified, ...community]}
              added={added}
              owned={owned}
              onOpen={setSelected}
              onAdd={toggleAdded}
              onUse={startHelperChat}
              onShare={shareHelper}
            />
            {tab === "discover" && hasNextPage ? (
              <LoadMoreSentinel
                loading={isFetchingNextPage}
                onLoadMore={fetchNextPage}
              />
            ) : null}
          </div>
        )}
      </main>

      <HelperDetail
        helper={selected}
        isAdded={selected ? added.has(selected.id) : false}
        isOwned={selected ? owned.has(selected.id) : false}
        busy={actions.addHelper.isPending || actions.unaddHelper.isPending}
        submitting={actions.updateHelper.isPending}
        onClose={() => {
          setSelected(null);
          if (sharedHelperId) router.replace("/helpers", { scroll: false });
        }}
        onAdd={toggleAdded}
        onUse={startHelperChat}
        onEdit={(helper) => {
          setSelected(null);
          setEditing(helper);
        }}
        onDelete={(helper) => {
          setSelected(null);
          setDeleting(helper);
        }}
        onSubmitForReview={async (helper) => {
          try {
            await actions.updateHelper.mutateAsync({
              helperId: helper.id,
              status: "pending_review",
            });
            setSelected(null);
            toast.success("Helper submitted for review");
          } catch {
            // The mutation hook owns the error toast.
          }
        }}
      />
      <HelperEditor
        key="create-helper"
        open={creating}
        onOpenChange={setCreating}
      />
      <HelperEditor
        key={editing?.id ?? "edit-helper"}
        open={Boolean(editing)}
        helper={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
      <ConfirmationDialog
        open={Boolean(deleting)}
        title={deleting ? `Delete ${deleting.title}?` : "Delete Helper?"}
        description="This removes the Helper for you and anyone who added it. This cannot be undone."
        confirmLabel="Delete Helper"
        confirmingLabel="Deleting…"
        cancelLabel="Keep Helper"
        isConfirming={actions.removeHelper.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          actions.removeHelper
            .mutateAsync(deleting.id)
            .then(() => {
              setDeleting(null);
              toast.success("Helper deleted");
            })
            .catch(() => undefined);
        }}
      />
    </div>
  );
}

function HelperSection({
  helpers,
  added,
  owned,
  onOpen,
  onAdd,
  onUse,
  onShare,
}: {
  helpers: Helper[];
  added: Set<string>;
  owned: Set<string>;
  onOpen: (helper: Helper) => void;
  onAdd: (helper: Helper) => void;
  onUse: (helper: Helper) => void;
  onShare: (helper: Helper) => void;
}) {
  return (
    <section>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {helpers.map((helper) => (
          <HelperCard
            key={helper.id}
            helper={helper}
            isAdded={added.has(helper.id)}
            isOwned={owned.has(helper.id)}
            onOpen={() => onOpen(helper)}
            onAdd={() => onAdd(helper)}
            onUse={() => onUse(helper)}
            onShare={() => onShare(helper)}
          />
        ))}
      </div>
    </section>
  );
}

function HelperArtwork({
  helper,
  className,
}: {
  helper: Helper;
  className?: string;
}) {
  if (helper.appearance === "logo" && helper.logoUrl) {
    return (
      <span
        className={cn("block bg-white bg-cover bg-center", className)}
        style={{ backgroundImage: `url(${JSON.stringify(helper.logoUrl).slice(1, -1)})` }}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={cn("grid place-items-center text-[26px] leading-none sm:text-[22px]", className)}
      aria-hidden="true"
    >
      {helper.emoji}
    </span>
  );
}

function HelperCard({
  helper,
  isAdded,
  isOwned,
  onOpen,
  onAdd,
  onUse,
  onShare,
}: {
  helper: Helper;
  isAdded: boolean;
  isOwned: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onUse: () => void;
  onShare: () => void;
}) {
  const [background, foreground] = toneFor(helper.slug);
  return (
    <article className="group flex min-h-[284px] flex-col rounded-[26px] border border-border/60 bg-card p-5 text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.03),0_10px_35px_rgb(0_0_0/0.035)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgb(0_0_0/0.04),0_18px_45px_rgb(0_0_0/0.07)]">
      <button onClick={onOpen} className="flex flex-1 cursor-pointer flex-col text-left outline-none">
        <div className="flex items-start justify-between">
          <div
            className="flex size-14 items-center justify-center rounded-[15px] border sm:size-12 sm:rounded-[13px]"
            style={{ background, color: foreground, borderColor: `${foreground}33` }}
          >
            <HelperArtwork helper={helper} className="size-full rounded-[13px]" />
          </div>
          {helper.verificationStatus === "verified" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <BadgeCheck aria-label="Verified and Approved by Sakhi" className="size-5 fill-[var(--tool-call-icon)] stroke-card" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Verified and Approved by Sakhi</TooltipContent>
            </Tooltip>
          ) : helper.status === "pending_review" ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              In review
            </span>
          ) : helper.status === "rejected" ? (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
              Not approved
            </span>
          ) : helper.status === "draft" ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              Only me
            </span>
          ) : null}
        </div>
        <h3 className="mt-5 text-[18px] font-medium">
          {helper.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-muted-foreground">
          {helper.whenToUse}
        </p>
      </button>
      <div className="mt-auto flex items-center justify-between gap-2 pt-5">
        <button
          onClick={onOpen}
          className="flex min-w-0 cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground/80 outline-none"
        >
          <span className="truncate">
            {isOwned ? "Made by you" : `By ${helper.authorName}`}
          </span>
          <ChevronRight className="size-3.5 shrink-0 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
        </button>
        {helper.status === "published" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onShare}
                aria-label="Share Helper"
                className="-mr-1.5 ml-auto grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              >
                <Share className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Share Helper</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="mt-4 flex gap-2 border-t border-border/60 pt-4">
        <Button variant="secondary" onClick={onUse} className="h-9 flex-1 rounded-full">
          Use Helper
        </Button>
        {isAdded && !isOwned ? (
          <Button variant="ghost" onClick={onAdd} className="size-9 rounded-full p-0" aria-label="Remove from My Helpers">
            <Check className="size-4" />
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function HelperDetail({
  helper,
  isAdded,
  isOwned,
  busy,
  submitting,
  onClose,
  onAdd,
  onUse,
  onSubmitForReview,
  onEdit,
  onDelete,
}: {
  helper: Helper | null;
  isAdded: boolean;
  isOwned: boolean;
  busy: boolean;
  submitting: boolean;
  onClose: () => void;
  onAdd: (helper: Helper) => void;
  onUse: (helper: Helper) => void;
  onSubmitForReview: (helper: Helper) => Promise<void>;
  onEdit: (helper: Helper) => void;
  onDelete: (helper: Helper) => void;
}) {
  if (!helper) return null;
  const [background, foreground] = toneFor(helper.slug);
  const available = helper.verificationStatus === "verified" || isOwned || isAdded;
  return (
    <Modal
      isOpen
      closeModal={onClose}
      size="xl"
      className="relative flex max-h-[88vh] flex-col gap-0 rounded-[28px] border border-border/60 bg-card p-0 text-card-foreground shadow-2xl"
    >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex size-7 cursor-pointer items-center justify-center rounded-full bg-muted/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" strokeWidth={2.5} />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-12 sm:px-10">
          <div className="flex flex-col items-start text-left">
            <div
              className="flex size-16 shrink-0 items-center justify-center rounded-[18px] border"
              style={{ background, color: foreground, borderColor: `${foreground}33` }}
            >
              <HelperArtwork helper={helper} className="size-full rounded-[18px]" />
            </div>
            <h2 className="mt-6 text-[24px] font-semibold leading-tight">
              {helper.title}
            </h2>
            <div className="mt-2 flex items-center gap-1.5 text-[13px] leading-5 text-muted-foreground">
              <span>{isOwned ? "Made by you" : `Made by ${helper.authorName}`}</span>
              {helper.usageCount >= MIN_VISIBLE_USAGE_COUNT ? (
                <span>· {formatUsageCount(helper.usageCount)}</span>
              ) : null}
              {helper.verificationStatus === "verified" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <BadgeCheck aria-label="Verified and Approved by Sakhi" className="size-4 fill-[var(--tool-call-icon)] stroke-card" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Verified and Approved by Sakhi</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            <p className="mt-6 max-w-[46ch] text-[15px] leading-7 text-muted-foreground">
              {helper.whenToUse}
            </p>
          </div>
          {isOwned && helper.status === "rejected" ? (
            <div className="-mx-3 mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-left dark:border-red-500/25 dark:bg-red-500/10 sm:-mx-5">
              <p className="text-[13px] font-semibold leading-5 text-red-700 dark:text-red-300">
                Not approved for sharing
              </p>
              <p className="mt-1.5 text-[14px] leading-6 text-red-700/90 dark:text-red-300/90">
                {helper.rejectionReason?.trim() ||
                  "This Helper did not pass review. Edit it and submit again."}
              </p>
            </div>
          ) : null}
          <div className="-mx-3 mt-6 rounded-2xl border border-border/70 bg-muted/60 px-5 py-3 text-left sm:-mx-5">
            <p className="text-[13px] font-medium leading-5 text-muted-foreground">
              What Sakhi will do
            </p>
            <div className="mt-3 h-48 overflow-y-auto pr-3 [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)]">
              <p className="whitespace-pre-wrap pb-6 text-[14px] leading-7 text-foreground/85">
                {helper.instructions}
              </p>
            </div>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 bg-muted/30 p-4 sm:flex sm:items-center sm:justify-between sm:p-5">
          {isOwned ? (
            <div className="contents sm:flex sm:min-w-0 sm:items-center sm:gap-1">
              <Button variant="ghost" onClick={() => onEdit(helper)} className="rounded-full border border-border/60 px-3 sm:border-0">
                <Pencil className="size-4" /> Edit
              </Button>
              <Button variant="ghost" onClick={() => onDelete(helper)} className="rounded-full border border-border/60 px-3 text-destructive hover:text-destructive sm:border-0">
                <Trash2 className="size-4" /> Delete
              </Button>
              {helper.status === "draft" || helper.status === "rejected" ? (
                <Button variant="ghost" disabled={submitting} onClick={() => onSubmitForReview(helper)} className="rounded-full border border-border/60 px-3 sm:border-0">
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                  {submitting
                    ? "Submitting…"
                    : helper.status === "rejected"
                      ? "Submit again"
                      : "Submit for review"}
                </Button>
              ) : helper.status === "pending_review" ? (
                <span className="flex items-center justify-center px-3 text-xs font-medium text-amber-700 dark:text-amber-300">
                  In review
                </span>
              ) : null}
            </div>
          ) : isAdded ? (
            <Button variant="ghost" disabled={busy} onClick={() => onAdd(helper)} className="rounded-full border border-border/60 sm:border-0">Remove</Button>
          ) : <span />}
          {available ? (
            <Button onClick={() => onUse(helper)} className="rounded-full px-5 sm:shrink-0">Use Helper</Button>
          ) : (
            <Button disabled={busy} onClick={() => onUse(helper)} className="rounded-full px-5 sm:shrink-0">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Use Helper
            </Button>
          )}
        </div>
    </Modal>
  );
}

function HelperEditor({
  open,
  helper,
  onOpenChange,
}: {
  open: boolean;
  helper?: Helper | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { createHelper, updateHelper } = useHelperActions();
  const { uploadImages } = useStorageActions();
  const { uid } = useAuth();
  const [title, setTitle] = useState(helper?.title ?? "");
  const [emoji, setEmoji] = useState(helper?.emoji ?? "📖");
  const [appearance, setAppearance] = useState<"emoji" | "logo">(
    helper?.appearance ?? "emoji",
  );
  const [logoUrl, setLogoUrl] = useState(helper?.logoUrl ?? "");
  const [pictureOpen, setPictureOpen] = useState(false);
  const [whenToUse, setWhenToUse] = useState(helper?.whenToUse ?? "");
  const [instructions, setInstructions] = useState(helper?.instructions ?? "");
  const [idea, setIdea] = useState("");
  const [creationMode, setCreationMode] = useState<"ask" | "manual">(
    helper ? "manual" : "ask",
  );
  const [generating, setGenerating] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState(false);
  const [generatingStep, setGeneratingStep] = useState(0);

  useEffect(() => {
    if (!generating) {
      setGeneratingStep(0);
      return;
    }
    const id = setInterval(() => {
      setGeneratingStep((current) =>
        Math.min(current + 1, generatingMessages.length - 1),
      );
    }, 2500);
    return () => clearInterval(id);
  }, [generating]);

  useEffect(() => {
    if (open) {
      setPictureOpen(false);
      setCreationMode(helper ? "manual" : "ask");
      setGeneratedDraft(false);
      if (!helper) {
        setTitle("");
        setEmoji("📖");
        setAppearance("emoji");
        setLogoUrl("");
        setWhenToUse("");
        setInstructions("");
        setIdea("");
      }
    }
  }, [helper, open]);

  const pending = createHelper.isPending || updateHelper.isPending || uploadImages.isPending || generating;

  const restart = () => {
    setTitle("");
    setEmoji("📖");
    setAppearance("emoji");
    setLogoUrl("");
    setWhenToUse("");
    setInstructions("");
    setIdea("");
    setCreationMode("ask");
    setGeneratedDraft(false);
  };

  const generateDraft = async () => {
    if (idea.trim().length < 8) {
      toast.error("Tell Sakhi a little more about the Helper you want");
      return;
    }

    setGenerating(true);
    try {
      const authToken = await auth.currentUser?.getIdToken();
      if (!authToken) throw new Error("Sign in to create a Helper");

      const response = await fetch("/api/helpers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: idea.trim(), authToken }),
      });
      const payload = (await response.json()) as {
        draft?: { title: string; emoji: string; whenToUse: string; instructions: string };
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "Could not draft this Helper");
      }

      setTitle(payload.draft.title);
      setEmoji(payload.draft.emoji);
      setAppearance("emoji");
      setLogoUrl("");
      setWhenToUse(payload.draft.whenToUse);
      setInstructions(payload.draft.instructions);
      setGeneratedDraft(true);
      setCreationMode("manual");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not draft this Helper");
    } finally {
      setGenerating(false);
    }
  };

  const submit = async (submitForReview: boolean) => {
    if (!title.trim() || !whenToUse.trim() || !instructions.trim()) {
      toast.error("Please fill in all three parts");
      return;
    }
    if (appearance === "logo" && !logoUrl) {
      toast.error("Please upload a logo or choose an emoji");
      return;
    }
    try {
      if (helper) {
        await updateHelper.mutateAsync({
          helperId: helper.id,
          title,
          emoji,
          appearance,
          logoUrl,
          whenToUse,
          instructions,
        });
      } else {
        await createHelper.mutateAsync({
          title,
          emoji,
          appearance,
          logoUrl,
          whenToUse,
          instructions,
          submitForReview,
        });
      }
      setTitle(""); setEmoji("📖"); setAppearance("emoji"); setLogoUrl(""); setWhenToUse(""); setInstructions(""); setIdea(""); setCreationMode("ask"); setGeneratedDraft(false); setPictureOpen(false);
      onOpenChange(false);
      toast.success(
        helper
          ? helper.status === "published"
            ? "Changes submitted for review"
            : "Helper updated"
          : submitForReview
            ? "Helper submitted for review"
            : "Helper saved for you",
      );
    } catch {
      // The mutation hook owns the error toast.
    }
  };

  const handleLogoFile = async (file: File | undefined) => {
    if (!file || !uid) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      toast.error("Choose a PNG, JPG, GIF or WebP under 5 MB");
      return;
    }
    try {
      const [uploaded] = await uploadImages.mutateAsync({
        files: [file],
        userId: uid,
      });
      setLogoUrl(uploaded.url);
    } catch {
      // The upload hook displays the error.
    }
  };

  return (
    <Modal
      isOpen={open}
      closeModal={() => onOpenChange(false)}
      clickOutsideToClose={!pending}
      size="xl"
      className="relative flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-[32px] border border-border/60 bg-card p-0 text-card-foreground shadow-2xl"
    >
        <div className="flex h-12 shrink-0 items-center justify-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 size-8 cursor-pointer rounded-full text-muted-foreground"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            aria-label="Close modal"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!helper && creationMode === "ask" ? (
            <AnimatePresence mode="wait" initial={false}>
              {generating ? (
                <motion.div
                  key="generating"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="flex min-h-[460px] flex-col items-center justify-center px-7 pb-10 text-center sm:px-10"
                >
                  <Loader2 className="size-7 animate-spin text-muted-foreground/60" strokeWidth={1.75} />
                  <div className="mt-6 h-6 overflow-hidden">
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={generatingStep}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="text-[17px] font-semibold text-foreground"
                      >
                        {generatingMessages[generatingStep]}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    This might take few seconds
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="ask"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="flex min-h-[460px] flex-col px-7 pb-7 pt-4 sm:px-10"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="flex size-16 items-center justify-center rounded-[20px] bg-primary/10 text-primary">
                      <BookOpen className="size-7" />
                    </div>
                    <h2 className="mt-5 max-w-sm text-[24px] font-semibold leading-[1.2] text-foreground">
                      What should your Helper do?
                    </h2>
                  </div>
                  <div className="mt-8 rounded-2xl border border-border/60 bg-background shadow-xs transition focus-within:border-primary/40">
                    <textarea
                      value={idea}
                      maxLength={2000}
                      autoFocus
                      onChange={(event) => setIdea(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void generateDraft();
                      }}
                      placeholder={
                        'Type the goal you want this Helper to achieve.\n\nLike "Remind me about birthdays in my family"\nor "Track all my monthly subscriptions"'
                      }
                      className="min-h-[140px] w-full resize-none bg-transparent px-5 py-4 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <div className="mt-auto flex flex-col items-center gap-4 pt-8">
                    <Button
                      size="lg"
                      className="h-12 w-full rounded-full text-[15px]"
                      disabled={idea.trim().length < 8}
                      onClick={() => void generateDraft()}
                    >
                      Continue
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setGeneratedDraft(false);
                        setCreationMode("manual");
                      }}
                      className="cursor-pointer text-[13px] font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      Set up manually
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          ) : (
            <div className="px-8 pb-5 pt-2">
              <h2 className="sr-only">{helper ? "Edit your Helper" : "Create your Helper"}</h2>
              <p className="sr-only">Name your Helper, choose a picture, and write its instructions.</p>
              <div className="flex flex-col items-center gap-6 text-center">
                <div className="flex flex-col items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setPictureOpen((v) => !v)}
                    aria-expanded={pictureOpen}
                    aria-label="Change picture"
                    className="group relative cursor-pointer"
                  >
                    <div className="flex size-24 items-center justify-center overflow-hidden rounded-[28px] bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15 transition group-hover:ring-primary/30">
                      {appearance === "logo" && logoUrl ? (
                        <span
                          className="size-full bg-background bg-cover bg-center"
                          style={{ backgroundImage: `url(${JSON.stringify(logoUrl).slice(1, -1)})` }}
                          aria-hidden="true"
                        />
                      ) : (
                        <span className="text-5xl leading-none">{emoji}</span>
                      )}
                    </div>
                    <span className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border-[3px] border-card bg-primary text-primary-foreground shadow-sm transition group-hover:scale-105">
                      <Pencil className="size-3.5" />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPictureOpen((v) => !v)}
                    className="cursor-pointer text-xs font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    {pictureOpen ? "Hide picture options" : "Tap to change picture"}
                  </button>
                </div>
                <div className="w-full">
                  <input
                    value={title}
                    maxLength={40}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Name your Helper"
                    autoFocus
                    className="mx-auto block min-w-[220px] max-w-full border-b border-border/70 bg-transparent pb-2 text-center text-2xl font-semibold text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/45 focus:border-primary"
                  />
                  <p className="mt-1.5 text-center text-xs text-muted-foreground">{title.length}/40</p>
                </div>
              </div>

              {pictureOpen ? (
                <div className="mt-7 flex flex-col items-center rounded-2xl border border-border/60 bg-muted/20 p-5">
                  <div className="mb-4 flex w-full items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">Choose a picture</p>
                    <button
                      type="button"
                      onClick={() => setPictureOpen(false)}
                      className="cursor-pointer text-xs font-medium text-primary transition hover:opacity-80"
                    >
                      Done
                    </button>
                  </div>
                  <div className="mb-4 inline-flex rounded-full bg-muted/60 p-1 ring-1 ring-border/60">
                    <button
                      type="button"
                      onClick={() => setAppearance("emoji")}
                      className={cn(
                        "cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition",
                        appearance === "emoji"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Emoji
                    </button>
                    <button
                      type="button"
                      onClick={() => setAppearance("logo")}
                      className={cn(
                        "cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition",
                        appearance === "logo"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Upload logo
                    </button>
                  </div>
                  {appearance === "emoji" ? (
                    <div className="flex flex-wrap justify-center gap-2.5">
                      {helperEmojis.map((item) => (
                        <button
                          key={item}
                          type="button"
                          aria-label={`Use ${item}`}
                          aria-pressed={emoji === item}
                          onClick={() => setEmoji(item)}
                          className={cn(
                            "grid size-10 cursor-pointer place-items-center rounded-xl text-lg transition duration-150",
                            emoji === item
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-background text-foreground ring-1 ring-border/60 hover:scale-105 hover:bg-accent",
                          )}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  ) : logoUrl ? (
                    <div className="flex w-full items-center gap-3.5 rounded-2xl border border-border/60 bg-background p-3">
                      <div className="relative size-14 shrink-0">
                        <span
                          className="block size-14 rounded-[14px] bg-background bg-cover bg-center shadow-sm ring-1 ring-border"
                          style={{ backgroundImage: `url(${JSON.stringify(logoUrl).slice(1, -1)})` }}
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          onClick={() => setLogoUrl("")}
                          aria-label="Remove logo"
                          className="absolute -right-1.5 -top-1.5 grid size-5 cursor-pointer place-items-center rounded-full bg-foreground text-background shadow-sm transition hover:opacity-85"
                        >
                          <X className="size-3" strokeWidth={2.5} />
                        </button>
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-sm font-semibold text-foreground">Logo added</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Looks best as a square image</p>
                      </div>
                      <label className="shrink-0 cursor-pointer rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent">
                        {uploadImages.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Change"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          className="sr-only"
                          disabled={uploadImages.isPending}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void handleLogoFile(file);
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <label
                      className={cn(
                        "flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-background px-6 py-8 text-center transition hover:border-primary/40 hover:bg-accent/40",
                        uploadImages.isPending && "pointer-events-none opacity-70",
                      )}
                    >
                      <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
                        {uploadImages.isPending ? (
                          <Loader2 className="size-5 animate-spin" />
                        ) : (
                          <ImagePlus className="size-5" />
                        )}
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        {uploadImages.isPending ? "Uploading…" : "Upload a logo"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        PNG, JPG, GIF or WebP · up to 5 MB
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="sr-only"
                        disabled={uploadImages.isPending}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          void handleLogoFile(file);
                        }}
                      />
                    </label>
                  )}
                </div>
              ) : null}

              <div className="mt-8 space-y-6">
                <div>
                  <label htmlFor="helper-when" className="block text-sm font-semibold text-foreground">
                    When should Sakhi use it?
                  </label>
                  <textarea
                    id="helper-when"
                    value={whenToUse}
                    maxLength={180}
                    rows={2}
                    onChange={(e) => setWhenToUse(e.target.value)}
                    placeholder="When I want to find, compare, or apply for jobs."
                    className="mt-2 w-full resize-none rounded-2xl border border-border/60 bg-background px-4 py-3 text-[15px] leading-6 text-foreground shadow-xs outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/40"
                  />
                </div>
                <div>
                  <label htmlFor="helper-instructions" className="block text-sm font-semibold text-foreground">
                    What should Sakhi do?
                  </label>
                  <textarea
                    id="helper-instructions"
                    value={instructions}
                    maxLength={12000}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="First, understand the kind of role I want. Then…"
                    className="mt-2 min-h-[180px] w-full resize-y rounded-2xl border border-border/60 bg-background px-4 py-3 text-[15px] leading-6 text-foreground shadow-xs outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/40"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {creationMode === "ask" ? null : (
        <div className="flex flex-col-reverse gap-2 px-4 pb-4 pt-2 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-5">
          {generatedDraft ? (
            <Button variant="ghost" className="w-full gap-1.5 rounded-full text-muted-foreground sm:w-auto" disabled={pending} onClick={restart}>
              <RotateCcw className="size-4" />
              Start over
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <Button className="w-full rounded-full sm:w-auto" disabled={pending} onClick={() => submit(false)}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {helper ? "Save changes" : "Create Helper"}
          </Button>
        </div>
        )}
    </Modal>
  );
}

function LoadMoreSentinel({
  loading,
  onLoadMore,
}: {
  loading: boolean;
  onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const loadMore = useRef(onLoadMore);
  loadMore.current = onLoadMore;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore.current();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex justify-center py-8" aria-hidden="true">
      {loading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
      ) : null}
    </div>
  );
}

function LoadingGrid() {
  return <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-[284px] animate-pulse rounded-[26px] bg-muted/60" />)}</div>;
}

function EmptyState({ tab, onCreate }: { tab: "discover" | "mine"; onCreate: () => void }) {
  return <div className="mx-auto flex max-w-md flex-col items-center py-28 text-center"><div className="flex size-16 items-center justify-center rounded-[20px] bg-primary/10 text-primary"><BookOpen className="size-7" /></div><h2 className="mt-6 text-2xl font-semibold">{tab === "mine" ? "Your Helpers will live here" : "No Helpers found"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{tab === "mine" ? "Create one or add one from the community." : "Try a different search."}</p>{tab === "mine" ? <Button onClick={onCreate} className="mt-6 rounded-full"><Plus className="size-4" /> Create Helper</Button> : null}</div>;
}
