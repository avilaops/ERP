import type { MetadataRoute } from "next";

/**
 * What lets the system be installed on the phone as an application ("Adicionar
 * à tela de início"). The same for every company: it names no one and carries no
 * data. The installed application opens the address like the browser does, with
 * the same login.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ERP Ávila Ops",
    short_name: "ERP",
    description: "Sistema comercial.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ecedea",
    theme_color: "#2c49a8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
