import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Parcours guidé de la consultation (les étapes suivantes arrivent avec leurs phases). */
export const WORKFLOW_STEPS = [
  { key: "patient", label: "Patient", phase: 2 },
  { key: "recording", label: "Enregistrement", phase: 3 },
  { key: "transcription", label: "Transcription", phase: 3 },
  { key: "extraction", label: "Extraction IA", phase: 4 },
  { key: "review", label: "Vérification", phase: 5 },
  { key: "prescription", label: "Ordonnance", phase: 5 },
  { key: "export", label: "PDF", phase: 6 },
] as const;

export function WorkflowSteps({ current = 0, completed = [] as number[] }) {
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Étapes de la consultation">
      {WORKFLOW_STEPS.map((step, i) => {
        const active = i === current;
        const done = completed.includes(i);
        const available = step.phase <= 2;
        return (
          <li
            key={step.key}
            aria-current={active ? "step" : undefined}
            title={available ? undefined : `Disponible en phase ${step.phase}`}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
              active && "border-primary bg-primary text-primary-foreground",
              !active && available && "bg-card",
              !available && "border-dashed text-muted-foreground/70",
            )}
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-[11px]",
                active ? "bg-white/20" : "bg-muted",
              )}
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
