import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtectedApp = path.startsWith("/app");
  const isProtectedAdmin = path.startsWith("/admin") && path !== "/admin/login";
  if ((isProtectedApp || isProtectedAdmin) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = isProtectedAdmin ? "/admin/login" : "/login";
    return NextResponse.redirect(url);
  }
  return response;
}
