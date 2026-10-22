import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/** Must match PATH_HEADER in lib/i18n/server.ts, which keeps /admin in English. */
const PATH_HEADER = "x-astrya-path";

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // The page's own request headers plus its path, so server components can
  // read it (layouts are not given the pathname). Rebuilt on each call
  // because Supabase may have just refreshed the cookies on `request`.
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set(PATH_HEADER, path);
    return NextResponse.next({ request: { headers } });
  };
  let response = next();

  const supabase = createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const isProtectedApp = path.startsWith("/app");
  const isProtectedAdmin = path.startsWith("/admin") && path !== "/admin/login";
  if ((isProtectedApp || isProtectedAdmin) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = isProtectedAdmin ? "/admin/login" : "/login";
    return NextResponse.redirect(url);
  }
  return response;
}
