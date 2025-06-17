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
        const model = availableModels.find((m) => m.id === value);
        if (model) onModelChange(model);
      }}
    >
      <SelectTrigger className="text-muted-foreground h-10 rounded-full border-0 bg-background hover:bg-accent/50 transition-colors focus:ring-0 focus:outline-none shadow-none">
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
