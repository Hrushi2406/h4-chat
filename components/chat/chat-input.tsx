"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowUp,
  CloudUpload,
  FileText,
  Globe,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { type AIModel } from "@/lib/available-models";
import clsx from "clsx";
import { cn } from "@/lib/utils";
import { useDropzone } from "react-dropzone";
import { useStorageActions } from "@/lib/hooks/storage/use-storage-actions";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { usePathname } from "next/navigation";
import { ModelSelector } from "./model-selector";
import { Attachment, type ThreadMessageMetadata } from "@/lib/types/thread";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const CONTEXT_WINDOW_TOKENS = 200_000;

interface ChatInputProps {
  input: string;
  tokenUsage?: ThreadMessageMetadata;
  isLoading: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onStop: () => void;
  selectedModel: AIModel;
  onModelChange: (model: AIModel) => void;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  searchEnabled: boolean;
  setSearchEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export const ChatInput = ({
  input,
  tokenUsage,
  isLoading,
  handleInputChange,
  handleSubmit,
  onStop,
  selectedModel,
  onModelChange,
  attachments,
  setAttachments,
  searchEnabled,
  setSearchEnabled,
}: ChatInputProps) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { uploadImages } = useStorageActions();
  const { uid } = useAuth();
  const pathname = usePathname();
  const threadId = pathname.split("/").pop();

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading && !uploadImages.isPending) {
        handleFormSubmit(e as any);
      }
    }
  };

  const handleStopGeneration = () => {
    onStop();
  };

  const handleImageUpload = useCallback(
    async (acceptedFiles: File[]) => {
      setSelectedFiles(acceptedFiles);

      const files = await uploadImages.mutateAsync({
        files: acceptedFiles,
        userId: uid!,
        threadId: threadId,
      });

      if (files) {
        const transformedFiles: Attachment[] = files.map((file) => {
          return {
            name: file.fileName,
            url: file.url,
            contentType: file.fileType,
            id: file.fileId,
          };
        });
        setAttachments(transformedFiles);
      }
    },
    [uploadImages, uid, threadId, setAttachments]
  );

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prevFiles) => {
      const newFiles = [...prevFiles];
      newFiles.splice(index, 1);
      return newFiles;
    });

    // Update attachments when removing a file
    setAttachments((prevAttachments) => {
      const newAttachments = [...prevAttachments];
      newAttachments.splice(index, 1);
      return newAttachments as Attachment[];
    });
  };

  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(e);
    setSelectedFiles([]);
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".webp"],
      "application/pdf": [".pdf"],
    },
    onDrop: handleImageUpload,
    noClick: true,
    noKeyboard: true,
    maxSize: 10485760, // 10MB
  });

  return (
    <div className="p-2 pt-3 ">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-end gap-3">
          <div
            className={cn(
              "flex-1 relative border-2 rounded-3xl focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all duration-200"
            )}
            {...getRootProps()}
          >
            {isDragActive && (
              <div className="absolute grid place-items-center  inset-0 bg-black/40 backdrop-blur-md rounded-3xl">
                <p className="text-white text-sm">Drop files here...</p>
              </div>
            )}
            <input {...getInputProps()} />
            <form onSubmit={handleFormSubmit}>
              <div className="p-2">
                {/* File Previews */}
                {selectedFiles.length > 0 && (
                  <FilePreviews
                    selectedFiles={selectedFiles}
                    handleRemoveFile={handleRemoveFile}
                    isUploading={uploadImages.isPending}
                  />
                )}

                {/* Textarea */}
                <div className="relative">
                  <Textarea
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      isDragActive
                        ? "Drop files here..."
                        : "Type your message here..."
                    }
                    className="w-full min-h-[48px] max-h-[200px] resize-none rounded-2xl border-0 bg-transparent text-base leading-relaxed transition-all duration-200 focus:ring-0 focus:border-0 focus:outline-none focus-visible:ring-0 shadow-none"
                    rows={1}
                  />
                </div>

                <div className="flex items-center justify-between gap-r">
                  <div className="flex-2 flex items-center gap-2 px-2 py-0.5 justify-end rounded-full max-w-max">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={open}
                      className="text-muted-foreground font-normal rounded-full border"
                      aria-label="Upload file"
                      tabIndex={0}
                    >
                      <Paperclip className="h-6 w-6 text-muted-foreground " />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSearchEnabled(!searchEnabled)}
                      className={clsx(
                        "rounded-full px-3 text-muted-foreground brder transition-all hover:bg-auto",
                        searchEnabled &&
                          "bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100 hover:text-blue-600 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950 dark:hover:text-blue-200"
                      )}
                      aria-label="Toggle web search"
                      tabIndex={0}
                    >
                      <Globe className={cn("h-5 w-5")} />
                      Search
                    </Button>
                    <ContextWindowIndicator tokenUsage={tokenUsage} />
                  </div>

                  <div className="flex-1 flex justify-end flex-shrink-0 ">
                    <ModelSelector
                      selectedModel={selectedModel}
                      onModelChange={onModelChange}
                    />
                  </div>

                  <div className="flex-shrink-0 ml-1 fex-1 flex justify-end">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ duration: 0.1 }}
                    >
                      <Button
                        type={isLoading ? "button" : "submit"}
                        size="icon"
                        variant={isLoading ? "ghost" : "default"}
                        onClick={isLoading ? handleStopGeneration : undefined}
                        disabled={
                          (!input.trim() && !isLoading) ||
                          uploadImages.isPending
                        }
                        className={clsx(
                          "h-10 w-10 rounded-full transition-colors disabled:opacity-50"
                        )}
                      >
                        {isLoading ? (
                          <Square className="h-10 w-10 animate-[spin_2s_linear_infinite] fill-current" />
                        ) : (
                          <ArrowUp className="h-3 w-3" />
                        )}
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

const formatTokenCount = (
  tokenCount: number,
  { precision = false }: { precision?: boolean } = {}
) => {
  if (tokenCount >= 1_000) {
    if (precision) {
      const value = tokenCount / 1_000;
      return `${Number.isInteger(value) ? value : value.toFixed(1)}K`;
    }

    return `${Math.round(tokenCount / 1_000)}K`;
  }

  return tokenCount.toString();
};

const ContextWindowIndicator = ({
  tokenUsage,
}: {
  tokenUsage?: ThreadMessageMetadata;
}) => {
  const inputTokens = tokenUsage?.inputTokens ?? 0;
  const outputTokens = tokenUsage?.outputTokens ?? 0;
  const tokenCount = tokenUsage?.totalTokens ?? inputTokens + outputTokens;
  const clampedTokenCount = Math.min(tokenCount, CONTEXT_WINDOW_TOKENS);
  const percent = clampedTokenCount / CONTEXT_WINDOW_TOKENS;
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - percent);
  const isNearLimit = percent >= 0.8;
  const isFull = tokenCount >= CONTEXT_WINDOW_TOKENS;
  const displayedTokenCount = formatTokenCount(clampedTokenCount, {
    precision: true,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full border bg-background px-2 text-[11px] font-medium text-muted-foreground shadow-xs",
            isNearLimit &&
              "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/70 dark:bg-amber-950/30 dark:text-amber-300"
          )}
          role="progressbar"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={CONTEXT_WINDOW_TOKENS}
          aria-valuenow={clampedTokenCount}
          aria-label={`${displayedTokenCount} of 200K chat tokens used`}
        >
          <svg
            className="h-5 w-5 -rotate-90"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <circle
              cx="10"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.18"
              strokeWidth="2"
            />
            <circle
              cx="10"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className={cn(
                "text-primary transition-[stroke-dashoffset]",
                isNearLimit && "text-amber-500"
              )}
            />
          </svg>
          <span className="tabular-nums">
            {displayedTokenCount}/200K
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="space-y-1 text-center">
        <div className="font-medium">
          {displayedTokenCount}/200K
        </div>
        <div>
          {isFull
            ? "Chat token usage is at 200K"
            : `${formatTokenCount(inputTokens, {
                precision: true,
              })} input + ${formatTokenCount(outputTokens, {
                precision: true,
              })} output tokens`}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

interface FilePreviewsProps {
  selectedFiles: File[];
  handleRemoveFile: (index: number) => void;
  isUploading: boolean;
}

const FilePreviews = ({
  selectedFiles,
  handleRemoveFile,
  isUploading,
}: FilePreviewsProps) => {
  return (
    <div className="flex flex-wrap gap-2 mb-2 p-2">
      {selectedFiles.map((file, index) => (
        <div key={index} className="relative group">
          <div className="w-16 h-16 rounded-lg overflow-hidden border border-border">
            <div className="relative w-full h-full">
              {file.type.startsWith("image/") ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Preview ${index}`}
                  className="w-full h-full object-cover"
                  onLoad={() => {
                    return () => URL.revokeObjectURL(URL.createObjectURL(file));
                  }}
                />
              ) : file.type === "application/pdf" ? (
                <div className="w-full h-full flex items-center justify-center bg-muted/20">
                  <FileText className="h-8 w-8 text-primary" />
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted/20">
                  <Paperclip className="h-8 w-8 text-primary" />
                </div>
              )}

              {isUploading && (
                <div className="absolute inset-0 bg-background/20 backdrop-blur-sm flex items-center justify-center animate-pulse">
                  <CloudUpload className="h-6 w-6 text-primary" />
                </div>
              )}
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="absolute -top-2 -right-2 p-2 h-5 w-5 rounded-full shadow-sm bg-background/40 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveFile(index);
            }}
            aria-label="Remove file"
            disabled={isUploading}
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
      ))}
    </div>
  );
};
