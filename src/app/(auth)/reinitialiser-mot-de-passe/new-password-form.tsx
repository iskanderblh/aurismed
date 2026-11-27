"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updatePassword, type FormState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus } from "@/components/ui/form-message";

export function NewPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(updatePassword, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormStatus error={state.error} />
      <div className="space-y-2">
        <Label htmlFor="current">Mot de passe actuel</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
        <FieldError id="current-error" messages={state.fieldErrors?.current} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
        <FieldError id="password-error" messages={state.fieldErrors?.password} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmation</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        <FieldError id="confirm-error" messages={state.fieldErrors?.confirm} />
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Enregistrer le mot de passe
      </Button>
    </form>
  );
}
