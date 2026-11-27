import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { localMedicalAI } from "@/server/local-ai/service";
import { LocalAiEngine } from "./local-ai-engine";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const [settings, engine] = await Promise.all([getSettings(user.id), localMedicalAI.status()]);
  return (
    <div className="space-y-8">
      <PageHeader title="Paramètres" description="Profil, établissement, conservation des données et moteur IA local." />
      {settings.ok ? (
        <SettingsForm values={settings.data} email={user.email} />
      ) : (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Paramètres indisponibles</AlertTitle>
          <AlertDescription>{settings.error} Rechargez la page pour réessayer.</AlertDescription>
        </Alert>
      )}
      <LocalAiEngine initial={engine} />
      <Card>
        <CardHeader>
          <CardTitle>Compte local</CardTitle>
          <CardDescription>
            Le compte est stocké sur ce poste ; le mot de passe n&apos;y est conservé que sous forme hachée (scrypt).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/reinitialiser-mot-de-passe">
              <KeyRound /> Changer de mot de passe
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
