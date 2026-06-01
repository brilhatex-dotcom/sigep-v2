import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta institucional do SIGEP-18BPM.
        // Ajuste estes valores na Fase 4 para casar com o visual atual.
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
