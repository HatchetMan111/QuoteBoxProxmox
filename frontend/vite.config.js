import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build-Output nach app/dist: Der Installer/Updater kopiert app/ komplett in
// den Container - so ist das fertige Frontend automatisch dabei und im CT
// wird kein Node benoetigt.
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    target: "es2018", // altes Wand-Tablet: konservativ transpilieren
    outDir: "../app/dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:5000",
      "/health": "http://127.0.0.1:5000",
    },
  },
});
