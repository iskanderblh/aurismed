import { NextResponse, type NextRequest } from "next/server";

/** Routes accessibles sans session. */
const PUBLIC_PATHS = ["/connexion", "/mot-de-passe-oublie", "/premier-compte"];
const SESSION_COOKIE = "aurismed_session";

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Contrôle optimiste : sans cookie de session, redirection vers /connexion.
 * Les pages et les routes vérifient ensuite la session en base (lib/auth.ts,
 * server/db/client.ts) : ce filtre ne suffit pas à lui seul.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Session expirée. Reconnectez-vous." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    // Toutes les routes sauf les fichiers statiques et les images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
