"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { signIn, type FormState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus } from "@/components/ui/form-message";

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {
    error: linkError ? "Le lien utilisé est invalide ou a expiré." : undefined,
  });

  return (
    <form action={action} className="space-y-5" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormStatus error={state.error} />
      <div className="space-y-2">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby="email-error"
        />
        <FieldError id="email-error" messages={state.fieldErrors?.email} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Mot de passe</Label>
          <Link href="/mot-de-passe-oublie" className="text-xs font-medium text-sky-700 hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby="password-error"
        />
        <FieldError id="password-error" messages={state.fieldErrors?.password} />
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Se connecter
      </Button>
    </form>
  );
}
