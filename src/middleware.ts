import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export async function middleware(req: NextRequest) {
  const secret = process.env.SESSION_SECRET ?? "dev-session-secret-change-me-please";
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(secret, token)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico)$).*)"],
};
