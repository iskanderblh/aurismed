"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FormStatus } from "@/components/ui/form-message";
import type { SettingsValues } from "@/lib/validation/settings";
import { updateSettings, type SettingsState } from "./actions";

function Field({
  name,
  label,
  defaultValue,
  errors,
  hint,
  ...rest
}: { name: keyof SettingsValues; label: string; defaultValue: string | number; errors?: string[]; hint?: string } & Omit<
  React.ComponentProps<"input">,
  "name" | "defaultValue"
>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Input id={name} name={name} defaultValue={defaultValue} aria-invalid={Boolean(errors)} {...rest} />
      {errors ? <FieldError id={`${name}-error`} messages={errors} /> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SettingsForm({ values: saved, email }: { values: SettingsValues; email: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateSettings, {});
  const values = { ...saved, ...state.values } as SettingsValues;
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-6">
      <FormStatus error={state.error} success={state.ok ? "Paramètres enregistrés." : undefined} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Médecin</CardTitle>
            <CardDescription>Imprimé sur l&apos;ordonnance et la fiche d&apos;observation. Compte : {email}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field name="fullName" label="Nom affiché" defaultValue={values.fullName} errors={e.fullName} placeholder="Dr Jeanne Dupont" />
            <Field name="specialty" label="Spécialité" defaultValue={values.specialty} errors={e.specialty} />
            <Field name="rpps" label="N° RPPS" defaultValue={values.rpps} errors={e.rpps} inputMode="numeric" />
            <Field name="phone" label="Téléphone" defaultValue={values.phone} errors={e.phone} type="tel" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Établissement</CardTitle>
            <CardDescription>Facultatif, en en-tête de l&apos;ordonnance.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field name="institutionName" label="Nom" defaultValue={values.institutionName} errors={e.institutionName} />
            <div className="space-y-1.5">
              <Label htmlFor="institutionAddress" className="text-xs font-medium text-muted-foreground">
                Adresse
              </Label>
              <Textarea id="institutionAddress" name="institutionAddress" defaultValue={values.institutionAddress} rows={2} />
              <FieldError id="institutionAddress-error" messages={e.institutionAddress} />
            </div>
            <Field name="institutionPhone" label="Téléphone" defaultValue={values.institutionPhone} errors={e.institutionPhone} type="tel" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Conservation des enregistrements audio</CardTitle>
            <CardDescription>
              L&apos;audio n&apos;est jamais supprimé avant que vous ayez confirmé la transcription. Après confirmation, il
              est conservé pendant la durée choisie puis supprimé.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-w-xs">
            <Field
              name="audioRetentionDays"
              label="Durée de conservation (jours)"
              type="number"
              min={0}
              max={3650}
              defaultValue={values.audioRetentionDays}
              errors={e.audioRetentionDays}
              hint="0 = suppression dès la confirmation de la transcription"
            />
          </CardContent>
        </Card>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
