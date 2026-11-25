import type { Metadata } from "next";
import { safeRedirectPath } from "@/lib/validation/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
        <p className="text-sm text-muted-foreground">Accédez à votre espace de documentation médicale.</p>
      </div>
      <LoginForm next={next} linkError={params.erreur === "lien"} />
    </div>
  );
}
