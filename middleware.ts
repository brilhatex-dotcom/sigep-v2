import { withAuth } from "next-auth/middleware";

// Protege automaticamente todas as rotas listadas em "matcher".
// Quem nao estiver logado e redirecionado para /login.
export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/efetivo/:path*",
    "/escalas/:path*",
    "/ferias/:path*",
    "/disciplinar/:path*",
    "/promocoes/:path*",
    "/api/efetivo/:path*",
    "/api/upload/:path*",
  ],
};
