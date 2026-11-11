import { NextResponse, type NextRequest } from "next/server";

/**
 * Password-protects /admin with HTTP Basic auth. Set ADMIN_PASSWORD in Vercel
 * (and optionally ADMIN_USER, default "brian"). Without a password the admin area is closed.
 */
export function middleware(req: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return new NextResponse("Admin is not set up.", { status: 503 });
  if (isAuthorized(req.headers.get("authorization"), process.env.ADMIN_USER || "brian", password)) {
    return NextResponse.next();
  }
  return new NextResponse("Sign in required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Condo Wise Guys admin", charset="UTF-8"' },
  });
}

function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function isAuthorized(header: string | null, user: string, password: string) {
  if (!header?.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  return safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), password);
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
