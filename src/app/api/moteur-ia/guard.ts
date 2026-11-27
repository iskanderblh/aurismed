import "server-only";
import { NextResponse } from "next/server";
import { clientForUser, sessionUser, type LocalSessionUser } from "@/server/db/client";

/** Session requise pour piloter le moteur local ; chaque action est journalisée (sans contenu médical). */
export async function requireUser(): Promise<LocalSessionUser | NextResponse> {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Session expirée. Reconnectez-vous." }, { status: 401 });
  return user;
}

export async function audit(user: LocalSessionUser, action: string, metadata: Record<string, string | number | boolean | null>) {
  await clientForUser(user).from("audit_logs").insert({ user_id: user.id, action, entity_type: "local_ai_engine", metadata });
}
