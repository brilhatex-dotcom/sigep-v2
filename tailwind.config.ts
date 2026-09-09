import type { Config } from "tailwindcss";

/* =========================================================================
   PALETA DO SIGEP

   Antes as cores viviam escritas à mão dentro das classes — #0F1B2D em 187
   lugares, #D4AF37 em 742. Isso tem dois custos: mudar a cara do sistema
   virava caça ao tesouro, e o tom escorregava sem ninguém perceber. Havia
   #0b1626 e #0a1626 convivendo (diferença de 1 no vermelho — ninguém enxerga)
   e duas bordas para a mesma função.

   Aqui elas viram nomes. Por que no config do Tailwind e não em variáveis
   CSS: o dourado é usado com opacidade em mais de 240 lugares (bg-ouro/50),
   e a sintaxe "/50" do Tailwind NÃO funciona com var(). Cor nomeada funciona,
   e o Tailwind monta o rgb com a transparência sozinho.

   As variáveis CSS de mesmo nome existem em globals.css, para os blocos de
   <style> escritos à mão (Mapa de Escala, Escala do dia).
   ========================================================================= */

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* --- identidade --- */
        ouro: "#D4AF37",          // a cor do sistema: ação, item ativo, destaque
        "ouro-claro": "#f3df9d",  // brilho do dourado (gradientes, realce)
        "ouro-texto": "#1a1205",  // texto ESCRITO SOBRE o dourado
        "ouro-fosco": "#6b5320",  // borda/fundo apagado do dourado

        /* --- superfícies, do fundo para a frente --- */
        fundo: "#08111F",         // o fundo da aplicação
        painel: "#0F1B2D",        // cartões, barras, menus
        campo: "#0b1626",         // caixas de entrada e áreas internas
        "painel-2": "#13223a",    // painel um degrau acima
        "painel-3": "#16243a",    // botão secundário
        "azul-frio": "#1d2c44",   // faixas e cabeçalhos de tabela

        /* --- traços --- */
        borda: "#2b3f63",         // borda padrão
        "borda-forte": "#22314d", // divisórias mais marcadas

        /* --- texto, do mais forte ao mais apagado --- */
        texto: "#E8EEF6",
        "texto-2": "#cdd9ea",
        apagado: "#94A3B8",
        "apagado-2": "#6f82a0",

        /* --- estados --- */
        "ok-claro": "#9fe6bd",
        "erro-claro": "#ffb3b3",
        "erro-fundo": "#7a1f1f",
        "ok-fundo": "#10301f",

        /* Paleta antiga da Fase 1, mantida para não quebrar o que ainda a usa. */
        sigep: {
          navy: "#0b1f3a",
          azul: "#13325c",
          dourado: "#c8a047",
          cinza: "#f1f4f8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
