"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { requestPasswordReset, type FormState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus } from "@/components/ui/form-message";

export function ResetRequestForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormStatus error={state.error} success={state.success} />
      <div className="space-y-2">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email"
          defaultValue={state.email} required aria-describedby="email-error" />
        <FieldError id="email-error" messages={state.fieldErrors?.email} />
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Envoyer le lien
      </Button>
      <Button asChild variant="ghost" className="w-full">
        <Link href="/connexion">
          <ArrowLeft /> Retour à la connexion
        </Link>
      </Button>
    </form>
  );
}
