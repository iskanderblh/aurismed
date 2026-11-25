import { AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <AudioLines className="size-5" aria-hidden />
      </span>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight text-primary">
          Auris<span className="text-sky-500">MED</span>
        </span>
      )}
    </div>
  );
}
