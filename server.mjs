import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadEnv, ROOT_DIR } from "./lib/env.mjs";
import { getProvider, getProviders } from "./providers/index.mjs";

loadEnv();

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(SERVER_DIR, "public");
const SAMPLES_DIR = join(PUBLIC_DIR, "samples");
const RUNS_DIR = join(SERVER_DIR, "runs");
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const SAMPLE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff"]);

mkdirSync(RUNS_DIR, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/api/providers") {
      return sendJson(response, 200, { providers: getProviders() });
    }

    if (request.method === "GET" && url.pathname === "/api/samples") {
      return sendJson(response, 200, { samples: listSamples() });
    }

    if (request.method === "POST" && url.pathname === "/api/convert") {
      const body = await readJsonBody(request);
      return handleConvert(response, body);
    }

    if (request.method === "GET" && url.pathname.startsWith("/runs/")) {
      return serveRunFile(response, url.pathname);
    }

    if (request.method === "GET") {
      return serveStatic(response, url.pathname);
    }

    return sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    const status = error.status && Number.isInteger(error.status) ? error.status : 500;
    return sendJson(response, status, {
      error: error.message ?? "Unexpected error",
      details: error.errorInfo ?? undefined,
    });
  }
});

const requestedPort = Number(process.env.PORT ?? 5174);
listenWithFallback(requestedPort);

async function handleConvert(response, body) {
  const provider = getProvider(body.provider);
  if (!provider) {
    return sendJson(response, 400, { error: `Provider non disponibile: ${body.provider}` });
  }

  const image = parseImagePayload(body.image);
  const runId = createRunId(provider.id);
  const runDir = join(RUNS_DIR, runId);

  const result = await provider.convert(image, body.options ?? {}, runDir);
  return sendJson(response, 200, {
    ...result,
    runId,
    runFiles: (result.runFiles ?? []).map((file) => ({
      ...file,
      url: `/runs/${runId}/${encodeURIComponent(file.name)}`,
    })),
  });
}

function listSamples() {
  if (!existsSync(SAMPLES_DIR)) return [];

  return readdirSync(SAMPLES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => SAMPLE_EXTENSIONS.has(name.slice(name.lastIndexOf(".")).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }))
    .map((name) => ({
      name,
      url: `/samples/${encodeURIComponent(name)}`,
    }));
}

function parseImagePayload(image) {
  if (!image || typeof image !== "object") {
    throw httpError(400, "Immagine mancante");
  }

  const name = typeof image.name === "string" ? image.name : "design.png";
  const dataUrl = typeof image.dataUrl === "string" ? image.dataUrl : "";
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw httpError(400, "Payload immagine non valido");
  }

  return {
    name,
    mimeType: match[1],
    base64: match[2],
  };
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejectBody(httpError(413, "Payload troppo grande"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        rejectBody(httpError(400, "JSON non valido"));
      }
    });

    request.on("error", rejectBody);
  });
}

function serveStatic(response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = safeResolve(PUBLIC_DIR, safePath);
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    return sendText(response, 404, "Not found", "text/plain");
  }

  return sendBuffer(response, 200, readFileSync(filePath), contentType(filePath));
}

function serveRunFile(response, pathname) {
  const relative = pathname.replace(/^\/runs\//, "");
  const filePath = safeResolve(RUNS_DIR, relative);
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    return sendText(response, 404, "Not found", "text/plain");
  }

  return sendBuffer(response, 200, readFileSync(filePath), contentType(filePath));
}

function safeResolve(root, requestPath) {
  const decoded = decodeURIComponent(requestPath).replace(/^[/\\]+/, "");
  const target = resolve(root, normalize(decoded));
  return target.startsWith(resolve(root)) ? target : null;
}

function sendJson(response, status, payload) {
  return sendText(response, status, JSON.stringify(payload), "application/json; charset=utf-8");
}

function sendText(response, status, text, type) {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  response.end(text);
}

function sendBuffer(response, status, buffer, type) {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  response.end(buffer);
}

function contentType(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";
  return "application/octet-stream";
}

function createRunId(providerId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${providerId}-${random}`;
}

function listenWithFallback(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && port < requestedPort + 20) {
      listenWithFallback(port + 1);
      return;
    }
    throw error;
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Embroidery Lab running at http://127.0.0.1:${port}`);
    console.log(`Workspace: ${ROOT_DIR}`);
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
