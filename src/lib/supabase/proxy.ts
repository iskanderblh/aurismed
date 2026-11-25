import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/env";

/** Routes accessibles sans session. */
const PUBLIC_PATHS = ["/connexion", "/mot-de-passe-oublie", "/auth/confirm", "/configuration"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Rafraîchit la session Supabase à chaque requête et redirige les visiteurs
 * non authentifiés vers la page de connexion. Les pages vérifient à nouveau
 * l'utilisateur côté serveur (voir lib/auth.ts) : ce contrôle est optimiste.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const env = getSupabasePublicEnv();

  if (!env) {
    if (pathname === "/configuration") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/configuration";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Ne rien exécuter entre createServerClient et getClaims : cela pourrait déconnecter l'utilisateur.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);

  if (!isAuthenticated && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  if (isAuthenticated && pathname === "/connexion") {
    const url = request.nextUrl.clone();
    url.pathname = "/tableau-de-bord";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
