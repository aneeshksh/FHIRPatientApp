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
    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },

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

    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
