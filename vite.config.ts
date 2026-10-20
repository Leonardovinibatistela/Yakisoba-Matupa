import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Id da versão: vai dentro do HTML (<meta name="build-id">) pro painel saber se existe uma versão mais nova no ar.
const buildId = Date.now().toString(36);
const buildIdPlugin = {
  name: "build-id",
  apply: "build" as const,
  transformIndexHtml: (html: string) => html.replace("</head>", `  <meta name="build-id" content="${buildId}" />\n  </head>`),
};

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile(), buildIdPlugin],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
