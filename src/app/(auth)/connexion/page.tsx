import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/validation/auth";
import { countUsers } from "@/server/auth/accounts";
import { getDb } from "@/server/db/sqlite";
import { sessionUser } from "@/server/db/client";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  // Premier lancement : aucun compte sur ce poste.
  if (countUsers(getDb()) === 0) redirect("/premier-compte");
  if (await sessionUser()) redirect("/tableau-de-bord");
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
        <p className="text-sm text-muted-foreground">Accédez à votre espace de documentation médicale.</p>
      </div>
      <LoginForm next={next} />
    </div>
  );
}
