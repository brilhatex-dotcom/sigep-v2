"use client";

import {
  ArrowLeftRight, Bell, CalendarDays, Contact, FileSignature, Medal, MessageSquare, Shield, Smartphone, Sun,
} from "lucide-react";
import Apresentacao, { type SlideApresentacao } from "@/components/Apresentacao";

/* =========================================================================
   BOAS-VINDAS AO SIGEP — a apresentação do primeiro acesso.

   Funciona como um vídeo curto: slides que passam sozinhos, com a barra de
   progresso em cima (como os "stories" do celular), e um botão "Ouvir" que
   NARRA cada slide em português do Brasil com a voz do próprio aparelho —
   sem arquivo de vídeo para baixar, o que pesa no 4G do quartel.

   O policial não é obrigado a assistir: fecha a qualquer momento (X, "Pular",
   tecla Esc). Aparece uma vez por pessoa (ver boasVindasDb.ts).

   O conteúdo fala do que o POLICIAL encontra no menu — não das telas do P/1.
   ========================================================================= */

// Texto revisto com o P/1: benefícios, sem comparar com "como era antes".
const SLIDES: SlideApresentacao[] = [
  {
    Icone: Shield,
    imagem: "/brasoes/brasao-18bpm.png",
    imagemAlt: "Brasão do 18º BPM",
    titulo: "Boas-vindas ao SIGEP",
    texto: "O Sistema de Gestão de Pessoal do 18º BPM traz mais agilidade, transparência e segurança para você: férias, promoção, requerimentos e os seus dados na palma da mão, a qualquer hora e de qualquer lugar.",
  },
  {
    Icone: Contact,
    titulo: "Sua ficha e seus dados",
    texto: "Em Ficha Individual você confere e atualiza os seus dados pessoais.",
    itens: ["Ficha Individual"],
  },
  {
    Icone: CalendarDays,
    selo: "Em breve",
    titulo: "Sua escala na palma da mão",
    texto: "Em breve teremos aqui a escala do dia, assim que ela for publicada, e os seus próximos serviços. Precisa trocar? Você vai pedir a permuta aqui mesmo: o colega dá o concordo e o P/1 defere.",
    itens: ["Escala de Serviço", "Meu Mapa de Escala", "Permutas"],
  },
  {
    Icone: Sun,
    titulo: "Suas férias",
    texto: "Em Minhas Férias você vê a sua equipe, o período e baixa o seu memorando.",
    itens: ["Minhas Férias"],
  },
  {
    Icone: Medal,
    titulo: "Promoção sem papelada",
    texto: "Envie as suas certidões em PDF, o sistema monta o PDF unificado na ordem oficial e você manda ao P/1. Depois é só acompanhar: você vê quando o P/1 recebe.",
    itens: ["Promoções / Certidões"],
  },
  {
    Icone: FileSignature,
    titulo: "Requerimentos com assinatura",
    texto: "Monte requerimentos já preenchidos com os seus dados e assine pelo próprio SIGEP, com a sua senha. O documento sai com QR Code, que qualquer pessoa confere em Verificar Documento.",
    itens: ["Requerimentos", "Verificar Documento"],
  },
  {
    Icone: Smartphone,
    titulo: "Tenha o SIGEP como aplicativo",
    texto: "Salve o SIGEP na tela inicial do celular e abra com um toque, sem baixar nada da loja.",
    passos: [
      "Android (Chrome): toque em ⋮ e em “Adicionar à tela inicial”",
      "iPhone (Safari): toque em Compartilhar e em “Adicionar à Tela de Início”",
    ],
    fala: "Salve o SIGEP na tela inicial do celular e abra com um toque, sem baixar nada da loja. No Android, no Chrome, toque no menu de três pontinhos e em Adicionar à tela inicial. No iPhone, no Safari, toque em Compartilhar e em Adicionar à Tela de Início.",
  },
  {
    Icone: Bell,
    titulo: "Fique de olho no sino",
    texto: "O sino, lá em cima, mostra o que espera por você: uma assinatura, uma permuta, um documento. No Chat você fala com a unidade. Dúvidas? Procure o P/1. Bom serviço!",
    itens: ["Sino de avisos", "Chat"],
  },
];

const SEGUNDOS = 9;   // por slide, sem narração

const ICONE_ITEM: Record<string, typeof Shield> = {
  "Escala de Serviço": CalendarDays, "Meu Mapa de Escala": CalendarDays, Permutas: ArrowLeftRight,
  "Minhas Férias": Sun, Requerimentos: FileSignature,
  "Verificar Documento": Shield, "Sino de avisos": Bell, Chat: MessageSquare,
  "Promoções / Certidões": Medal, "Ficha Individual": Contact,
};

export default function BoasVindas({ nome, aoFechar }: { nome?: string; aoFechar: () => void }) {
  return (
    <Apresentacao
      slides={SLIDES}
      saudacao={nome ? `Olá, ${nome}!` : undefined}
      segundos={SEGUNDOS}
      iconesItens={ICONE_ITEM}
      aoFechar={aoFechar}
    />
  );
}
