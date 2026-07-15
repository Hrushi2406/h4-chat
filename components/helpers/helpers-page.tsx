"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Loader2,
  Plus,
  Search,
  Pencil,
  Trash2,
  ImagePlus,
  X,
  BadgeCheck,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import Modal from "@/components/ui/modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useHelperActions, useHelpers } from "@/lib/hooks/helpers/use-helpers";
import { useStorageActions } from "@/lib/hooks/storage/use-storage-actions";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { auth } from "@/lib/clients/firebase";
import type { Helper } from "@/lib/types/helper";

const helperEmojis = ["📖", "💼", "✍️", "🎯", "💡", "📚", "🧭", "✨"];

const ideaPrompts = [
  "Review my emails before I send them",
  "Plan a simple weekly meal menu",
  "Turn long docs into short bullet points",
];

const generatingMessages = [
  "Reading your idea…",
  "Naming your Helper…",
  "Writing the instructions…",
  "Almost there…",
];

function AiOrb({
  size = 56,
  spin = false,
  className,
}: {
  size?: number;
  spin?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <span
        aria-hidden="true"
        className={cn(
          "absolute -inset-3 rounded-full bg-[conic-gradient(from_0deg,var(--primary),transparent_55%,var(--primary))] opacity-40 blur-2xl",
          spin && "animate-spin [animation-duration:5s]",
        )}
      />
      <div className="relative grid h-full w-full place-items-center rounded-[1.1rem] bg-gradient-to-b from-primary to-primary/75 text-primary-foreground shadow-[0_12px_28px_-10px] shadow-primary/60">
        <Sparkles className={cn("size-6", spin && "animate-pulse")} />
      </div>
    </div>
  );
}

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

export default function HelpersPage() {
  const router = useRouter();
  const { data, isLoading } = useHelpers();
  const actions = useHelperActions();
  const [tab, setTab] = useState<"discover" | "mine">("discover");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [selected, setSelected] = useState<Helper | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Helper | null>(null);
  const [deleting, setDeleting] = useState<Helper | null>(null);

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

  const useHelper = async (helper: Helper) => {
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
    <div className="h-full overflow-y-auto bg-[oklch(0.985_0.004_250)] text-[oklch(0.18_0.01_250)] dark:bg-background dark:text-foreground">
      <main className="mx-auto w-full max-w-[1120px] px-5 pb-24 pt-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
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

        <div className="mt-6 border-b border-border pb-4">
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
          <div className="mt-10 space-y-14">
            {verified.length > 0 ? (
              <HelperSection
                title="Made for everyone"
                subtitle="Reviewed by Sakhi"
                helpers={verified}
                added={added}
                owned={owned}
                onOpen={setSelected}
                onAdd={toggleAdded}
                onUse={useHelper}
              />
            ) : null}
            {community.length > 0 ? (
              <HelperSection
                title={tab === "mine" ? "Your collection" : "From the community"}
                subtitle={
                  tab === "mine"
                    ? "Created or added by you"
                    : "Reviewed and approved by Sakhi"
                }
                helpers={community}
                added={added}
                owned={owned}
                onOpen={setSelected}
                onAdd={toggleAdded}
                onUse={useHelper}
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
        onClose={() => setSelected(null)}
        onAdd={toggleAdded}
        onUse={useHelper}
        onEdit={(helper) => {
          setSelected(null);
          setEditing(helper);
        }}
        onDelete={(helper) => {
          setSelected(null);
          setDeleting(helper);
        }}
        onSubmitForReview={async (helper) => {
          await actions.updateHelper.mutateAsync({
            helperId: helper.id,
            status: "pending_review",
          });
          setSelected(null);
          toast.success("Helper submitted for review");
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
  title,
  subtitle,
  helpers,
  added,
  owned,
  onOpen,
  onAdd,
  onUse,
}: {
  title: string;
  subtitle: string;
  helpers: Helper[];
  added: Set<string>;
  owned: Set<string>;
  onOpen: (helper: Helper) => void;
  onAdd: (helper: Helper) => void;
  onUse: (helper: Helper) => void;
}) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.025em]">{title}</h2>
          <p className="mt-1 text-sm text-black/42 dark:text-white/45">{subtitle}</p>
        </div>
      </div>
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
      className={cn("grid place-items-center text-[23px] leading-none", className)}
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
}: {
  helper: Helper;
  isAdded: boolean;
  isOwned: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onUse: () => void;
}) {
  const [background, foreground] = toneFor(helper.slug);
  const isAvailable = helper.verificationStatus === "verified" || isOwned || isAdded;
  return (
    <article className="group flex min-h-[284px] flex-col rounded-[26px] border border-black/[0.07] bg-white/85 p-5 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_10px_35px_rgb(0_0_0/0.035)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgb(0_0_0/0.04),0_18px_45px_rgb(0_0_0/0.07)] dark:border-white/10 dark:bg-white/[0.055]">
      <button onClick={onOpen} className="flex flex-1 flex-col text-left outline-none">
        <div className="flex items-start justify-between">
          <div
            className="flex size-12 items-center justify-center rounded-[14px]"
            style={{ background, color: foreground }}
          >
            <HelperArtwork helper={helper} className="size-full rounded-[14px]" />
          </div>
          {helper.verificationStatus === "verified" ? (
            <span className="flex items-center gap-1 rounded-full bg-[#eaf3ff] px-2.5 py-1 text-[11px] font-semibold text-[#2870d8] dark:bg-blue-500/15 dark:text-blue-300">
              <BadgeCheck className="size-3.5" /> Sakhi approved
            </span>
          ) : helper.status === "pending_review" ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              In review
            </span>
          ) : helper.status === "draft" ? (
            <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-medium text-black/45 dark:bg-white/10 dark:text-white/45">
              Only me
            </span>
          ) : null}
        </div>
        <h3 className="mt-5 text-[20px] font-semibold tracking-[-0.03em]">
          {helper.title}
        </h3>
        <p className="mt-2 line-clamp-3 text-[14px] leading-6 text-black/48 dark:text-white/50">
          {helper.whenToUse}
        </p>
        <div className="mt-auto flex items-center gap-1 pt-5 text-xs font-medium text-black/35 dark:text-white/35">
          {isOwned ? "Made by you" : `By ${helper.authorName}`}
          <ChevronRight className="size-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
        </div>
      </button>
      <div className="mt-4 flex gap-2 border-t border-black/[0.06] pt-4 dark:border-white/10">
        {isAvailable ? (
          <Button onClick={onUse} className="h-9 flex-1 rounded-full">
            Use Helper <ArrowRight className="size-3.5" />
          </Button>
        ) : (
          <Button onClick={onUse} className="h-9 flex-1 rounded-full">
            Use Helper <ArrowRight className="size-3.5" />
          </Button>
        )}
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
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-[28px] border-black/10 bg-[oklch(0.99_0.003_250)] p-0 shadow-2xl sm:max-w-[620px] dark:border-white/10 dark:bg-background">
        <div className="p-7 sm:p-9">
          <div className="flex size-14 items-center justify-center rounded-[17px]" style={{ background, color: foreground }}>
            <HelperArtwork helper={helper} className="size-full rounded-[17px]" />
          </div>
          <DialogHeader className="mt-6 pr-7 text-left">
            <DialogTitle className="text-3xl tracking-[-0.045em]">{helper.title}</DialogTitle>
            <DialogDescription className="text-[15px] leading-6">
              {helper.whenToUse}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-7 rounded-2xl bg-black/[0.035] p-5 dark:bg-white/[0.06]">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-black/38 dark:text-white/40">
              What Sakhi will do
            </p>
            <p className="whitespace-pre-wrap text-[14px] leading-6 text-black/65 dark:text-white/65">
              {helper.instructions}
            </p>
          </div>
          <div className="mt-5 flex items-center justify-between text-sm text-black/42 dark:text-white/45">
            <span>{isOwned ? "Made by you" : `Made by ${helper.authorName}`}</span>
            {helper.verificationStatus === "verified" ? (
              <span className="flex items-center gap-1 text-[#2870d8]"><BadgeCheck className="size-4" /> Sakhi approved</span>
            ) : null}
          </div>
        </div>
        <DialogFooter className="border-t border-black/[0.07] bg-white/60 p-5 sm:justify-between dark:border-white/10 dark:bg-white/[0.03]">
          {isOwned ? (
            <div className="flex items-center gap-1">
              <Button variant="ghost" onClick={() => onEdit(helper)} className="rounded-full px-3">
                <Pencil className="size-4" /> Edit
              </Button>
              <Button variant="ghost" onClick={() => onDelete(helper)} className="rounded-full px-3 text-destructive hover:text-destructive">
                <Trash2 className="size-4" /> Delete
              </Button>
              {helper.status === "draft" ? (
                <Button variant="ghost" onClick={() => onSubmitForReview(helper)} className="rounded-full px-3">
                  Submit for review
                </Button>
              ) : helper.status === "pending_review" ? (
                <span className="px-3 text-xs font-medium text-amber-700 dark:text-amber-300">
                  In review
                </span>
              ) : null}
            </div>
          ) : isAdded ? (
            <Button variant="ghost" disabled={busy} onClick={() => onAdd(helper)} className="rounded-full">Remove</Button>
          ) : <span />}
          {available ? (
            <Button onClick={() => onUse(helper)} className="rounded-full px-5">Use Helper <ArrowRight className="size-4" /></Button>
          ) : (
            <Button disabled={busy} onClick={() => onUse(helper)} className="rounded-full px-5">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Use Helper <ArrowRight className="size-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      setGeneratingStep((current) => (current + 1) % generatingMessages.length);
    }, 1500);
    return () => clearInterval(id);
  }, [generating]);

  const steps = ["identity", "when", "instructions"] as const;
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(helper ? steps.length - 1 : 0);

  useEffect(() => {
    if (open) {
      setStep(0);
      setMaxStep(helper ? 2 : 0);
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

  const identityValid = title.trim().length > 0 && (appearance !== "logo" || Boolean(logoUrl));
  const whenValid = whenToUse.trim().length > 0;
  const isLastStep = step === steps.length - 1;
  const pending = createHelper.isPending || updateHelper.isPending || uploadImages.isPending || generating;

  const restart = () => {
    setTitle("");
    setEmoji("📖");
    setAppearance("emoji");
    setLogoUrl("");
    setWhenToUse("");
    setInstructions("");
    setIdea("");
    setStep(0);
    setMaxStep(0);
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
      setStep(0);
      setMaxStep(steps.length - 1);
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
      setTitle(""); setEmoji("📖"); setAppearance("emoji"); setLogoUrl(""); setWhenToUse(""); setInstructions(""); setIdea(""); setCreationMode("ask"); setGeneratedDraft(false); setStep(0); setMaxStep(0); setPictureOpen(false);
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

  const goNext = () => {
    if (step === 0 && !identityValid) {
      toast.error(!title.trim() ? "Give your Helper a name" : "Upload a logo or switch to emoji");
      return;
    }
    if (step === 1 && !whenValid) {
      toast.error("Tell Sakhi when it should step in");
      return;
    }
    setMaxStep((m) => Math.max(m, step + 1));
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const goTo = (index: number) => {
    if (index <= maxStep) setStep(index);
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

  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  return (
    <Modal
      isOpen={open}
      closeModal={() => onOpenChange(false)}
      clickOutsideToClose={!pending}
      size="xl"
      className="relative flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-[32px] border border-border/60 bg-card p-0 text-card-foreground shadow-2xl"
    >
        <div className="flex h-12 shrink-0 items-center justify-center">
          {creationMode === "manual" ? (
            <div className="flex items-center gap-1.5">
              {steps.map((key, index) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => goTo(index)}
                  aria-label={`Go to step ${index + 1}`}
                  aria-current={step === index}
                  disabled={index > maxStep}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-200",
                    step === index
                      ? "w-6 bg-primary"
                      : index <= maxStep
                        ? "w-1.5 bg-primary/40 hover:bg-primary/60"
                        : "w-1.5 bg-foreground/15",
                  )}
                />
              ))}
            </div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-4 top-2 size-8 rounded-full text-muted-foreground"
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
                  <AiOrb size={64} spin />
                  <div className="mt-8 h-6 overflow-hidden">
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={generatingStep}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="text-[15px] font-medium text-foreground"
                      >
                        {generatingMessages[generatingStep]}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                  <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                    Sakhi is turning your idea into a Helper.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="ask"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="flex min-h-[460px] flex-col px-7 pb-7 pt-9 sm:px-10"
                >
                  <div className="flex flex-col items-center text-center">
                    <AiOrb size={56} />
                    <h2 className="mt-6 max-w-sm text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] text-foreground">
                      What should your Helper do?
                    </h2>
                    <p className="mt-2 max-w-sm text-[15px] leading-6 text-muted-foreground">
                      Describe it naturally — Sakhi will write the name, trigger, and instructions for you.
                    </p>
                  </div>
                  <div className="mt-7 rounded-[24px] border border-border bg-muted/30 transition focus-within:border-primary/45 focus-within:bg-background focus-within:ring-4 focus-within:ring-primary/5">
                    <textarea
                      value={idea}
                      maxLength={2000}
                      autoFocus
                      onChange={(event) => setIdea(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void generateDraft();
                      }}
                      placeholder="I want a Helper that reviews my emails before I send them. It should keep my voice, make them clearer, and flag anything that might sound harsh…"
                      className="min-h-[140px] w-full resize-none bg-transparent px-5 py-4 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Be specific about the result you want</span>
                    <span>{idea.length}/2000</span>
                  </div>
                  {!idea ? (
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {ideaPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setIdea(prompt)}
                          className="cursor-pointer rounded-full border border-border/70 bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-auto flex flex-col items-center gap-3 pt-7">
                    <Button
                      size="lg"
                      className="h-12 w-full rounded-full text-[15px] shadow-[0_12px_28px_-10px] shadow-primary/50"
                      disabled={idea.trim().length < 8}
                      onClick={() => void generateDraft()}
                    >
                      <Sparkles className="size-4" />
                      Create draft
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setGeneratedDraft(false);
                        setCreationMode("manual");
                      }}
                      className="cursor-pointer text-sm font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      Build it manually instead
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          ) : step === 0 ? (
            <div className="px-8 pb-5 pt-8">
              <h2 className="sr-only">Give it a name and picture</h2>
              <p className="sr-only">Name your Helper and choose an emoji or logo.</p>
              <div className="flex flex-col items-center gap-7 text-center">
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
                <div className="w-full max-w-[280px]">
                  <input
                    value={title}
                    maxLength={40}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Name your Helper"
                    autoFocus
                    className="w-full border-b border-border/70 bg-transparent pb-2 text-center text-2xl font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-primary"
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
            </div>
          ) : step === 1 ? (
            <div className="flex flex-col items-center gap-3 px-8 pb-5 pt-2 text-center">
              <StepHeading title="When should Sakhi use it?" subtitle="Describe the moment this Helper should step in." align="center" />
              <textarea
                value={whenToUse}
                maxLength={180}
                rows={1}
                autoFocus
                onChange={(e) => setWhenToUse(e.target.value)}
                placeholder="When I want to find, compare, or apply for jobs."
                className="mt-2 h-11 w-full resize-none overflow-hidden rounded-2xl border border-border/60 bg-muted/30 px-4 py-2.5 text-center text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-background"
              />
              <p className="w-full text-right text-xs text-muted-foreground">{whenToUse.length}/180</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-8 pb-5 pt-2 text-center">
              <StepHeading title="What should Sakhi do?" subtitle="Write clear, step-by-step instructions." align="center" />
              <textarea
                value={instructions}
                maxLength={12000}
                autoFocus
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="First, understand the kind of role I want. Then…"
                className="mt-2 min-h-[220px] w-full resize-y rounded-2xl border border-border/60 bg-muted/30 px-4 pb-4 pt-2.5 text-left text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-background"
              />
            </div>
          )}
        </div>

        {creationMode === "ask" ? null : (
        <div className="flex flex-row items-center justify-between gap-2 px-6 pb-5 pt-2 [&_button]:w-auto [&_button]:shrink-0">
          {step > 0 ? (
            <Button variant="ghost" className="gap-1.5 rounded-full" disabled={pending} onClick={goPrev}>
              <ChevronLeft className="size-4" />
              Previous
            </Button>
          ) : generatedDraft ? (
            <Button variant="ghost" className="gap-1.5 rounded-full text-muted-foreground" disabled={pending} onClick={restart}>
              <RotateCcw className="size-4" />
              Start over
            </Button>
          ) : (
            <span />
          )}
          {isLastStep ? (
            <Button className="rounded-full" disabled={pending} onClick={() => submit(false)}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {helper ? "Save changes" : "Create Helper"}
            </Button>
          ) : (
            <Button className="gap-1.5 rounded-full pl-4 pr-3 has-[>svg]:pl-4 has-[>svg]:pr-3" onClick={goNext}>
              Next
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
        )}
    </Modal>
  );
}

function StepHeading({
  title,
  subtitle,
  align = "left",
}: {
  title: string;
  subtitle: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("flex flex-col gap-1 p-0", align === "center" ? "items-center text-center" : "items-start text-left")}>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function LoadingGrid() {
  return <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-[284px] animate-pulse rounded-[26px] bg-black/[0.045] dark:bg-white/[0.06]" />)}</div>;
}

function EmptyState({ tab, onCreate }: { tab: "discover" | "mine"; onCreate: () => void }) {
  return <div className="mx-auto flex max-w-md flex-col items-center py-28 text-center"><div className="flex size-16 items-center justify-center rounded-[20px] bg-[#eaf2ff] text-[#3978f6]"><BookOpen className="size-7" /></div><h2 className="mt-6 text-2xl font-semibold tracking-[-0.035em]">{tab === "mine" ? "Your Helpers will live here" : "No Helpers found"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{tab === "mine" ? "Create one or add one from the community." : "Try a different search."}</p>{tab === "mine" ? <Button onClick={onCreate} className="mt-6 rounded-full"><Plus className="size-4" /> Create Helper</Button> : null}</div>;
}
