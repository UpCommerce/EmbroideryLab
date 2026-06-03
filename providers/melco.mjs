import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_BASE_URL = "https://client.livedesignerfusion.com";
const SUPPORTED_EMBROIDERY_FORMATS = new Set(["ofm", "exp", "dst"]);
const SUPPORTED_VECTOR_FORMATS = new Set(["svg", "svgz", "png", "eps"]);
const TOKEN_MODES = new Set(["archive", "definition", "file", "preview"]);

export const melcoProvider = {
  id: "melco",
  describe() {
    const missing = missingConfiguration();
    return {
      id: "melco",
      name: "Melco Fusion",
      status: missing.length === 0 ? "ready" : "unavailable",
      configured: missing.length === 0,
      modes: ["fusion-token"],
      baseUrl: baseUrl(),
      missing,
      reason:
        missing.length === 0
          ? null
          : "Melco Fusion public docs expose fulfillment for existing personalization tokens, but not raw bitmap auto-digitizing. Configure Fusion username, auth header, and token to fetch real fulfillment outputs.",
    };
  },
  async convert(input, options, runDir) {
    mkdirSync(runDir, { recursive: true });

    const melcoOptions = options.melco ?? {};
    const token = normalizeOptionalText(melcoOptions.token ?? process.env.MELCO_FUSION_TOKEN);
    const username = normalizeOptionalText(melcoOptions.username ?? process.env.MELCO_FUSION_USERNAME);
    const authHeader = normalizeOptionalText(process.env.MELCO_FUSION_AUTH_HEADER);
    const mode = enumParam(melcoOptions.mode, TOKEN_MODES, "archive", "Melco mode");
    const embFormat = enumParam(
      melcoOptions.embFormat ?? options.designFormat,
      SUPPORTED_EMBROIDERY_FORMATS,
      "ofm",
      "Melco embroidery format"
    );
    const vectorFormat = enumParam(
      melcoOptions.vectorFormat,
      SUPPORTED_VECTOR_FORMATS,
      "png",
      "Melco vector/raster format"
    );
    const dpi = positiveIntegerOrDefault(melcoOptions.dpi, options.dpi ?? 300, "Melco DPI");
    const width = positiveIntegerOrDefault(melcoOptions.previewWidth, 900, "Melco preview width");
    const maxHeight = optionalNonNegativeInteger(melcoOptions.previewMaxHeight, "Melco preview max height");
    const rotate = optionalRotation(melcoOptions.rotateDegrees);
    const includeAllElements = Boolean(melcoOptions.includeAllElements ?? false);
    const recalculateStitches = Boolean(melcoOptions.recalculateStitches ?? false);
    const fulfillmentId = normalizeOptionalText(melcoOptions.fulfillmentId);
    const requestedFileName = normalizeOptionalText(melcoOptions.fileName);
    const fabricStyle = normalizeOptionalText(melcoOptions.fabricStyle);

    const requestInfo = {
      provider: "melco",
      baseUrl: baseUrl(),
      mode,
      configured: Boolean(username && token && authHeader),
      missing: missingConfiguration({ username, token, authHeader }),
      source: {
        name: input.name,
        mimeType: input.mimeType,
        bytes: input.base64 ? Buffer.from(input.base64, "base64").length : 0,
      },
      note:
        "Fusion fulfillment works from an existing personalization token. Public docs do not expose a raw bitmap upload/autodigitize endpoint.",
      request: {
        username: username || null,
        token: token ? redactToken(token) : null,
        mode,
        embFormat,
        vectorFormat,
        dpi,
        width,
        maxHeight,
        rotate,
        includeAllElements,
        recalculateStitches,
        fulfillmentId: fulfillmentId || null,
        fileName: requestedFileName || null,
        fabricStyle: fabricStyle || null,
      },
    };
    writeFileSync(join(runDir, "melco-request.json"), JSON.stringify(requestInfo, null, 2), "utf8");

    if (!username || !token || !authHeader) {
      throw httpError(
        400,
        "Melco Fusion non configurato: servono MELCO_FUSION_USERNAME, MELCO_FUSION_AUTH_HEADER e un personalization token."
      );
    }

    const headers = { Authorization: authHeader };
    const runFiles = [{ name: "melco-request.json", kind: "request" }];
    const files = [];

    if (mode === "definition") {
      const definition = await fetchJson(buildDefinitionUrl({ username, token, includeAllElements, recalculateStitches }), headers);
      writeFileSync(join(runDir, "melco-definition.json"), JSON.stringify(definition, null, 2), "utf8");
      runFiles.push({ name: "melco-definition.json", kind: "metadata" });
      ensureMelcoSuccess(definition);
      return result({ files, runFiles, designInfo: definition, requestInfo });
    }

    if (mode === "preview") {
      const id = requireFulfillmentId(fulfillmentId, mode);
      const preview = await fetchBinary(buildPreviewUrl({ username, token, fulfillmentId: id, width, maxHeight }), headers, "Melco preview");
      writeFileSync(join(runDir, "melco-preview.png"), preview.buffer);
      files.push({
        name: "melco-preview.png",
        mimeType: preview.contentType || "image/png",
        base64: preview.buffer.toString("base64"),
      });
      runFiles.push({ name: "melco-preview.png", kind: "preview" });
      return result({ files, runFiles, designInfo: null, requestInfo });
    }

    if (mode === "file") {
      const id = requireFulfillmentId(fulfillmentId, mode);
      const fileName = sanitizeFileName(requestedFileName || `melco-design.${embFormat}`);
      const file = await fetchBinary(
        buildFileUrl({ username, token, fulfillmentId: id, fileName, dpi, rotate, fabricStyle }),
        headers,
        "Melco fulfillment file"
      );
      writeFileSync(join(runDir, fileName), file.buffer);
      files.push({
        name: fileName,
        mimeType: file.contentType || inferMimeType(fileName),
        base64: file.buffer.toString("base64"),
      });
      runFiles.push({ name: fileName, kind: fileName.toLowerCase().endsWith(".png") ? "preview" : "design" });
      return result({ files, runFiles, designInfo: null, requestInfo });
    }

    const archive = await fetchBinary(
      buildArchiveUrl({
        username,
        token,
        embFormat,
        vectorFormat,
        dpi,
        rotate,
        includeAllElements,
        recalculateStitches,
        fabricStyle,
      }),
      headers,
      "Melco fulfillment archive"
    );
    writeFileSync(join(runDir, "melco-fulfillment.zip"), archive.buffer);
    files.push({
      name: "melco-fulfillment.zip",
      mimeType: archive.contentType || "application/zip",
      base64: archive.buffer.toString("base64"),
    });
    runFiles.push({ name: "melco-fulfillment.zip", kind: "design" });
    return result({ files, runFiles, designInfo: null, requestInfo });
  },
};

function buildDefinitionUrl({ username, token, includeAllElements, recalculateStitches }) {
  return fusionUrl(username, "TokenFulfillment/GetDefinition", {
    Token: token,
    Format: "json",
    IncludeAllElements: boolParam(includeAllElements),
    RecalculateStitches: boolParam(recalculateStitches),
  });
}

function buildArchiveUrl({
  username,
  token,
  embFormat,
  vectorFormat,
  dpi,
  rotate,
  includeAllElements,
  recalculateStitches,
  fabricStyle,
}) {
  return fusionUrl(username, "TokenFulfillment/GetArchive", {
    Token: token,
    EmbFormat: embFormat,
    VectorFormat: vectorFormat,
    DPI: String(dpi),
    IncludeAllElements: boolParam(includeAllElements),
    RecalculateStitches: boolParam(recalculateStitches),
    ...(rotate ? { RotAng: String(rotate) } : {}),
    ...(fabricStyle ? { FabricStyle: fabricStyle } : {}),
  });
}

function buildFileUrl({ username, token, fulfillmentId, fileName, dpi, rotate, fabricStyle }) {
  return fusionUrl(username, "TokenFulfillment/GetFile", {
    Token: token,
    FulfillmentID: fulfillmentId,
    FileName: fileName,
    DPI: String(dpi),
    ...(rotate ? { RotAng: String(rotate) } : {}),
    ...(fabricStyle ? { FabricStyle: fabricStyle } : {}),
  });
}

function buildPreviewUrl({ username, token, fulfillmentId, width, maxHeight }) {
  return fusionUrl(username, "TokenFulfillment/GetfulfillmentPreview", {
    Token: token,
    FulfillmentID: fulfillmentId,
    Width: String(width),
    ...(maxHeight !== undefined ? { MaxHeight: String(maxHeight) } : {}),
  });
}

function fusionUrl(username, path, params) {
  return `${baseUrl()}/${encodeURIComponent(username)}/${path}?${new URLSearchParams(params)}`;
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) {
    throw httpError(response.status, `Melco HTTP ${response.status}`, { responseBody: text });
  }

  try {
    return JSON.parse(text);
  } catch {
    throw httpError(502, "Melco ha restituito una risposta non JSON", { responseBody: text });
  }
}

async function fetchBinary(url, headers, label) {
  const response = await fetch(url, { headers });
  const contentType = response.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    throw httpError(response.status, `${label} HTTP ${response.status}`, {
      responseBody: buffer.toString("utf8"),
    });
  }

  if (contentType.includes("json") || contentType.includes("xml") || contentType.includes("text")) {
    const text = buffer.toString("utf8");
    if (/error|exception|failed|success["']?\s*:\s*["']?false/i.test(text)) {
      throw httpError(400, `${label} returned an error response`, { responseBody: text });
    }
  }

  return { buffer, contentType };
}

function ensureMelcoSuccess(body) {
  if (body?.success === false || body?.success === "false") {
    throw httpError(400, "Melco ha restituito un errore", {
      errorCode: body.error_code,
      errorMessage: body.error_message,
      responseBody: JSON.stringify(body),
    });
  }
}

function result({ files, runFiles, designInfo, requestInfo }) {
  return {
    provider: "melco",
    requestXml: JSON.stringify(requestInfo, null, 2),
    files,
    designInfo,
    runFiles,
  };
}

function missingConfiguration(values = {}) {
  const username = values.username ?? process.env.MELCO_FUSION_USERNAME;
  const token = values.token ?? process.env.MELCO_FUSION_TOKEN;
  const authHeader = values.authHeader ?? process.env.MELCO_FUSION_AUTH_HEADER;
  return [
    ["MELCO_FUSION_USERNAME", username],
    ["MELCO_FUSION_AUTH_HEADER", authHeader],
    ["MELCO_FUSION_TOKEN or options.melco.token", token],
  ]
    .filter(([, value]) => !normalizeOptionalText(value))
    .map(([key]) => key);
}

function enumParam(value, allowed, fallback, label) {
  if (value === "" || value === undefined || value === null) return fallback;
  const normalized = String(value).replace(/^\./, "").toLowerCase();
  if (!allowed.has(normalized)) {
    throw httpError(400, `${label} non valido: ${value}`);
  }
  return normalized;
}

function positiveIntegerOrDefault(value, fallback, label) {
  const number = value === "" || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw httpError(400, `${label} non valido`);
  }
  return number;
}

function optionalNonNegativeInteger(value, label) {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw httpError(400, `${label} non valido`);
  }
  return number;
}

function optionalRotation(value) {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 360) {
    throw httpError(400, "Melco rotation non valida");
  }
  return number;
}

function requireFulfillmentId(value, mode) {
  if (!value) {
    throw httpError(400, `Melco ${mode} richiede options.melco.fulfillmentId`);
  }
  return value;
}

function boolParam(value) {
  return value ? "true" : "false";
}

function baseUrl() {
  return (process.env.MELCO_FUSION_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function normalizeOptionalText(value) {
  if (value === "" || value === undefined || value === null) return "";
  return String(value).trim();
}

function redactToken(value) {
  const token = String(value);
  if (token.length <= 8) return "********";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function sanitizeFileName(name) {
  return String(name).replace(/[^0-9A-Za-z._ -]/g, "_");
}

function inferMimeType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}
