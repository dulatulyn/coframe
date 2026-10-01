import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/app", "/w/", "/p/", "/settings"];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((prefix) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
  if (!isProtected || request.cookies.has("sid")) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", path + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/app/:path*", "/w/:path*", "/p/:path*", "/settings/:path*"],
};
