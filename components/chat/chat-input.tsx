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
  Diamond,
  Hexagon,
  Minus,
  Pentagon,
  Plus,
  Square,
  Star,
  Triangle,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useState } from "react";
import { motion } from "framer-motion";
import {
  availableModels,
  getDefaultModel,
  type AIModel,
} from "@/lib/available-models";
import { getBrandLogo } from "@/lib/brand-logos";
import clsx from "clsx";
import { blurBackground, cn } from "@/lib/utils";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onStop: () => void;
  selectedModel: AIModel;
  onModelChange: (model: AIModel) => void;
}

export const ChatInput = ({
  input,
  isLoading,
  handleInputChange,
  handleSubmit,
  onStop,
  selectedModel,
  onModelChange,
}: ChatInputProps) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        handleSubmit(e as any);
      }
    }
  };

  const handleStopGeneration = () => {
    onStop();
  };

  return (
    <div className="p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-end gap-3">
          <div
            className={cn(
              "flex-1 relative border-2 rounded-3xl focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all duration-200"
            )}
          >
            <form onSubmit={handleSubmit}>
              <div className="p-2">
                {/* Textarea */}
                <div className="relative">
                  <Textarea
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message here..."
                    className="w-full min-h-[48px] max-h-[200px] resize-none rounded-2xl border-0 bg-transparent text-base leading-relaxed transition-all duration-200 focus:ring-0 focus:border-0 focus:outline-none focus-visible:ring-0 shadow-none"
                    rows={1}
                  />
                </div>

                {/* Bottom Row: Model Selector + Button */}
                <div className="flex items-center justify-between gap-3">
                  {/* Model Selector */}
                  <div className="flex-shrink-0">
                    <Select
                      value={selectedModel.id}
                      onValueChange={(value) => {
                        const model = availableModels.find(
                          (m) => m.id === value
                        );
                        if (model) onModelChange(model);
                      }}
                    >
                      <SelectTrigger className="text-muted-foreground h-10 rounded-full border-0 bg-white dark:bg-black hover:bg-accent/50 transition-colors focus:ring-0 focus:outline-none shadow-none">
                        <SelectValue placeholder="Select Model">
                          <div className="flex items-center gap-2">
                            {(() => {
                              const brandLogo = getBrandLogo(
                                selectedModel.provider
                              );
                              const LogoComponent = brandLogo?.component;
                              return LogoComponent ? (
                                <LogoComponent className="w-4 h-4" />
                              ) : null;
                            })()}
                            <span>{selectedModel.name}</span>
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className={blurBackground}>
                        {availableModels.map((model) => {
                          const brandLogo = getBrandLogo(model.provider);
                          const LogoComponent = brandLogo?.component;
                          return (
                            <SelectItem key={model.id} value={model.id}>
                              <div className="flex items-center gap-3">
                                {LogoComponent && (
                                  <LogoComponent className="w-4 h-4 flex-shrink-0" />
                                )}
                                <div className="flex flex-col items-start">
                                  <span className="font-medium">
                                    {model.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {model.description}
                                  </span>
                                </div>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Send/Stop Button */}
                  <div className="flex-shrink-0">
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
                        disabled={!input.trim() && !isLoading}
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
