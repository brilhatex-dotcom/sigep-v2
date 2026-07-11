"use client";

import { useEffect } from "react";

// Registra o Service Worker uma vez, quando o app carrega.
// Sem isso, nem o PWA instala nem o push funciona.
export default function RegistrarSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const registrar = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (err) {
        console.error("[SW] falha ao registrar:", err);
      }
    };

    // registra apos o load para nao competir com o carregamento inicial
    if (document.readyState === "complete") {
      registrar();
    } else {
      window.addEventListener("load", registrar);
      return () => window.removeEventListener("load", registrar);
    }
  }, []);

  return null;
}
