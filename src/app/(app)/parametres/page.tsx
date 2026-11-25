import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getConfigurationStatus } from "@/lib/env";

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
  const config = getConfigurationStatus();
  return (
    <div className="space-y-8">
      <PageHeader title="Paramètres" description="Compte et configuration de l'application." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Compte</CardTitle>
            <CardDescription>Modification du profil et des informations imprimées sur les documents en phase 2.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Nom : </span>
              {user.fullName || "Non renseigné"}
            </p>
            <p>
              <span className="text-muted-foreground">E-mail : </span>
              {user.email}
            </p>
          </CardContent>
        </Card>
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
    </div>
  );
}
