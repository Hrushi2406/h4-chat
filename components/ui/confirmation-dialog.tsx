"use client";

import { Loader2, X } from "lucide-react";
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmingLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmingLabel,
  cancelLabel = "Cancel",
  isConfirming = false,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  return (
    <Modal
      isOpen={open}
      closeModal={onCancel}
      size="lg"
      className="rounded-3xl bg-white p-6 shadow-none dark:bg-card"
      clickOutsideToClose={!isConfirming}
    >
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full text-muted-foreground"
            onClick={onCancel}
            disabled={isConfirming}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="rounded-full"
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isConfirming && confirmingLabel ? confirmingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
