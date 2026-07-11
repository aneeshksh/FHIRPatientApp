import { serve } from "bun";
import index from "./index.html";

const FHIR_BASE_URL = process.env.FHIR_BASE_URL;
const FHIR_BEARER_TOKEN =
  process.env.FHIR_BEARER_TOKEN ?? process.env.BEARER_TOKEN;

if (!FHIR_BASE_URL || !FHIR_BEARER_TOKEN) {
  throw new Error(
    "Missing FHIR_BASE_URL or FHIR_BEARER_TOKEN (or BEARER_TOKEN) in .env",
  );
}

const server = serve({
  routes: {
    "/fhir/*": async req => {
      const url = new URL(req.url);
      const targetPath = url.pathname.replace("/fhir", "");
      const targetUrl = `${FHIR_BASE_URL}${targetPath}${url.search}`;

      const proxied = await fetch(targetUrl, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${FHIR_BEARER_TOKEN}`,
          Accept: "application/fhir+json",
          "Content-Type": "application/fhir+json",
        },
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : await req.text(),
      });

      const body = await proxied.text();
      return new Response(body, {
        status: proxied.status,
        headers: { "Content-Type": "application/fhir+json" },
      });
    },

    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
