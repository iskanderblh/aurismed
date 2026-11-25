import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Emplacement clairement identifié d'une fonctionnalité prévue dans une phase ultérieure. */
export function UpcomingFeature({
  icon: Icon,
  phase,
  title,
  points,
}: {
  icon: LucideIcon;
  phase: number;
  title: string;
  points: string[];
}) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="space-y-2">
          <Badge variant="secondary">Phase {phase}</Badge>
          <p className="font-medium">{title}</p>
        </div>
        <ul className="max-w-md space-y-1 text-sm text-muted-foreground">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
