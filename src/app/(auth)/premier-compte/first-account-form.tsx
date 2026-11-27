"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { createFirstAccount, type FormState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus } from "@/components/ui/form-message";

export function FirstAccountForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createFirstAccount, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormStatus error={state.error} />
      <div className="space-y-2">
        <Label htmlFor="fullName">Nom affiché (facultatif)</Label>
        <Input id="fullName" name="fullName" autoComplete="name" defaultValue={state.fullName} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Adresse e-mail (identifiant)</Label>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.email} required
          aria-describedby="email-error" />
        <FieldError id="email-error" messages={state.fieldErrors?.email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe (12 caractères minimum)</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required
          aria-describedby="password-error" />
        <FieldError id="password-error" messages={state.fieldErrors?.password} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmation</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required
          aria-describedby="confirm-error" />
        <FieldError id="confirm-error" messages={state.fieldErrors?.confirm} />
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Créer le compte
      </Button>
    </form>
  );
}
