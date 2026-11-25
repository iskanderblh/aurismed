import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { getConfigurationStatus } from "@/lib/env";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Paramètres" };

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />}
      <span>{label}</span>
      <span className="text-muted-foreground">· {ok ? "configuré" : "non configuré"}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const [settings, config] = [await getSettings(user.id), getConfigurationStatus()];
  return (
    <div className="space-y-8">
      <PageHeader title="Paramètres" description="Profil, établissement et conservation des données." />
      {settings.ok ? (
        <SettingsForm values={settings.data} email={user.email} />
      ) : (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Paramètres indisponibles</AlertTitle>
          <AlertDescription>{settings.error} Rechargez la page pour réessayer.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Services externes</CardTitle>
          <CardDescription>Les clés restent sur le serveur et ne sont jamais envoyées au navigateur.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Status ok={config.supabase} label="Supabase" />
          <Status ok={config.openai} label="OpenAI (transcription et extraction)" />
        </CardContent>
      </Card>
    </div>
  );
}
