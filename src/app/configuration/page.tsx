import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getConfigurationStatus } from "@/lib/env";

export const metadata: Metadata = { title: "Configuration requise" };
export const dynamic = "force-dynamic";

const ITEMS = [
  {
    key: "supabase" as const,
    label: "Supabase (base de données et authentification)",
    vars: "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    required: "Requis pour toute l'application",
  },
  {
    key: "openai" as const,
    label: "OpenAI (transcription et extraction IA)",
    vars: "OPENAI_API_KEY",
    required: "Requis à partir de la phase 3",
  },
];

export default function ConfigurationPage() {
  const status = getConfigurationStatus();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-12">
      <Logo />
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Configuration requise</CardTitle>
          <CardDescription>
            Renseignez les variables ci-dessous dans <code>.env.local</code> (voir <code>.env.example</code> et le
            README), puis redémarrez le serveur.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ITEMS.map((item) => {
            const ok = status[item.key];
            return (
              <div key={item.key} className="flex gap-3 rounded-lg border p-4">
                {ok ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                )}
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{item.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">{item.vars}</p>
                  <p className="text-xs text-muted-foreground">
                    {ok ? "Configuré" : "Non configuré"} · {item.required}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
