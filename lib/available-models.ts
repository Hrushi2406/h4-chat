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
    id: "gpt-4.1",
    name: "GPT-4.1",
    description: "Most capable model, best for complex tasks",
    provider: "openai",
    maxTokens: 128000,
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    description: "Faster and more cost-effective",
    provider: "openai",
    maxTokens: 128000,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    description: "OpenAI's most advanced multimodal model",
    provider: "openai",
    maxTokens: 128000,
  },
  {
    id: "o4-mini-2025-04-16",
    name: "o4 mini",
    description: "Faster, more affordable reasoning model",
    provider: "openai",
    maxTokens: 128000,
  },
  {
    id: "o3-mini-2025-01-31",
    name: "o3 mini",
    description: "Compact and efficient reasoning model",
    provider: "openai",
    maxTokens: 128000,
  },
  {
    id: "gemini-2.0-flash-exp",
    name: "Gemini 2.0 Flash",
    description: "Google's latest fast model for quick responses",
    provider: "google",
    isDefault: true,
    maxTokens: 1000000,
  },
  {
    id: "gemini-2.5-flash-preview-05-20",
    name: "Gemini 2.5 Flash",
    description: "Google's latest high-speed model with improved capabilities",
    provider: "google",
    maxTokens: 1000000,
  },
  {
    id: "gemini-2.5-pro-preview-06-05",
    name: "Gemini 2.5 Pro",
    description: "Google's most capable model for complex reasoning",
    provider: "google",
    maxTokens: 2000000,
  },
];

export const getDefaultModel = (): AIModel => {
  return availableModels.find((model) => model.isDefault) || availableModels[0];
};

export const getModelById = (id: string): AIModel | undefined => {
  return availableModels.find((model) => model.id === id);
};
