import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;
    
    const isAdminRoute =
      pathname.startsWith("/admin") || pathname.startsWith("/api/cfs2026/list");
    
    if (isAdminRoute) {
      const perfil = String((token as any)?.perfil || "").toLowerCase();
      if (perfil !== "admin") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }
    
    return NextResponse.next();
  },
  {
    pages: { signIn: "/login" },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/efetivo/:path*",
    "/escalas/:path*",
    "/ferias/:path*",
    "/disciplinar/:path*",
    "/promocoes/:path*",
    "/admin/:path*",
    "/api/efetivo/:path*",
    "/api/upload/:path*",
    "/api/cfs2026/list/:path*",
  ],
};