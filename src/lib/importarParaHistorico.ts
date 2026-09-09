import { lerTextoDoArquivo, lerPdfItens, linhasDeItens, tipoDoArquivo } from "@/lib/lerArquivoTexto";
import { importarHistorico, type Importacao } from "@/lib/historicoImportar";
import { ehFichaIndividual, lerFichaIndividual, fichaParaHistorico } from "@/lib/fichaIndividual";

/* =========================================================================
   DE QUAL ARQUIVO ESTAMOS FALANDO?

   Dois documentos diferentes alimentam o histórico, e o P/1 não deveria ter
   que dizer qual é qual — basta jogar o arquivo:

   - HISTÓRICO POLICIAL MILITAR (Word/PDF do próprio Batalhão): as quinze
     seções já escritas. Entra como está.
   - FICHA INDIVIDUAL do SGI (PDF da Corporação): o extrato de publicações em
     boletim. Cada nota vira uma linha na seção certa, COM o número do
     boletim — que é justamente o que falta quando o P/1 escreve à mão.

   A escolha é pelo conteúdo, não pelo nome do arquivo: quem baixa do SGI
   raramente renomeia, e nome de arquivo não é prova de nada.
   ========================================================================= */

export type Origem = "historico" | "ficha";
export type LeituraArquivo = {
  origem: Origem;
  texto: string;
  importacao: Importacao;
  /* Só na ficha: quantas notas foram para cada seção. */
  porSecao?: { secao: string; quantas: number }[];
};

export async function lerArquivoParaHistorico(arquivo: File): Promise<LeituraArquivo> {
  const tipo = tipoDoArquivo(arquivo.name);
  if (!tipo) throw new Error("Formato não reconhecido. Use .docx, .doc, .pdf ou .txt.");

  if (tipo === "pdf") {
    const paginas = await lerPdfItens(await arquivo.arrayBuffer());
    const texto = paginas.map((p) => linhasDeItens(p).join("\n")).join("\n");
    if (texto.replace(/\s/g, "").length < 200) {
      throw new Error("Este PDF não tem texto dentro (parece escaneado). Importe o Word, ou passe o PDF por um leitor de texto antes.");
    }
    if (ehFichaIndividual(texto)) {
      const f = lerFichaIndividual(paginas);
      const { dados, porSecao } = fichaParaHistorico(f);
      return {
        origem: "ficha",
        texto,
        porSecao,
        importacao: {
          dados,
          achadas: porSecao.map((s) => ({
            secao: s.secao, titulo: `${s.quantas} publicação(ões) de boletim`, tamanho: s.quantas,
          })),
          /* Na ficha nada "fica de fora": toda nota vai para alguma seção (o
             que não se encaixa cai na XV, que é onde o modelo guarda as
             publicações em boletim). */
          ignoradas: [],
        },
      };
    }
    return { origem: "historico", texto, importacao: importarHistorico(texto) };
  }

  const texto = await lerTextoDoArquivo(arquivo);
  return { origem: "historico", texto, importacao: importarHistorico(texto) };
}
