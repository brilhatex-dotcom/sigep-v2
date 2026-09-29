import { ehModeloAquisicao, ehModeloTransferencia, registroDeOrigem } from "@/lib/requerimentos";

/* =========================================================================
   Campos dos requerimentos de ARMA DE FOGO (compra direta e transferência).

   O banco não tem colunas próprias para a arma nem para o alienante — em vez
   de pedir migração, viajam como JSON em p2Complementares (coluna que só o
   modelo de cursos usa, e nunca ao mesmo tempo). Aqui fica a lista única de
   quais chaves entram nesse JSON e quais são obrigatórias para ENVIAR, para
   a tela, o POST, o PUT e a geração lerem a mesma regra.

   Sem "fs" aqui de propósito: o formulário (cliente) também importa.
   ========================================================================= */

// quadro "2. PRODUTO CONTROLADO A SER ADQUIRIDO" da compra direta
export const CAMPOS_PCE = ["produto", "marca", "modeloArma", "calibre", "quantidade"] as const;

/* Transferência: a arma já existe (tem registro e número de série), há um
   ALIENANTE (quem passa a arma — o doador do termo) e o termo de doação pede
   dados que a folha do Exército não pede (acabamento, RG, CEP, filiação...). */
export const CAMPOS_ARMA_TRANSFERENCIA = [
  "registro", "produto", "marca", "modeloArma", "serie", "calibre",
  "acabamento", "acessorios", "outras",
] as const;

export const CAMPOS_ALIENANTE = [
  "alienanteId", "alienantePosto", "alienanteNome", "alienanteIdentidade",
  "alienanteRg", "alienanteCpf", "alienanteOrgao", "alienanteAcervo",
  "alienanteNacionalidade", "alienanteEstadoCivil", "alienanteNasc",
  "alienanteNaturalidade", "alienantePai", "alienanteMae",
] as const;

// do adquirente, mas sem coluna no requerimento (o termo e a folha pedem)
export const CAMPOS_ADQUIRENTE_EXTRA = ["orgao", "rg", "cep"] as const;

// chaves que vão para o JSON de p2Complementares, conforme o modelo
export function camposArmaDoModelo(modelo: string): readonly string[] {
  if (ehModeloTransferencia(modelo)) {
    return [...CAMPOS_ARMA_TRANSFERENCIA, ...CAMPOS_ALIENANTE, ...CAMPOS_ADQUIRENTE_EXTRA];
  }
  return ehModeloAquisicao(modelo) ? CAMPOS_PCE : [];
}

/* Monta o JSON a partir do que veio da tela (null se nada foi preenchido).
   `v` devolve o valor já aparado, ou null quando vazio. */
export function jsonArma(modelo: string, v: (k: string) => string | null): string | null {
  const campos = camposArmaDoModelo(modelo);
  if (!campos.some((k) => v(k))) return null;
  return JSON.stringify(Object.fromEntries(campos.map((k) => [k, v(k) || ""])));
}

// Desfaz o JSON em campo a campo (texto). Valor estranho/antigo vira vazio.
export function lerDadosArma(json: string | null | undefined): Record<string, string> {
  if (!json) return {};
  try {
    const o = JSON.parse(json);
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(o)) {
      if (typeof val === "string" || typeof val === "number") out[k] = String(val);
    }
    return out;
  } catch {
    return {};
  }
}

/* Obrigatórios para ENVIAR (chave -> rótulo que aparece na mensagem).
   Rascunho não valida: serve justamente para adiantar o que já dá. */
export function obrigatoriosDoModelo(modelo: string): Record<string, string> {
  if (ehModeloTransferencia(modelo)) {
    return {
      nomeCompleto: "Nome completo", idPmmaTxt: "Identidade (ID PMMA)", cpf: "CPF",
      endereco: "Endereço", municipio: "Cidade/UF",
      alienanteNome: "Nome do alienante", alienanteCpf: "CPF do alienante",
      registro: `Nº ${registroDeOrigem(modelo)} da arma`, produto: "Tipo da arma",
      marca: "Marca", modeloArma: "Modelo", serie: "Número de série", calibre: "Calibre",
    };
  }
  if (ehModeloAquisicao(modelo)) {
    return {
      nomeCompleto: "Nome completo", idPmmaTxt: "Identidade (ID PMMA)", cpf: "CPF",
      endereco: "Endereço de entrega", municipio: "Cidade/UF",
      produto: "Produto", marca: "Marca", modeloArma: "Modelo",
      calibre: "Calibre", quantidade: "Quantidade",
    };
  }
  return {};
}

// Valores com que a tela de transferência nasce (tudo editável)
export function padraoTransferencia(): Record<string, string> {
  return {
    orgao: "PMMA",
    alienanteOrgao: "PMMA",
    // o termo de doação traz "de nacionalidade brasileiro" no modelo
    alienanteNacionalidade: "brasileiro",
  };
}
