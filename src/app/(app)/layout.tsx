import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCurrentUser } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <div className="min-h-screen">
      <AppSidebar user={{ email: user.email, fullName: user.fullName }} />
      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
