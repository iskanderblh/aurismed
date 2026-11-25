import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-xs text-muted-foreground">
          Accès réservé aux professionnels de santé autorisés.
        </p>
      </div>
      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-end lg:p-12">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-sky-400/20 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 left-10 size-96 rounded-full bg-blue-300/10 blur-3xl" aria-hidden />
        <div className="relative max-w-md space-y-4 text-primary-foreground">
          <p className="text-3xl font-semibold leading-tight">
            Le médecin parle.
            <br />
            AurisMED écoute, organise et rédige.
          </p>
          <p className="text-sm text-blue-100/80">
            Enregistrez la téléconsultation, vérifiez les informations extraites par l&apos;IA et générez la fiche
            d&apos;observation et l&apos;ordonnance en quelques minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
