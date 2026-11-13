import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/supabase/cookies';

// Refreshes the Supabase session on every request and sends signed-out
// visitors to the login page. API routes answer 401 themselves.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SESSION_COOKIE,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Reads the session (refreshing it when it has expired) and verifies the
  // token. With Supabase's signing keys this is checked locally, so it does not
  // add a network call to every click.
  const { data } = await supabase.auth.getClaims();
  let user: string | undefined = data?.claims?.sub;

  // Checking the token can fail for reasons that have nothing to do with the
  // person, such as a slow first request after the app has been closed for a
  // while. A stored sign-in is still a sign-in: nobody is sent to the login
  // page because of a hiccup. Pages and the database check access themselves.
  if (!user) {
    const { data: stored } = await supabase.auth.getSession();
    user = stored.session?.user?.id;
  }

  const { pathname } = request.nextUrl;
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth');
  if (!user && !isPublic && !pathname.startsWith('/api')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return withCookies(NextResponse.redirect(url), response);
  }

  // Already signed in and looking at the login page: go straight to the app.
  // (Not when the app itself sent them here, for example a deactivated account.)
  if (user && pathname === '/login' && !request.nextUrl.searchParams.has('reason')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return withCookies(NextResponse.redirect(url), response);
  }

  return response;
}

/** Carries a refreshed sign-in over to a redirect, so it is not lost on the way. */
function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

export const config = {
  // Skipped: Next's own files, images, and the files that make the site installable
  // as an app (manifest, service worker, offline page), which must load while signed out.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
