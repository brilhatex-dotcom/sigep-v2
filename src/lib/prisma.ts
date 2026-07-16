import { PrismaClient } from "@prisma/client";
import { cifrar, decifrar, CAMPOS_SENSIVEIS } from "@/lib/cripto";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function novoPrisma(): PrismaClient {
  const p = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // Cifra/decifra os campos sensiveis do Efetivo de forma central: toda gravacao
  // cifra, toda leitura decifra — independente da rota. Assim nenhum ponto do
  // sistema mostra dado cru por engano, e nao dependemos de mexer em cada lugar.
  p.$use(async (params, next) => {
    if (params.model === "Efetivo") {
      const acao = params.action;
      if ((acao === "create" || acao === "update" || acao === "updateMany" || acao === "upsert") && params.args?.data) {
        const cifraObj = (d: any) => { for (const c of CAMPOS_SENSIVEIS) if (c in d) d[c] = cifrar(d[c]); };
        if (acao === "upsert") { if (params.args.create) cifraObj(params.args.create); if (params.args.update) cifraObj(params.args.update); }
        else cifraObj(params.args.data);
      }
    }
    const res = await next(params);
    if (params.model === "Efetivo" && res) {
      const dec = (o: any) => { if (o && typeof o === "object") for (const c of CAMPOS_SENSIVEIS) if (typeof o[c] === "string") o[c] = decifrar(o[c]); };
      if (Array.isArray(res)) res.forEach(dec); else dec(res);
    }
    return res;
  });

  return p;
}

export const prisma = globalForPrisma.prisma ?? novoPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
