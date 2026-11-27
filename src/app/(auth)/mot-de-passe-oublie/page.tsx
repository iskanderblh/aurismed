import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground">
          AurisMED fonctionne sur ce poste, sans envoi d&apos;e-mail. Le mot de passe se réinitialise directement sur
          l&apos;ordinateur qui héberge l&apos;application.
        </p>
      </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Ouvrez le dossier d&apos;AurisMED, puis le dossier <code>windows</code>.
        </li>
        <li>
          Double-cliquez sur <code>Reinitialiser-mot-de-passe.cmd</code>.
        </li>
        <li>Saisissez l&apos;adresse e-mail du compte et le nouveau mot de passe (12 caractères minimum).</li>
      </ol>
      <p className="text-xs text-muted-foreground">
        Les sessions ouvertes sur ce compte sont fermées après la réinitialisation.
      </p>
      <Button asChild variant="ghost" className="w-full">
        <Link href="/connexion">
          <ArrowLeft /> Retour à la connexion
        </Link>
      </Button>
    </div>
  );
}
