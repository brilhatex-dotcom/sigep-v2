/* =========================================================================
   CONFERÊNCIA AUTOMÁTICA DAS CERTIDÕES DA PROMOÇÃO

   O P/1 abria PDF por PDF para conferir quatro coisas — é a certidão certa?
   é do militar? é NADA CONSTA? está no prazo? — e é exatamente o que um
   texto de certidão diz, sempre nas mesmas palavras. Os PDFs emitidos pelos
   sites dos tribunais têm o texto dentro, então dá para ler e conferir.

   Calibrado em certidões reais emitidas em out/2026:
     · TJMA: "CERTIDÃO ESTADUAL - PRIMEIRO GRAU / AÇÕES PENAIS", "CERTIDÃO
       JUDICIAL DE DISTRIBUIÇÃO NO SEGUNDO GRAU", "... AÇÕES PENAIS - JUSTIÇA
       MILITAR ESTADUAL"; "NOME:", "CPF:", "Data emissão", "Data de
       validade", "Certifico que NADA CONSTA";
     · TRF1 a TRF5: "TRIBUNAL REGIONAL FEDERAL DA Nª REGIÃO" (o TRF4 escreve
       "JUSTIÇA FEDERAL DA 4ª REGIÃO"), "CERTIDÃO JUDICIAL CRIMINAL
       NEGATIVA", "NÃO CONSTAM ... contra: NOME ... CPF", "emitida em".
       A do TRF2 tem uma 2ª página só com o código verificador.

   É TRIAGEM, não veredito: na dúvida, o item vai para "atenção" e o P/1
   abre. Nunca o contrário. A autenticidade (código de validação no site do
   tribunal) não dá para conferir daqui — os sites usam captcha —, então o
   código é mostrado para o P/1 conferir por amostragem.

   Sem "fs" nem banco aqui: recebe o texto já extraído de cada página.
   ========================================================================= */

export type ArquivoLido = {
  ordens: number[];      // item(ns) para o qual o militar enviou o arquivo (a Unificada vale 4 a 8)
  paginas: string[];     // texto de cada página
  erroLeitura?: boolean; // não deu para baixar/abrir o arquivo
  porImagem?: boolean;   // o texto saiu da leitura da imagem (OCR): foto, print ou escaneado
  incompleto?: boolean;  // ficou página de imagem por ler (o tempo da chamada acabou)
  sinais?: string[];     // sinais de adulteração do ARQUIVO (ver sinaisDeAdulteracao)
};

export type MilitarConferido = { nome: string | null; cpf: string | null };

export type ItemConferido = {
  ordem: number;
  rotulo: string;
  achou: boolean;
  pagina?: number;       // página dentro do arquivo em que a certidão começa
  emissao?: string;      // dd/mm/aaaa
  validade?: string;     // dd/mm/aaaa (só o TJMA imprime)
  codigo?: string;       // código de validação, para conferir no site
  porImagem?: boolean;   // lida da imagem (OCR) — não é o PDF original do tribunal
  linkVerificacao?: string; // página de autenticidade do tribunal (com o código, quando o site aceita)
  suspeita?: boolean;    // sinal de adulteração ou de clone: conferir no site
  alertas: string[];
};

export type ResultadoConferencia = {
  status: "ok" | "atencao" | "sem_texto";
  itens: ItemConferido[];
  gerais: string[];
  incompleto?: boolean;  // falta ler imagem: conferir de novo continua de onde parou
};

/* Sobe quando as regras mudam: a conferência guardada com regras velhas
   deixa de valer e o painel pede para conferir de novo. */
export const VERSAO_REGRAS = 4;

export const ROTULO_ITEM: Record<number, string> = {
  1: "TJMA 1º grau", 2: "TJMA 2º grau", 3: "Justiça Militar Estadual",
  4: "TRF1", 5: "TRF2", 6: "TRF3", 7: "TRF4", 8: "TRF5", 9: "TRF6",
};

// a Certidão Unificada da Justiça Federal (CJF) vale pelos itens 4 a 8
const ORDENS_UNIFICADA = [4, 5, 6, 7, 8];

/* Federal emitida há mais de 90 dias já não se confere no site (o prazo da
   autenticidade impresso nela) — sinal de certidão velha. */
const DIAS_FEDERAL = 90;

/* --------------------------------------------------------------- texto */

// "Ação Penal 1ª Região" -> "ACAO PENAL 1A REGIAO" (sem acento, ª/º viram A/O)
export function normalizar(t: string): string {
  return t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

const umaLinha = (t: string) => t.replace(/\s+/g, " ").trim();
const soDigitos = (t: string) => t.replace(/\D/g, "");

function dataBR(t: string | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t || "");
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
}

/* ------------------------------------------------- uma certidão por vez */

type Documento = { pagina: number; texto: string };

/* Cada certidão começa na página que traz o "Certifico/Certificamos"; a
   página que não traz (a 2ª do TRF2, só com o código) é continuação. */
function separarDocumentos(paginas: string[]): Documento[] {
  const docs: Documento[] = [];
  paginas.forEach((p, i) => {
    const n = normalizar(p);
    if (!docs.length || /CERTIFIC(O|AMOS)\b/.test(n)) docs.push({ pagina: i + 1, texto: p });
    else docs[docs.length - 1].texto += "\n" + p;
  });
  return docs;
}

/* Que certidão é esta. O texto inteiro, e não só o alto da página: o
   leitor de PDF nem sempre devolve o cabeçalho primeiro (o do TRF2 vem no
   fim). null = não reconhecida. */
export function identificar(texto: string): number[] | null {
  const n = umaLinha(normalizar(texto));
  if (/TRIBUNAL DE JUSTICA DO ESTADO DO MARANHAO/.test(n)) {
    // a do 2º grau cita "recursos oriundos da Justiça Militar" — por isso ESTADUAL
    if (/JUSTICA MILITAR ESTADUAL/.test(n)) return [3];
    if (/SEGUNDO GRAU|\b2O GRAU DE JURISDICAO/.test(n)) return [2];
    if (/PRIMEIRO GRAU|\b1O GRAU DE JURISDICAO/.test(n)) return [1];
    return null;
  }
  // a região que o texto mais cita (as observações às vezes citam outra)
  const conta = new Map<number, number>();
  for (const m of n.matchAll(/(?:TRIBUNAL REGIONAL FEDERAL|JUSTICA FEDERAL) DA (\d) ?[AO]? REGIAO/g)) {
    const r = +m[1];
    if (r >= 1 && r <= 6) conta.set(r, (conta.get(r) || 0) + 1);
  }
  const [regiao] = Array.from(conta.entries()).sort((a, b) => b[1] - a[1])[0] || [];
  /* A Unificada do CJF vem com uma certidão por região ("CONSELHO DA JUSTIÇA
     FEDERAL / TRIBUNAL REGIONAL FEDERAL DA 1ª REGIÃO"...): cada página vale
     pela sua região. Só a que não diz região nenhuma vale pelo conjunto.
     ("unificada" sozinha não basta: a do TRF4 se diz "unificada do 1º e 2º
     graus" e é só da 4ª Região.) */
  if (regiao) return [3 + regiao];
  if (/CONSELHO DA JUSTICA FEDERAL|CERTIDAO UNIFICADA/.test(n)) return ORDENS_UNIFICADA;
  return null;
}

// o nome como a certidão escreveu (para a mensagem mostrar a diferença)
function nomeNaCertidao(texto: string): string {
  const linha = /NOME:\s*([^\n]+)/i.exec(texto);
  if (linha) return umaLinha(linha[1]);
  const contra = /contra:\s*([\s\S]{3,120}?)(?:\s+ou\s|\s*\(|\s+CPF)/i.exec(texto);
  const nome = contra ? umaLinha(contra[1]) : "";
  // o leitor de PDF às vezes embaralha a ordem: sem nome legível, não mostra
  return /\d|CPF/i.test(nome) ? "" : nome;
}

function nomeConfere(texto: string, nome: string): boolean {
  const alvo = umaLinha(normalizar(nome).replace(/[^A-Z ]/g, " "));
  if (!alvo) return true;   // ficha sem nome: não há com o que comparar
  const corpo = " " + umaLinha(normalizar(texto).replace(/[^A-Z ]/g, " ")) + " ";
  return corpo.includes(" " + alvo + " ");
}

/* CPF com pontuação, ou os 11 números logo depois de "CPF" — senão o "Nº da
   certidão" do TJMA (11 números soltos) passava por CPF. */
function cpfsNaCertidao(texto: string): string[] {
  const achados = [
    ...(texto.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g) || []),
    ...Array.from(texto.matchAll(/CPF[^0-9]{0,25}(\d{11})\b/gi)).map((m) => m[1]),
  ];
  return Array.from(new Set(achados.map(soDigitos)));
}

function datasDa(texto: string): { emissao?: string; validade?: string } {
  const n = umaLinha(normalizar(texto));
  const emissao = /DATA (?:DE )?EMISSAO:?\s*(\d{2}\/\d{2}\/\d{4})/.exec(n)
    || /EMITIDA EM:?\s*(\d{2}\/\d{2}\/\d{4})/.exec(n);
  const validade = /DATA DE VALIDADE:?\s*(\d{2}\/\d{2}\/\d{4})/.exec(n);
  return { emissao: emissao?.[1], validade: validade?.[1] };
}

/* Código de validação/verificador/segurança, como está impresso (a caixa
   importa: o do TJMA é minúsculo). */
function codigoDa(texto: string): string | undefined {
  const sem = umaLinha(texto.normalize("NFKD").replace(/[̀-ͯ]/g, ""));
  // "por meio do código de validação abaixo" não é o código: ele tem número
  const m = Array.from(sem.matchAll(/c[oó]digo (?:de valida[cç][aã]o|verificador|de seguran[cç]a)\s*:?\s*([A-Za-z0-9]+(?:[.\-][A-Za-z0-9]+)*)((?:\s[A-Za-z0-9]{2,6}(?=\s|$))*)/gi))
    .find((x) => /\d/.test(x[1]));
  if (!m) {
    // o do TRF1 sai separado do rótulo: "9BC2 06AB E546 49AC 4440 F63C 656D 9517"
    return /\b(?:[0-9A-F]{4} ){7}[0-9A-F]{4}\b/.exec(sem)?.[0];
  }
  // grupos seguintes separados por espaço (o do TRF1: "9BC2 06AB ...") só
  // entram se tiverem número — senão é a próxima palavra do texto
  const resto = m[2].trim().split(/\s+/).filter(Boolean);
  const grupos: string[] = [];
  for (const g of resto) { if (!/\d/.test(g)) break; grupos.push(g); }
  return [m[1], ...grupos].join(" ");
}

/* ------------------------------------------- sinais de adulteração */

/* O que o próprio arquivo conta de onde veio (lib/leituraPdf.ts). */
export type MetaPdf = {
  produtor: string; criador: string;
  criadoEm: string | null; modificadoEm: string | null;   // ISO
  edicoes: number;        // vezes que o PDF foi alterado e salvo depois de pronto
};

/* Programas de EDITAR ou recriar PDF. A certidão de verdade sai do sistema
   do tribunal; passou por um destes, o arquivo não é o original — pode ser
   só um "juntar páginas", mas também pode ser nome trocado. Não condena:
   manda conferir o código no site. (CamScanner fica de fora: já aparece
   como "lida da imagem".) */
const EDITORES: [RegExp, string][] = [
  [/ilovepdf/i, "iLovePDF"], [/smallpdf/i, "Smallpdf"], [/sejda/i, "Sejda"], [/pdf24/i, "PDF24"],
  [/pdfescape/i, "PDFescape"], [/nitro/i, "Nitro"], [/foxit/i, "Foxit"], [/pdfelement|wondershare/i, "PDFelement"],
  [/acrobat pro|acrobat standard|adobe acrobat \d/i, "Adobe Acrobat"], [/libreoffice|openoffice/i, "LibreOffice"],
  [/microsoft.*word|word for|\bword\b/i, "Microsoft Word"], [/print to pdf|microsoft: print/i, "Imprimir como PDF (Windows)"],
  [/canva/i, "Canva"], [/google docs/i, "Google Docs"], [/wps/i, "WPS Office"], [/xodo/i, "Xodo"],
  [/pdf ?candy/i, "PDF Candy"], [/soda ?pdf/i, "Soda PDF"], [/photoshop/i, "Photoshop"],
];

const dataHoraBR = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
};

export function sinaisDeAdulteracao(m: MetaPdf | null | undefined): string[] {
  if (!m) return [];
  const out: string[] = [];
  const programa = `${m.produtor} ${m.criador}`;
  const editor = EDITORES.find(([re]) => re.test(programa));
  if (editor) out.push(`não é o PDF original do tribunal: passou pelo ${editor[1]} — confira o código no site`);
  if (m.edicoes > 0) out.push("o PDF foi alterado e salvo de novo depois de gerado — confira o código no site");
  else if (m.criadoEm && m.modificadoEm) {
    const dif = new Date(m.modificadoEm).getTime() - new Date(m.criadoEm).getTime();
    if (dif > 10 * 60000) out.push(`modificado em ${dataHoraBR(m.modificadoEm)}, depois de gerado em ${dataHoraBR(m.criadoEm)} — confira o código no site`);
  }
  return out;
}

/* ------------------------------------------ verificação no site */

/* Página de autenticidade de cada tribunal (a que a própria certidão
   imprime). Só endereço da Justiça (.jus.br) vira link: um PDF forjado não
   pode mandar o P/1 para um site qualquer. */
const PAGINA_AUTENTICIDADE: Record<number, string> = {
  1: "https://jurisconsult.tjma.jus.br/", 2: "https://jurisconsult.tjma.jus.br/", 3: "https://jurisconsult.tjma.jus.br/",
  4: "https://sistemas.trf1.jus.br/certidao/",
  5: "https://certidoes.trf2.jus.br/certidoes/#/principal/verificar",
  6: "https://web.trf3.jus.br/certidao-regional/CertidaoCivelEleitoralCriminal/VerificarAutenticidade",
  7: "https://www.trf4.jus.br/autenticidade",
  8: "https://www.trf5.jus.br/",
  9: "https://sistemas.trf6.jus.br/certidao/",
};
const PAGINA_CJF = "https://certidao-unificada.cjf.jus.br/#/validacao-certidao";

export function linkDeVerificacao(texto: string, ordem: number, codigo?: string): string {
  // junta o endereço que a quebra de linha partiu ("verificar?\nconsultar=...")
  const corrido = texto.replace(/([?&=\-/])\s+(?=[\w#])/g, "$1");
  const urls = (corrido.match(/(?:https?:\/\/|www\.)[^\s;,"'<>()]+/gi) || [])
    // sempre https (o TRF4 imprime "http://")
    .map((u) => (u.startsWith("http") ? u : `https://${u}`).replace(/^http:\/\//i, "https://").replace(/[.]+$/, ""))
    .filter((u) => { try { return new URL(u).hostname.endsWith(".jus.br"); } catch { return false; } });
  const comCodigo = codigo ? urls.find((u) => u.replace(/\W/g, "").includes(codigo.replace(/\W/g, ""))) : undefined;
  const deVerificar = urls.find((u) => /verific|validac|autentic/i.test(u));
  if (comCodigo) return comCodigo;
  if (deVerificar) return deVerificar;
  if (/CONSELHO DA JUSTICA FEDERAL/.test(normalizar(texto))) return PAGINA_CJF;
  return PAGINA_AUTENTICIDADE[ordem] || "";
}

/* Amostra para conferir no site: cerca de 1 em cada 4 certidões, sempre as
   MESMAS para o mesmo militar e período (não muda a cada vez que se abre). */
export function sorteadaParaSite(periodoId: string, efetivoId: string, ordem: number): boolean {
  let h = 2166136261;
  for (const c of `${periodoId}|${efetivoId}|${ordem}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % 4 === 0;
}

/* CLONE: o mesmo código de validação em dois militares é a certidão de um
   com o nome do outro (ou duas pessoas usando o mesmo arquivo). Cruza todos
   os conferidos do período e acrescenta o alerta nos dois lados. */
export function marcarCodigosRepetidos(
  conferencias: Map<string, ResultadoConferencia>,
  nomeDe: (efetivoId: string) => string,
): Map<string, ResultadoConferencia> {
  const chave = (c: string) => c.replace(/\W/g, "").toUpperCase();
  const donos = new Map<string, Set<string>>();
  conferencias.forEach((r, id) => {
    for (const i of r.itens) {
      if (!i.codigo || chave(i.codigo).length < 6) continue;
      const k = chave(i.codigo);
      if (!donos.has(k)) donos.set(k, new Set());
      donos.get(k)!.add(id);
    }
  });
  const out = new Map<string, ResultadoConferencia>();
  conferencias.forEach((r, id) => {
    let mudou = false;
    const itens = r.itens.map((i) => {
      const outros = i.codigo ? Array.from(donos.get(chave(i.codigo)) || []).filter((x) => x !== id) : [];
      if (!outros.length) return i;
      mudou = true;
      return {
        ...i, suspeita: true,
        alertas: [...i.alertas, `mesmo código da certidão de ${outros.map(nomeDe).join(", ")} — possível certidão clonada`],
      };
    });
    out.set(id, mudou ? { ...r, itens, status: "atencao" } : r);
  });
  return out;
}

/* -------------------------------------------------------------- conferir */

export function conferirCertidoes(
  arquivos: ArquivoLido[],
  militar: MilitarConferido,
  exigidas: number[],
  hoje: Date,
  prazoEntrega?: Date | null,
): ResultadoConferencia {
  const gerais: string[] = [];
  // cobre: os itens que a certidão vale (a Unificada vale do TRF1 ao TRF5)
  const achados = new Map<number, { doc: Documento; arquivo: ArquivoLido; texto: string; cobre: number[] }[]>();
  const semTexto = new Set<number>();
  const cpfFicha = soDigitos(militar.cpf || "");

  for (const arq of arquivos) {
    const total = arq.paginas.join("").replace(/\s/g, "").length;
    const como = arq.ordens.length > 1 ? "a Certidão Unificada" : ROTULO_ITEM[arq.ordens[0]] || `item ${arq.ordens[0]}`;
    if (arq.incompleto) {
      gerais.push(`Ainda falta ler imagem do arquivo enviado como ${como} — confira de novo em instantes.`);
    }
    if (arq.erroLeitura) {
      arq.ordens.forEach((o) => semTexto.add(o));
      gerais.push(`Não consegui abrir o arquivo enviado como ${como}: confira abrindo.`);
      continue;
    }
    if (total < 150) {
      arq.ordens.forEach((o) => semTexto.add(o));
      gerais.push(`O arquivo enviado como ${como} não tem texto (foto ou escaneado): confira abrindo.`);
      continue;
    }
    for (const doc of separarDocumentos(arq.paginas)) {
      const ordens = identificar(doc.texto);
      if (!ordens) {
        gerais.push(`Documento não reconhecido como certidão no arquivo enviado como ${como} (página ${doc.pagina}).`);
        continue;
      }
      for (const o of ordens) {
        if (!achados.has(o)) achados.set(o, []);
        achados.get(o)!.push({ doc, arquivo: arq, texto: doc.texto, cobre: ordens });
      }
    }
  }

  const cpfsVistos = new Set<string>();
  const itens: ItemConferido[] = exigidas.map((ordem) => {
    const rotulo = ROTULO_ITEM[ordem] || `Item ${ordem}`;
    const lista = achados.get(ordem) || [];
    if (!lista.length) {
      return {
        ordem, rotulo, achou: false,
        alertas: [semTexto.has(ordem) ? "arquivo sem texto — conferir abrindo" : "não encontrada nos arquivos enviados"],
      };
    }
    /* A mesma certidão pode vir mais de uma vez (a Unificada no lugar do TRF1
       e as regionais nos seus lugares) — não é erro, as duas valem. Confere-se
       a que está no lugar do item; senão a da própria região; senão a que houver. */
    const escolhida = lista.find((l) => l.arquivo.ordens.includes(ordem))
      || lista.find((l) => l.cobre.length === 1) || lista[0];
    const { doc, arquivo, texto } = escolhida;
    const n = umaLinha(normalizar(texto));
    const alertas: string[] = [];
    const federal = ordem >= 4;

    /* Federal em lugar de outra federal é só ordem trocada dentro da Justiça
       Federal (a Unificada junta tudo): não atrapalha. Errado é a certidão cair
       fora do seu grupo (uma do TRF no lugar do TJMA, ou o contrário). */
    const noLugar = arquivo.ordens.includes(ordem) || (federal && arquivo.ordens.some((o) => o >= 4));
    if (!noLugar) {
      const como = arquivo.ordens.length > 1 ? "Certidão Unificada" : ROTULO_ITEM[arquivo.ordens[0]];
      alertas.push(`foi enviada no lugar de ${como}`);
    }

    // a certidão certa: penal no TJMA, criminal na Justiça Federal
    if (!federal && !/ACOES PENAIS/.test(n)) alertas.push("não é a de AÇÕES PENAIS");
    if (federal && !/CRIMINA/.test(n)) alertas.push("não é a certidão CRIMINAL");

    // o resultado: tem de dizer que nada consta
    const negativa = /NADA CONSTA|NAO CONSTA/.test(n);
    const positiva = /POSITIVA/.test(n) || /\bCONSTA(M)? (O|OS|A|AS) SEGUINTES?\b/.test(n);
    if (positiva || !negativa) alertas.push("não diz NADA CONSTA — pode ser POSITIVA, abra e confira");

    // é do militar?
    if (militar.nome && !nomeConfere(texto, militar.nome)) {
      const visto = nomeNaCertidao(texto);
      alertas.push(`nome diferente da ficha${visto ? ` (na certidão: ${visto})` : ""}`);
    }
    const cpfs = cpfsNaCertidao(texto);
    cpfs.forEach((c) => cpfsVistos.add(c));
    if (cpfFicha.length === 11 && cpfs.length && !cpfs.includes(cpfFicha)) {
      alertas.push(`CPF diferente da ficha (na certidão: ${cpfs[0].replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")})`);
    }

    // prazo
    const { emissao, validade } = datasDa(texto);
    const dEmissao = dataBR(emissao), dValidade = dataBR(validade);
    if (!emissao) alertas.push("data de emissão não encontrada");
    if (dValidade) {
      if (dValidade < hoje) alertas.push(`vencida em ${validade}`);
      else if (prazoEntrega && dValidade < prazoEntrega) {
        alertas.push(`vence em ${validade}, antes da entrega à CPPPM`);
      }
    } else if (federal && dEmissao) {
      const dias = Math.floor((hoje.getTime() - dEmissao.getTime()) / 86400000);
      if (dias > DIAS_FEDERAL) alertas.push(`emitida há ${dias} dias`);
    }
    if (dEmissao && dEmissao.getTime() > hoje.getTime() + 86400000) alertas.push(`emissão no futuro (${emissao})`);

    // sinais do arquivo (programa de edição, salvo de novo...)
    const sinais = arquivo.sinais || [];
    for (const sx of sinais) if (!alertas.includes(sx)) alertas.push(sx);
    const codigo = codigoDa(texto);
    // PDF com texto do tribunal sempre traz o código; sem ele, desconfie
    if (!codigo && !arquivo.porImagem) alertas.push("código de validação não encontrado — confira no site");

    return {
      ordem, rotulo, achou: true, pagina: doc.pagina, emissao, validade, codigo,
      linkVerificacao: linkDeVerificacao(texto, ordem, codigo) || undefined,
      ...(arquivo.porImagem ? { porImagem: true } : {}),
      ...(sinais.length || (!codigo && !arquivo.porImagem) ? { suspeita: true } : {}),
      alertas,
    };
  });

  // sem CPF na ficha, ao menos todas têm de ser do MESMO CPF
  if (cpfFicha.length !== 11 && cpfsVistos.size > 1) {
    gerais.push("As certidões trazem CPFs diferentes entre si — confira se são todas do militar.");
  }

  const tudoSemTexto = arquivos.length > 0 && exigidas.every((o) => semTexto.has(o));
  const temAlerta = gerais.length > 0 || itens.some((i) => i.alertas.length);
  return {
    status: tudoSemTexto ? "sem_texto" : temAlerta ? "atencao" : "ok", itens, gerais,
    ...(arquivos.some((a) => a.incompleto) ? { incompleto: true } : {}),
  };
}
