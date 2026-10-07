import { NextResponse, type NextRequest } from 'next/server';

/** Sends signed-out visitors to the sign-in page. The API still checks every request itself. */
export function middleware(req: NextRequest) {
  const signedIn = req.cookies.has('sceneos_session');
  const onLogin = req.nextUrl.pathname === '/login';
  if (!signedIn && !onLogin) return NextResponse.redirect(new URL('/login', req.url));
  if (signedIn && onLogin) return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
