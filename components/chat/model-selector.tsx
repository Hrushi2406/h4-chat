import { AIModel, availableModels } from "@/lib/available-models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { blurBackground } from "@/lib/utils";
import { getBrandLogo } from "@/lib/brand-logos";

const selectableModels = availableModels.filter(
  (model) => model.provider === "deepseek",
);

interface ModelSelectorProps {
  selectedModel: AIModel;
  onModelChange: (model: AIModel) => void;
}

export const ModelSelector = ({
  selectedModel,
  onModelChange,
}: ModelSelectorProps) => {
  return (
    <Select
      value={selectedModel.id}
      onValueChange={(value) => {
        const model = selectableModels.find((m) => m.id === value);
        if (model) onModelChange(model);
      }}
    >
      <SelectTrigger className="h-10 w-fit max-w-full shrink-0 rounded-full border-0 bg-background text-muted-foreground shadow-none transition-colors hover:bg-accent/50 focus:outline-none focus:ring-0">
        <SelectValue placeholder="Select Model">
          <div className="flex items-center gap-2">
            {(() => {
              const brandLogo = getBrandLogo(selectedModel.provider);
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
        {selectableModels.map((model) => {
          const brandLogo = getBrandLogo(model.provider);
          const LogoComponent = brandLogo?.component;
          return (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center gap-3">
                {LogoComponent && (
                  <LogoComponent className="w-4 h-4 flex-shrink-0" />
                )}
                <div className="flex flex-col items-start">
                  <span className="font-medium">{model.name}</span>
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
  );
};
