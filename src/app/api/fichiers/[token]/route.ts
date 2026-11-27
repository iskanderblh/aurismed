import { NextResponse } from "next/server";
import { clientForUser, sessionUser } from "@/server/db/client";
import { verifyFileToken } from "@/server/db/storage";

export const runtime = "nodejs";

/**
 * Lien signé et temporaire vers un fichier chiffré (lecture audio, PDF).
 * Le jeton seul ne suffit pas : la session doit appartenir au propriétaire du fichier.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/fichiers/[token]">) {
  const { token } = await ctx.params;
  const payload = verifyFileToken(token);
  if (!payload) return new NextResponse("Lien expiré ou invalide.", { status: 403 });

  const user = await sessionUser();
  if (!user) return new NextResponse("Session expirée.", { status: 401 });
  const { data, error } = await clientForUser(user).storage.from(payload.b).read(payload.p);
  if (error) return new NextResponse(error.message, { status: 404 });

  const headers = new Headers({
    "Content-Type": data.contentType,
    "Content-Length": String(data.content.length),
    "Cache-Control": "private, no-store",
  });
  if (payload.dl) {
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(payload.dl)}`);
  } else {
    headers.set("Content-Disposition", "inline");
  }
  return new NextResponse(new Uint8Array(data.content), { headers });
}
