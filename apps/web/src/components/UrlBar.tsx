import { useState, type ChangeEventHandler, type FormEventHandler } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DEFAULT_URL = "https://www.amazon.com/dp/B09V3KXJPB";

interface Props {
  onRun: (url: string) => void;
  onCancel?: () => void;
  isStreaming?: boolean;
  statusLine?: string;
  errorLine?: string | null;
}

export function UrlBar({
  onRun,
  onCancel,
  isStreaming = false,
  statusLine,
  errorLine = null,
}: Props) {
  const [url, setUrl] = useState(DEFAULT_URL);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    setUrl(e.target.value);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (isStreaming) {
      onCancel?.();
      return;
    }
    if (url.trim()) onRun(url.trim());
  };

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2"
      >
        <Input
          type="url"
          value={url}
          onChange={handleChange}
          placeholder="amazon.com/dp/..."
          className="flex-1 border-0 bg-transparent font-mono text-sm shadow-none focus-visible:ring-0 focus-visible:border-0"
          aria-label="Amazon product URL"
          disabled={isStreaming}
        />
        {isStreaming ? (
          <Button
            type="submit"
            className="bg-danger text-bg hover:bg-danger/90 focus-visible:ring-danger/50"
            aria-label="Cancel run"
          >
            Cancel
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="submit"
            className="bg-accent text-bg hover:bg-accent/90 focus-visible:ring-accent/50"
            aria-label="Run shadow shopper analysis"
          >
            Run
            <Play className="h-4 w-4" />
          </Button>
        )}
      </form>
      <div
        className={cn(
          "min-h-[1rem] font-mono text-xs",
          errorLine ? "text-danger" : "text-muted",
        )}
        role="status"
        aria-live="polite"
      >
        {errorLine ?? statusLine ?? ""}
      </div>
    </div>
  );
}
