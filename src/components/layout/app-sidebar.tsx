"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

type SidebarUser = { email: string; fullName: string | null };

function isActive(pathname: string, href: string) {
  // "Historique" ne doit pas s'activer sur "Nouvelle consultation".
  if (href === "/consultations") return pathname === href || /^\/consultations\/(?!nouvelle)/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(user: SidebarUser) {
  const source = user.fullName || user.email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function SidebarContent({ user, onNavigate }: { user: SidebarUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Navigation principale">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className={cn("size-4.5", active && "text-sky-600")} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
            {initials(user)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.fullName || "Médecin"}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="icon" aria-label="Se déconnecter" title="Se déconnecter">
              <LogOut />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar({ user }: { user: SidebarUser }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Bureau et tablette paysage */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar lg:block">
        <SidebarContent user={user} />
      </aside>

      {/* Mobile et tablette portrait */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
          <Menu />
        </Button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 animate-in fade-in"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar shadow-xl animate-in slide-in-from-left">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-4"
              onClick={() => setOpen(false)}
              aria-label="Fermer le menu"
            >
              <X />
            </Button>
            <SidebarContent user={user} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
