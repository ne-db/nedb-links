import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { portalPlugin } from "@interchained/portal-core/vite";

/**
 * Portal's `@portal/routes` virtual module emits relative specifiers
 * (`import Route0 from "./routes/index.page.tsx"`). On Vite 5.4.x those can't be
 * resolved from a `\0virtual:` importer, which throws:
 *   "Failed to resolve import './routes/index.page.tsx' from 'virtual:@portal/routes'".
 * This shim rewrites them to absolute paths — scoped strictly to that virtual module,
 * so it never touches normal app imports.
 */
function portalRouteResolver(): Plugin {
  let root = process.cwd();
  return {
    name: "portal-virtual-route-resolver",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },
    resolveId(source, importer) {
      if (
        importer &&
        importer.includes("@portal/routes") &&
        (source.startsWith("./") || source.startsWith("../"))
      ) {
        return resolve(root, source);
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // PORT      = Express API server (used by `npm run start` and `npm run dev:api`)
  // VITE_PORT = Vite dev client (what the browser connects to in dev, default 3000)
  // LINKS_API_URL = full override for the API proxy target (optional)
  const apiPort   = env.PORT      || "3001";
  const clientPort = Number(env.VITE_PORT || 3000);
  const apiTarget = env.LINKS_API_URL || `http://localhost:${apiPort}`;

  // Paths the DEV SERVER owns (the editor SPA + Vite internals). Everything
  // else — /:handle profiles, /go click redirects, /api — belongs to the
  // Express server, exactly like production. Without this, published
  // profiles 404 into the SPA during `npm run dev` (found live by Mark:
  // "View" showed the not-claimed page for a claimed handle).
  const SPA_PREFIXES = ["/identities", "/edit", "/src", "/node_modules", "/assets"];
  function servedByVite(url: string): boolean {
    const path = url.split("?")[0];
    if (path === "/" || path === "/index.html") return true;
    if (path.startsWith("/@")) return true; // vite client, HMR, virtual modules
    if (path.includes(".")) return true; // files with extensions (favicon, ts, css…)
    return SPA_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  }

  return {
    plugins: [react(), portalPlugin(), portalRouteResolver()],
    server: {
      port: clientPort,
      allowedHosts: true,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        // Catch-all: public surfaces render on the API server in dev too.
        "/": {
          target: apiTarget,
          changeOrigin: true,
          bypass: (req) => (req.url && servedByVite(req.url) ? req.url : undefined),
        },
      },
    },
    resolve: {
      alias: { "@": "/src" },
    },
  };
});
