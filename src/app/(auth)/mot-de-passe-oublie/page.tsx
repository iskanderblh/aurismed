import type { Metadata } from "next";
import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground">
          Indiquez votre adresse e-mail pour recevoir un lien de réinitialisation.
        </p>
      </div>
      <ResetRequestForm />
    </div>
  );
}
