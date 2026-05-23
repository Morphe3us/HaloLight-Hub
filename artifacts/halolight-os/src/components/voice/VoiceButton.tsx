import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VoiceInputState } from "@/hooks/useVoiceInput";

interface VoiceButtonProps {
  state: VoiceInputState;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  partialTranscript?: string;
}

export function VoiceButton({
  state,
  onClick,
  disabled,
  className,
  partialTranscript,
}: VoiceButtonProps) {
  if (state === "unsupported") return null;

  const isListening = state === "listening";
  const isBusy = state === "processing" || state === "requesting";
  const isError = state === "error";

  return (
    <div className="relative flex items-center justify-center">
      {isListening && (
        <>
          <span className="absolute inset-0 rounded-full bg-destructive/25 animate-ping pointer-events-none" />
          <span
            className="absolute rounded-full bg-destructive/15 animate-ping pointer-events-none"
            style={{
              inset: "-5px",
              animationDelay: "0.15s",
              animationDuration: "1.2s",
            }}
          />
        </>
      )}

      <button
        type="button"
        onClick={onClick}
        disabled={disabled || isBusy}
        aria-label={isListening ? "Stop recording" : "Start voice input"}
        aria-pressed={isListening}
        className={cn(
          "relative h-11 w-11 rounded-full flex items-center justify-center",
          "transition-all duration-200 shrink-0 select-none touch-manipulation",
          "border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isListening &&
            "bg-destructive border-destructive text-destructive-foreground shadow-md shadow-destructive/30 scale-105",
          isBusy && "bg-muted border-muted-foreground/20 text-muted-foreground",
          isError && "bg-destructive/8 border-destructive/20 text-destructive",
          !isListening &&
            !isBusy &&
            !isError &&
            "bg-background border-input text-muted-foreground hover:text-foreground hover:bg-muted",
          className
        )}
      >
        {isBusy ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isError ? (
          <MicOff className="w-5 h-5" />
        ) : isListening ? (
          <span className="flex items-end gap-px h-5 w-5 justify-center pb-0.5">
            {[3, 5, 4, 5, 3].map((h, i) => (
              <span
                key={i}
                className="w-0.5 rounded-full bg-current animate-bounce"
                style={{
                  height: `${h * 12}%`,
                  animationDelay: `${i * 80}ms`,
                  animationDuration: "500ms",
                }}
              />
            ))}
          </span>
        ) : (
          <Mic className="w-5 h-5" />
        )}
      </button>

      {partialTranscript && isListening && (
        <div
          className={cn(
            "absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50",
            "bg-popover text-popover-foreground border shadow-md",
            "text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap max-w-[220px] truncate"
          )}
        >
          <span className="text-muted-foreground italic">{partialTranscript}</span>
        </div>
      )}
    </div>
  );
}
