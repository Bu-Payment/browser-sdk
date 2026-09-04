import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

Bun.serve({
  hostname: "127.0.0.1",
  port: 47831,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/public/v1/")) {
      if (request.headers.has("cookie")) return new Response("cookie forwarded", { status: 400 });
      if (path.endsWith("/application-sessions")) {
        return Response.json({
          token: "session-token",
          expiresAt: "2030-01-01T01:00:00.000Z",
          renewAfter: "2030-01-01T00:30:00.000Z",
          capabilities: ["catalogue:read"],
        });
      }
      return Response.json({ data: [], nextCursor: null });
    }
    if (path === "/sdk.js") {
      return new Response(await readFile(resolve(root, "dist/index.js")), {
        headers: { "Content-Type": "text/javascript" },
      });
    }
    return new Response("<!doctype html><button id='pay'>Pay</button><div id='result'></div>", {
      headers: {
        "Content-Type": "text/html",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'self' https://payment.tmtprotects.com; style-src https://payment.tmtprotects.com; connect-src 'self' https://api.example.test",
      },
    });
  },
});
