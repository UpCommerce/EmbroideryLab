import { createServer } from "node:http";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadEnv, ROOT_DIR } from "./lib/env.mjs";
import {
  backfillExecutionsFromRuns,
  getCompare,
  listCompares,
  listExecutions,
  openHistoryDatabase,
  recordCompare,
  recordExecution,
  runFilesFromDirectory,
} from "./lib/history-db.mjs";
import { generateHistoryReport } from "./lib/history-report.mjs";
import { preprocessSourceImage } from "./lib/source-preprocess.mjs";
import { getProvider, getProviders } from "./providers/index.mjs";

loadEnv();

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(SERVER_DIR, "public");
const SAMPLES_DIR = join(PUBLIC_DIR, "samples");
const RUNS_DIR = join(SERVER_DIR, "runs");
const LOGS_DIR = join(SERVER_DIR, "logs");
const DATA_DIR = join(SERVER_DIR, "data");
const REPORTS_DIR = join(SERVER_DIR, "reports");
const SOURCE_ORIGINALS_DIR = join(SERVER_DIR, "source-originals");
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const SAMPLE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff"]);
const WILCOM_MAX_SOURCE_PIXELS = 4_900_000;
const WILCOM_MAX_SOURCE_BYTES = 1_900_000;

mkdirSync(RUNS_DIR, { recursive: true });
mkdirSync(LOGS_DIR, { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(REPORTS_DIR, { recursive: true });
mkdirSync(SOURCE_ORIGINALS_DIR, { recursive: true });
openHistoryDatabase(join(DATA_DIR, "history.sqlite"));
backfillExecutionsFromRuns(RUNS_DIR);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { status: "ok" });
    }

    if (request.method === "GET" && url.pathname === "/api/providers") {
      return sendJson(response, 200, { providers: getProviders() });
    }

    if (request.method === "GET" && url.pathname === "/api/samples") {
      return sendJson(response, 200, { samples: listSamples() });
    }

    if (request.method === "GET" && url.pathname === "/api/history") {
      return sendJson(response, 200, {
        compares: listCompares({ limit: numberParam(url.searchParams.get("compareLimit"), 50) }),
        executions: listExecutions({ limit: numberParam(url.searchParams.get("executionLimit"), 150) }),
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/history/compares/")) {
      const id = decodeURIComponent(url.pathname.replace(/^\/api\/history\/compares\//, ""));
      const compare = getCompare(id);
      return compare ? sendJson(response, 200, { compare }) : sendJson(response, 404, { error: "Compare non trovato" });
    }

    if (request.method === "POST" && url.pathname === "/api/history/compares") {
      const body = await readJsonBody(request);
      return sendJson(response, 200, { compare: recordCompare(body) });
    }

    if (request.method === "POST" && url.pathname === "/api/reports/history") {
      const report = await generateHistoryReport({
        repoDir: SERVER_DIR,
        dbPath: join(DATA_DIR, "history.sqlite"),
        reportsDir: REPORTS_DIR,
      });
      return sendJson(response, 200, { report });
    }
    if (request.method === "POST" && url.pathname === "/api/convert") {
      const body = await readJsonBody(request);
      return await handleConvert(response, body);
    }

    if (request.method === "POST" && url.pathname === "/api/convert-text") {
      const body = await readJsonBody(request);
      return await handleConvertText(response, body);
    }

    if (request.method === "GET" && url.pathname.startsWith("/runs/")) {
      return serveRunFile(response, url.pathname);
    }

    if (request.method === "GET" && url.pathname.startsWith("/reports/")) {
      return serveReportFile(response, url.pathname);
    }
    if (request.method === "GET") {
      return serveStatic(response, url.pathname);
    }

    return sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    const status = error.status && Number.isInteger(error.status) ? error.status : 500;
    logServerError(request, error, status);
    return sendJson(response, status, buildErrorResponse(error));
  }
});

const requestedPort = Number(process.env.PORT ?? 5174);
const host = process.env.HOST ?? "127.0.0.1";
listenWithFallback(requestedPort);

async function handleConvert(response, body) {
  const provider = getProvider(body.provider);
  if (!provider) {
    return sendJson(response, 400, { error: `Provider non disponibile: ${body.provider}` });
  }

  const image = parseImagePayload(body.image);
  const runId = createRunId(provider.id);
  const runDir = join(RUNS_DIR, runId);
  mkdirSync(runDir, { recursive: true });

  let result;
  let sourcePreprocess;
  try {
    const preprocessing = preprocessingOptionsForProvider(provider.id, body.options?.preprocessing ?? {});
    sourcePreprocess = await preprocessSourceImage(image, preprocessing, {
      runDir,
      samplesDir: SAMPLES_DIR,
      sourceOriginalsDir: SOURCE_ORIGINALS_DIR,
    });
    result = await provider.convert(sourcePreprocess.image, body.options ?? {}, runDir, {
      samplesDir: SAMPLES_DIR,
      sourceOriginalsDir: SOURCE_ORIGINALS_DIR,
      sourcePreprocess,
    });
  } catch (error) {
    writeRunErrorLog({
      error,
      providerId: provider.id,
      runId,
      runDir,
      image,
      sourcePreprocess,
      options: body.options ?? {},
    });
    recordExecution({
      runId,
      providerId: provider.id,
      ok: false,
      status: statusForError(error),
      error,
      image,
      sourcePreprocess: sourcePreprocess?.manifest,
      options: body.options ?? {},
      runFiles: runFilesFromDirectory(runId, runDir),
    });
    throw error;
  }

  const runFiles = ([...(sourcePreprocess?.runFiles ?? []), ...(result.runFiles ?? [])]).map((file) => ({
    ...file,
    url: `/runs/${runId}/${encodeURIComponent(file.name)}`,
  }));
  const payload = {
    ...result,
    runId,
    sourcePreprocess: sourcePreprocess?.manifest,
    runFiles,
  };

  recordExecution({
    runId,
    providerId: provider.id,
    ok: true,
    status: 200,
    image,
    sourcePreprocess: sourcePreprocess?.manifest,
    options: body.options ?? {},
    result,
    runFiles,
  });

  return sendJson(response, 200, payload);
}

async function handleConvertText(response, body) {
  const provider = getProvider(body.provider);
  if (!provider) {
    return sendJson(response, 400, { error: "Provider non disponibile: " + body.provider });
  }

  if (typeof provider.convertText !== "function") {
    return sendJson(response, 400, { error: provider.id + " non supporta ancora la conversione testo" });
  }

  const textSource = parseTextPayload(body.source ?? body.text);
  const runId = createRunId(provider.id);
  const runDir = join(RUNS_DIR, runId);
  mkdirSync(runDir, { recursive: true });

  const sourceManifest = textSourceManifest(textSource);
  const sourcePreprocess = { manifest: sourceManifest };
  let result;

  try {
    result = await provider.convertText(textSource, body.options ?? {}, runDir, { sourceManifest });
  } catch (error) {
    writeRunErrorLog({
      error,
      providerId: provider.id,
      runId,
      runDir,
      image: textSourceAsImage(textSource),
      sourcePreprocess,
      options: { ...(body.options ?? {}), sourceType: "text" },
    });
    recordExecution({
      runId,
      providerId: provider.id,
      ok: false,
      status: statusForError(error),
      error,
      image: { name: textSource.name },
      sourcePreprocess: sourceManifest,
      options: { ...(body.options ?? {}), sourceType: "text" },
      runFiles: runFilesFromDirectory(runId, runDir),
    });
    throw error;
  }

  const runFiles = (result.runFiles ?? []).map((file) => ({
    ...file,
    url: "/runs/" + runId + "/" + encodeURIComponent(file.name),
  }));
  const payload = {
    ...result,
    runId,
    sourcePreprocess: sourceManifest,
    runFiles,
  };

  recordExecution({
    runId,
    providerId: provider.id,
    ok: true,
    status: 200,
    image: { name: textSource.name },
    sourcePreprocess: sourceManifest,
    options: { ...(body.options ?? {}), sourceType: "text" },
    result,
    runFiles,
  });

  return sendJson(response, 200, payload);
}

function preprocessingOptionsForProvider(providerId, requestedOptions) {
  const options = { ...(requestedOptions ?? {}) };
  if (providerId !== "wilcom") return options;

  options.maxSourcePixels = stricterLimit(options.maxSourcePixels, WILCOM_MAX_SOURCE_PIXELS);
  options.maxSourceBytes = stricterLimit(options.maxSourceBytes, WILCOM_MAX_SOURCE_BYTES);
  return options;
}

function stricterLimit(value, fallback) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return Math.min(number, fallback);
  return fallback;
}

function numberParam(value, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(number, 500);
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

function parseTextPayload(source) {
  const rawText = typeof source === "string" ? source : source?.text;
  const text = String(rawText ?? "").trim();
  if (!text) {
    throw httpError(400, "Testo mancante");
  }
  if (text.length > 500) {
    throw httpError(400, "Testo troppo lungo: limite Lab 500 caratteri per singola prova");
  }

  const requestedName = typeof source === "object" && source?.name ? String(source.name) : "lettering.txt";
  return {
    name: safeTextSourceName(requestedName, text),
    text,
  };
}

function safeTextSourceName(name, text) {
  const cleaned = String(name || "").replace(/[^0-9A-Za-z._ -]/g, "_").trim();
  if (cleaned) return cleaned.toLowerCase().endsWith(".txt") ? cleaned : cleaned + ".txt";
  const slug = text.split(/\s+/).slice(0, 4).join("-").replace(/[^0-9A-Za-z_-]/g, "_");
  return (slug || "lettering") + ".txt";
}

function textSourceManifest(source) {
  return {
    kind: "text",
    original: {
      name: source.name,
      chars: source.text.length,
      lines: source.text.split(/\r?\n/).length,
    },
    sent: {
      name: source.name,
      chars: source.text.length,
      lines: source.text.split(/\r?\n/).length,
    },
  };
}

function textSourceAsImage(source) {
  return {
    name: source.name,
    mimeType: "text/plain",
    base64: Buffer.from(source.text, "utf8").toString("base64"),
  };
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

function serveReportFile(response, pathname) {
  const relative = pathname.replace(/^\/reports\//, "");
  const filePath = safeResolve(REPORTS_DIR, relative);
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
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";
  return "application/octet-stream";
}

function writeRunErrorLog({ error, providerId, runId, runDir, image, sourcePreprocess, options }) {
  mkdirSync(runDir, { recursive: true });
  const logFileName = "error.json";
  const logPath = join(runDir, logFileName);
  const publicLogPath = `/runs/${runId}/${logFileName}`;
  const entry = {
    timestamp: new Date().toISOString(),
    scope: "conversion",
    provider: providerId,
    runId,
    status: statusForError(error),
    error: serializeError(error),
    image: summarizeImage(image),
    sourcePreprocess: sourcePreprocess?.manifest,
    options: sanitizeForLog(options),
  };

  writeFileSync(logPath, JSON.stringify(entry, null, 2), "utf8");
  error.runId = runId;
  error.logFile = publicLogPath;
}

function logServerError(request, error, status) {
  const entry = {
    timestamp: new Date().toISOString(),
    scope: "http",
    method: request.method,
    url: request.url,
    status,
    runId: error.runId,
    logFile: error.logFile,
    error: serializeError(error),
  };

  appendFileSync(join(LOGS_DIR, "server-errors.ndjson"), `${JSON.stringify(entry)}\n`, "utf8");
  console.error(
    `[${entry.timestamp}] ${status} ${request.method} ${request.url} ${error.message ?? "Unexpected error"}${
      error.runId ? ` runId=${error.runId}` : ""
    }${error.logFile ? ` log=${error.logFile}` : ""}`
  );
}

function buildErrorResponse(error) {
  return {
    error: error.message ?? "Unexpected error",
    details: error.errorInfo ?? undefined,
    runId: error.runId,
    logFile: error.logFile,
    upstreamResponse: truncateText(error.responseBody),
  };
}

function serializeError(error) {
  return sanitizeForLog({
    name: error.name,
    message: error.message,
    status: statusForError(error),
    code: error.code,
    details: error.errorInfo,
    responseBody: error.responseBody,
    responseXml: error.responseXml,
    stack: error.stack,
  });
}

function summarizeImage(image) {
  if (!image) return null;
  return {
    name: image.name,
    mimeType: image.mimeType,
    bytes: image.base64 ? Buffer.byteLength(image.base64, "base64") : undefined,
  };
}

function sanitizeForLog(value) {
  return JSON.parse(
    JSON.stringify(value, (key, item) => {
      if (/api[-_]?key|authorization|token|secret|password|app[-_]?key/i.test(key)) {
        return item ? "[redacted]" : item;
      }
      if (typeof item === "string") return truncateText(item, 12000);
      return item;
    })
  );
}

function truncateText(value, maxLength = 4000) {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]` : text;
}

function statusForError(error) {
  return error.status && Number.isInteger(error.status) ? error.status : 500;
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

  server.listen(port, host, () => {
    console.log(`Embroidery Lab running at http://${host}:${port}`);
    console.log(`Workspace: ${ROOT_DIR}`);
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}




