"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUp,
  CloudUpload,
  Diamond,
  FileText,
  Globe,
  Hexagon,
  Image,
  Loader2,
  Minus,
  Paperclip,
  Pentagon,
  Plus,
  Square,
  Star,
  Sun,
  Triangle,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
  availableModels,
  getDefaultModel,
  type AIModel,
} from "@/lib/available-models";
import { getBrandLogo } from "@/lib/brand-logos";
import clsx from "clsx";
import { blurBackground, cn } from "@/lib/utils";
import { useDropzone } from "react-dropzone";
import { useStorageActions } from "@/lib/hooks/storage/use-storage-actions";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { usePathname } from "next/navigation";
import { ModelSelector } from "./model-selector";
import { Attachment, ChatRequestOptions } from "ai";
import { UseChatHelpers } from "@ai-sdk/react";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  // handleSubmit: UseChatHelpers["handleSubmit"];
  handleSubmit: (
    e: FormEvent<HTMLFormElement>,
    options: ChatRequestOptions
  ) => void;
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
    handleSubmit(e, {
      experimental_attachments: attachments,
    });
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
    <div className="p-4 ">
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

                {/* Bottom Row: Model Selector + Button */}
                <div className="flex items-center justify-between gap-r">
                  {/* Model Selector */}

                  {/* Attachments Upload Button */}
                  <div className="flex-2 flex items-center gap-2 px-2 py-0.5 justify-end border- bg-secondar rounded-full max-w-max">
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
                          "bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100 hover:text-blue-600"
                      )}
                      aria-label="Toggle web search"
                      tabIndex={0}
                    >
                      <Globe className={cn("h-5 w-5")} />
                      Search
                    </Button>
                  </div>

                  {/* Search Toggle Button */}
                  <div className="flex-1 flex justify-end flex-shrink-0 ">
                    <ModelSelector
                      selectedModel={selectedModel}
                      onModelChange={onModelChange}
                    />
                  </div>

                  {/* Send/Stop Button */}
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
                          <Square className="h-10 w-10 animate-[spin_2s_linear_infinite] fill-black" />
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
