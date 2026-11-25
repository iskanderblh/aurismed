"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <AlertTriangle className="size-10 text-warning" aria-hidden />
      <div className="space-y-1">
        <p className="text-lg font-medium">Une erreur est survenue</p>
        <p className="text-sm text-muted-foreground">
          La page n&apos;a pas pu être chargée. Vos données enregistrées ne sont pas affectées.
        </p>
      </div>
      <Button onClick={reset}>
        <RotateCw /> Réessayer
      </Button>
    </div>
  );
}
