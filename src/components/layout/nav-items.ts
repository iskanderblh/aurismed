import { FileText, History, LayoutDashboard, Mic, Settings, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/consultations/nouvelle", label: "Nouvelle consultation", icon: Mic },
  { href: "/consultations", label: "Historique", icon: History },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/parametres", label: "Paramètres", icon: Settings },
];
