import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refreshes the Supabase session on every request and sends signed-out
// visitors to the login page. API routes answer 401 themselves.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
  const user = data?.claims?.sub;

  const { pathname } = request.nextUrl;
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth');
  if (!user && !isPublic && !pathname.startsWith('/api')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Skipped: Next's own files, images, and the files that make the site installable
  // as an app (manifest, service worker, offline page), which must load while signed out.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
