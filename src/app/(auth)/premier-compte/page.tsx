import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { countUsers } from "@/server/auth/accounts";
import { getDb } from "@/server/db/sqlite";
import { FirstAccountForm } from "./first-account-form";

export const metadata: Metadata = { title: "Premier compte" };
export const dynamic = "force-dynamic";

export default function FirstAccountPage() {
  if (countUsers(getDb()) > 0) redirect("/connexion");
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Créer le compte du médecin</h1>
        <p className="text-sm text-muted-foreground">
          Premier lancement : aucun compte n&apos;existe encore sur ce poste. Le compte et toutes les données restent sur
          cet ordinateur.
        </p>
      </div>
      <FirstAccountForm />
    </div>
  );
}
