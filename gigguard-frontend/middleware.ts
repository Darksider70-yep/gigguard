import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This middleware does NOT rewrite URLs to /hi/ or /ta/ paths.
// GigGuard uses cookie-based locale — URL stays the same regardless of language.
// This preserves existing deep links and bookmarks.
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
