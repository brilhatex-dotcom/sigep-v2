import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const ROTAS_LIVRES = [
  '/login',
  '/trocar-senha',
  '/api/auth',
  '/api/trocar-senha',
  '/_next',
  '/favicon.ico',
  '/manifest.json',
  '/robots.txt',
];

function ehRotaLivre(pathname: string): boolean {
  return ROTAS_LIVRES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

// Extrai o IP real do request (atras do proxy da Vercel).
// Ordem: x-forwarded-for (primeiro IP) > x-real-ip > "desconhecido".
function obterIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const primeiro = xff.split(',')[0]?.trim();
    if (primeiro) return primeiro;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'desconhecido';
}

// Injeta o IP num header customizado que sobrevive ate o handler/authorize.
// Repassamos TODOS os headers originais e so acrescentamos x-sigep-ip.
function comIpInjetado(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers);
  headers.set('x-sigep-ip', obterIp(req));
  return NextResponse.next({ request: { headers } });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rotas livres: nao exigem login, mas ainda assim injetamos o IP
  // (importante para /api/auth, onde acontece o login e a auditoria).
  if (ehRotaLivre(pathname)) {
    return comIpInjetado(req);
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return comIpInjetado(req); // deixa fluxo padrao de auth lidar

  const precisaTrocar = (token as any).precisaTrocar === true;
  if (precisaTrocar) {
    const url = req.nextUrl.clone();
    url.pathname = '/trocar-senha';
    return NextResponse.redirect(url);
  }

  // Segue normal, com o IP injetado para a auditoria das rotas internas.
  return comIpInjetado(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};