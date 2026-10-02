"use client";

import { useState, useEffect } from "react";

/* Frase do dia no painel: metade das vezes um versículo, metade uma frase de
   motivação (algumas com autor). Autor só entra quando a frase é dele de
   verdade — frase "atribuída" sem fonte fica sem nome. */

type Item = { t: string; r?: string };

const MOTIVACIONAIS: Item[] = [
  { t: "A excelência é resultado da disciplina diária." },
  { t: "O sucesso da organização depende da qualidade da administração." },
  { t: "Quem organiza hoje evita problemas amanhã." },
  { t: "A missão é difícil, mas a dedicação faz a diferença." },
  { t: "O trabalho silencioso da P1 sustenta a operacionalidade da tropa." },
  { t: "Disciplina é a ponte entre metas e realizações." },
  { t: "Servir com honra é o maior dos compromissos." },
  { t: "A ordem e o método vencem o caos." },
  { t: "Cada detalhe bem cuidado fortalece a corporação." },
  { t: "O preparo de hoje é a vitória de amanhã." },
  // novas
  { t: "Hierarquia e disciplina: os pilares que mantêm a tropa de pé." },
  { t: "Quem cuida do efetivo cuida da missão." },
  { t: "Pontualidade e palavra cumprida são o cartão de visita do militar." },
  { t: "Documento bem feito é respeito com quem vai lê-lo." },
  { t: "Na dúvida, confira; na certeza, confira de novo." },
  { t: "A tropa só vai bem na rua quando a retaguarda trabalha bem." },
  { t: "Planejar hoje é economizar esforço amanhã." },
  { t: "Férias bem organizadas devolvem à tropa um policial descansado." },
  { t: "O exemplo comanda mais do que a palavra." },
  { t: "A constância vence o que a pressa atropela." },
  { t: "Atender bem o policial também é servir à sociedade." },
  { t: "Trabalho em equipe transforma tarefa difícil em missão cumprida." },
  { t: "Firmeza nas atitudes, serenidade nas decisões." },
  { t: "Honra não se herda: conquista-se todos os dias." },
  { t: "A informação certa, na hora certa, vale por uma viatura a mais." },
  { t: "Um processo bem instruído poupa o tempo de muitos." },
  { t: "Se dez vidas eu tivesse, dez vidas eu daria.", r: "Tiradentes, patrono das Polícias Militares" },
  { t: "Sigam-me os que forem brasileiros!", r: "Duque de Caxias, na Batalha de Itororó" },
  { t: "A justiça atrasada não é justiça, senão injustiça qualificada e manifesta.", r: "Rui Barbosa, Oração aos Moços" },
  { t: "A injustiça em qualquer lugar é uma ameaça à justiça em todo lugar.", r: "Martin Luther King Jr." },
];

const VERSICULOS: Item[] = [
  { t: "Posso todas as coisas naquele que me fortalece.", r: "Filipenses 4:13" },
  { t: "Tudo quanto te vier à mão para fazer, faze-o conforme as tuas forças.", r: "Eclesiastes 9:10" },
  { t: "Não nos cansemos de fazer o bem.", r: "Gálatas 6:9" },
  { t: "O Senhor é a minha força e o meu escudo.", r: "Salmos 28:7" },
  { t: "Se o Senhor não guardar a cidade, em vão vigia a sentinela.", r: "Salmos 127:1" },
  { t: "Sede fortes e corajosos.", r: "Josué 1:9" },
  { t: "O que faz justiça e juízo é mais aceitável ao Senhor do que sacrifício.", r: "Provérbios 21:3" },
  // novos
  { t: "Bem-aventurados os pacificadores, porque eles serão chamados filhos de Deus.", r: "Mateus 5:9" },
  { t: "O Senhor é o meu pastor; nada me faltará.", r: "Salmos 23:1" },
  { t: "Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.", r: "Salmos 37:5" },
  { t: "Consagre ao Senhor tudo o que você faz, e os seus planos serão bem-sucedidos.", r: "Provérbios 16:3" },
  { t: "Tudo o que fizerem, façam de todo o coração, como para o Senhor.", r: "Colossenses 3:23" },
  { t: "Deus não nos deu espírito de covardia, mas de poder, de amor e de equilíbrio.", r: "2 Timóteo 1:7" },
  { t: "Os planos bem elaborados levam à fartura.", r: "Provérbios 21:5" },
  { t: "O Senhor pelejará por vós, e vós vos calareis.", r: "Êxodo 14:14" },
  { t: "Buscai primeiro o Reino de Deus e a sua justiça.", r: "Mateus 6:33" },
  { t: "Alegrem-se na esperança, sejam pacientes na tribulação, perseverem na oração.", r: "Romanos 12:12" },
  { t: "Aquele que habita no esconderijo do Altíssimo, à sombra do Onipotente descansará.", r: "Salmos 91:1" },
  { t: "Lâmpada para os meus pés é a tua palavra, e luz para o meu caminho.", r: "Salmos 119:105" },
  { t: "Bem-aventurados os que têm fome e sede de justiça, porque eles serão fartos.", r: "Mateus 5:6" },
  { t: "Ninguém tem maior amor do que este: de dar alguém a sua vida pelos seus amigos.", r: "João 15:13" },
  { t: "Os que esperam no Senhor renovarão as suas forças.", r: "Isaías 40:31" },
  { t: "O amor é paciente, o amor é bondoso.", r: "1 Coríntios 13:4" },
];

type Frase = { texto: string; ref: string | null };

const ULTIMA = "sigep_frase_ultima";

// Sorteia SO no cliente (dentro de useEffect), evitando divergencia
// entre o HTML do servidor e o do cliente (erro de hydration). Evita repetir
// a mesma frase da visita anterior.
export default function FraseRotativa() {
  const [frase, setFrase] = useState<Frase | null>(null);

  useEffect(() => {
    let anterior = "";
    try { anterior = localStorage.getItem(ULTIMA) || ""; } catch { /* sem localStorage */ }
    const versiculo = Math.random() < 0.5;
    const lista = versiculo ? VERSICULOS : MOTIVACIONAIS;
    let item = lista[Math.floor(Math.random() * lista.length)];
    if (item.t === anterior && lista.length > 1) item = lista[(lista.indexOf(item) + 1) % lista.length];
    try { localStorage.setItem(ULTIMA, item.t); } catch { /* sem localStorage */ }
    setFrase({ texto: versiculo ? `"${item.t}"` : item.t, ref: item.r ?? null });
  }, []);

  return (
    <div className="mb-5 min-h-[58px] rounded-xl border border-white/10 border-l-[3px] border-l-[#D4AF37] bg-gradient-to-r from-[#D4AF37]/10 to-transparent px-5 py-3.5 print:hidden">
      {frase ? (
        <>
          <p className="text-sm italic text-[#e8edf5]">{frase.texto}</p>
          {frase.ref && (
            <p className="mt-1 text-xs font-semibold not-italic text-[#D4AF37]">{frase.ref}</p>
          )}
        </>
      ) : (
        <p className="text-sm italic text-[#94A3B8]">Carregando...</p>
      )}
    </div>
  );
}
