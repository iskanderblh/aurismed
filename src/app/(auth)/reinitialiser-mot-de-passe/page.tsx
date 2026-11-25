import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function ResetPasswordPage() {
  // La session est ouverte par le lien reçu par e-mail (/auth/confirm).
  const user = await getCurrentUser();
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Nouveau mot de passe</h1>
        <p className="text-sm text-muted-foreground">Compte : {user.email}</p>
      </div>
      <NewPasswordForm />
    </div>
  );
}
