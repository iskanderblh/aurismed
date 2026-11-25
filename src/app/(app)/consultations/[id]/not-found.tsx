import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ConsultationNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="text-lg font-medium">Consultation introuvable</p>
        <p className="text-sm text-muted-foreground">Elle a peut-être été supprimée.</p>
      </div>
      <Button asChild>
        <Link href="/consultations">Retour à l&apos;historique</Link>
      </Button>
    </div>
  );
}
