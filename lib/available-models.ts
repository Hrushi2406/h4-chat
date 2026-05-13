export interface AIModel {
  id: string;
  name: string;
  description: string;
  provider: string;
  maxTokens?: number;
  isDefault?: boolean;
}

export const availableModels: AIModel[] = [
  {
    id: "openai/gpt-5.5",
    name: "GPT 5.5",
    description: "Latest OpenAI flagship for reasoning, tools, and vision",
    provider: "openai",
    maxTokens: 1000000,
  },
  {
    id: "openai/gpt-5.4",
    name: "GPT 5.4",
    description: "Long-context OpenAI model for complex work",
    provider: "openai",
    maxTokens: 1050000,
  },
  {
    id: "openai/gpt-5.4-mini",
    name: "GPT 5.4 Mini",
    description: "Fast OpenAI model for everyday chat and coding",
    provider: "openai",
    maxTokens: 400000,
  },
  {
    id: "openai/gpt-5.4-nano",
    name: "GPT 5.4 Nano",
    description: "Smallest recent OpenAI model for low-latency work",
    provider: "openai",
    maxTokens: 400000,
  },
  {
    id: "anthropic/claude-opus-4.7",
    name: "Claude Opus 4.7",
    description: "Latest Anthropic model for deep reasoning and vision",
    provider: "anthropic",
    maxTokens: 1000000,
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    description: "Balanced Anthropic model for reasoning and tool use",
    provider: "anthropic",
    maxTokens: 1000000,
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    description: "Fast Anthropic model for low-latency reasoning and vision",
    provider: "anthropic",
    maxTokens: 200000,
  },
  {
    id: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    description: "Recent Google Pro model with long context and vision",
    provider: "google",
    maxTokens: 1000000,
  },
  {
    id: "google/gemini-3-flash",
    name: "Gemini 3 Flash",
    description: "Fast Google model for long-context responses",
    provider: "google",
    maxTokens: 1000000,
  },
  {
    id: "google/gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite",
    description: "Recent lightweight Google model for speed",
    provider: "google",
    maxTokens: 1000000,
  },
  {
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    description: "Very low-cost open model with 1M context and tool use",
    provider: "deepseek",
    maxTokens: 1000000,
    isDefault: true,
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    description: "Higher-quality DeepSeek V4 model for reasoning and long context",
    provider: "deepseek",
    maxTokens: 1000000,
  },
  {
    id: "google/gemma-4-31b-it",
    name: "Gemma 4 31B",
    description: "Open Google model for general chat, tool use, files, and vision",
    provider: "google",
    maxTokens: 262144,
  },
  {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    description: "Open-weight Moonshot model for coding, reasoning, and agents",
    provider: "moonshotai",
    maxTokens: 262000,
  },
  {
    id: "minimax/minimax-m2.7",
    name: "MiniMax M2.7",
    description: "Open model for agentic coding, reasoning, files, and vision",
    provider: "minimax",
    maxTokens: 204800,
  },
  {
    id: "xai/grok-4.3",
    name: "Grok 4.3",
    description: "Latest xAI model in the Gateway catalog",
    provider: "xai",
    maxTokens: 1000000,
  },
  {
    id: "xai/grok-4.20-reasoning",
    name: "Grok 4.20 Reasoning",
    description: "Large-context xAI reasoning model",
    provider: "xai",
    maxTokens: 2000000,
  },
];

export const getDefaultModel = (): AIModel => {
  return availableModels.find((model) => model.isDefault) || availableModels[0];
};

export const getModelById = (id: string): AIModel | undefined => {
  return availableModels.find((model) => model.id === id);
};
