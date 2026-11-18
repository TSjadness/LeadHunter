// Vite config for LeadHunter (TanStack Start + React + Tailwind, deployed as a Cloudflare
// Worker through Nitro). Plain Vite: no hosting-platform wrapper.
import { defineConfig, loadEnv, type UserConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig(async ({ command, mode, isPreview }): Promise<UserConfig> => {
  // Vite only exposes VITE_* to the browser. Server functions read private settings from
  // process.env, so we also load .env / .env.local / .env.[mode] into it. Values already
  // set in the real environment always win; nothing here reaches the client bundle.
  for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }

  // Public (VITE_*) values are inlined at build time, for the browser and for SSR.
  const define: Record<string, string> = {};
  for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), "VITE_"))) {
    define[`import.meta.env.${k}`] = JSON.stringify(v);
  }

  // Nitro packages the production server (Cloudflare Workers by default). Needed for the
  // build and for `vite preview` (which serves that build); not used by `vite dev`.
  const deploy =
    command === "build" || isPreview
      ? [(await import("nitro/vite")).nitro({ defaultPreset: "cloudflare-module" })]
      : [];

  return {
    define,
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Server-only code (src/lib/server/**) can never be imported by browser code.
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        // TanStack Start's server entry is src/server.ts (our SSR error wrapper).
        server: { entry: "server" },
      }),
      ...deploy,
      viteReact(),
    ],
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      // MapLibre v6 starts its worker from a URL relative to its own module; Vite's dep
      // pre-bundling moves the module and breaks that URL ("Worker failed to load").
      exclude: ["maplibre-gl"],
    },
    server: { host: "::", port: 8080 },
  };
});
