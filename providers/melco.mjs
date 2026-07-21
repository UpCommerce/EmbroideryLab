import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, extname, join, parse, resolve } from "node:path";
import sharp from "sharp";

const DEFAULT_BASE_URL = "https://apis.melcocloud.com";
const SUPPORTED_OUTPUT_FORMATS = new Set(["ofm", "exp", "dst"]);

export const melcoProvider = {
  id: "melco",
  describe() {
    const missing = missingConfiguration();
    return {
      id: "melco",
      name: "Melco Cloud",
      status: missing.length === 0 ? "ready" : "unavailable",
      configured: missing.length === 0,
      capabilities: {
        image: { supported: true, configured: missing.length === 0, missing },
        text: {
          supported: false,
          configured: false,
          missing: [],
          reason: "Melco Cloud standalone text lettering non e ancora esposto nel Lab: serve conferma endpoint backend senza Live Designer/Fusion UI.",
        },
      },
      modes: ["trueview", "design"],
      baseUrl: baseUrl(),
      missing,
      reason:
        missing.length === 0
          ? null
          : "Melco Cloud AutoDigitize richiede una MELCO_CLOUD_API_KEY o un Authorization header/token valido.",
    };
  },
  async convert(input, options, runDir, context = {}) {
    mkdirSync(runDir, { recursive: true });

    const mode = options.mode === "design" ? "design" : "trueview";
    const outputFormat =
      mode === "design"
        ? enumParam(
            options.designFormat ?? process.env.MELCO_CLOUD_OUTPUT_FORMAT,
            SUPPORTED_OUTPUT_FORMATS,
            "ofm",
            "Melco output format"
          )
        : undefined;
    const melcoOptions = options.melco ?? {};
    const preparedSource = await prepareMelcoSource(input, melcoOptions, runDir, context);
    const apiInput = preparedSource.input;
    const dimensions = melcoDimensionParams(options, melcoOptions);
    const requestInfo = {
      provider: "melco",
      api: "Melco Cloud AutoDigitize",
      baseUrl: baseUrl(),
      endpoints: {
        login: "/auth/apikey",
        metadata: "/design-editor/digitize/metadata",
        preview: "/design-editor/digitize/preview",
        download: "/design-editor/digitize/download",
      },
      mode,
      configured: missingConfiguration().length === 0,
      missing: missingConfiguration(),
      source: {
        name: input.name,
        mimeType: input.mimeType,
        bytes: preparedSource.original.bytes,
        width: preparedSource.original.width,
        height: preparedSource.original.height,
        format: preparedSource.original.format,
      },
      sentSource: {
        name: apiInput.name,
        mimeType: apiInput.mimeType,
        bytes: preparedSource.sent.bytes,
        width: preparedSource.sent.width,
        height: preparedSource.sent.height,
        format: preparedSource.sent.format,
      },
      preprocessing: preparedSource.preprocessing,
      request: {
        widthMm: dimensions.widthMm,
        heightMm: dimensions.heightMm,
        new_width: dimensions.newWidth,
        new_height: dimensions.newHeight,
        format: outputFormat ? outputFormat.toUpperCase() : undefined,
      },
      note:
        "Melco demo maps 1 inch to 254 units, so the Lab sends dimensions as mm * 10. Auth follows the demo: x-api-key plus optional Authorization 'melco {token}'.",
    };
    writeFileSync(join(runDir, "melco-request.json"), JSON.stringify(requestInfo, null, 2), "utf8");

    const missing = missingConfiguration();
    if (missing.length > 0) {
      throw httpError(400, `Melco Cloud non configurato: mancano ${missing.join(", ")}`);
    }

    const auth = await createAuthContext();
    const runFiles = [...preparedSource.runFiles, { name: "melco-request.json", kind: "request" }];
    const files = [];

    const metadata = await postAutoDigitizeJson(apiInput, "/design-editor/digitize/metadata", dimensions, auth);
    writeFileSync(join(runDir, "melco-metadata.json"), JSON.stringify(metadata, null, 2), "utf8");
    runFiles.push({ name: "melco-metadata.json", kind: "metadata" });

    const preview = await postAutoDigitizeBinary(apiInput, "/design-editor/digitize/preview", dimensions, auth, {}, "Melco preview");
    const previewName = fileNameFromResponse(preview, "melco-preview.png");
    writeFileSync(join(runDir, previewName), preview.buffer);
    files.push({
      name: previewName,
      mimeType: normalizeMimeType(preview.contentType, previewName),
      base64: preview.buffer.toString("base64"),
    });
    runFiles.push({ name: previewName, kind: "preview" });

    if (mode === "design") {
      const download = await postAutoDigitizeBinary(
        apiInput,
        "/design-editor/digitize/download",
        dimensions,
        auth,
        { format: outputFormat.toUpperCase() },
        "Melco design download"
      );
      const designName = fileNameFromResponse(download, `melco-design.${outputFormat}`);
      writeFileSync(join(runDir, designName), download.buffer);
      files.push({
        name: designName,
        mimeType: normalizeMimeType(download.contentType, designName),
        base64: download.buffer.toString("base64"),
      });
      runFiles.push({ name: designName, kind: "design" });
    }

    return {
      provider: "melco",
      requestXml: JSON.stringify(requestInfo, null, 2),
      files,
      designInfo: metadata,
      runFiles,
    };
  },
  async convertText() {
    throw httpError(400, "Melco text non disponibile: serve endpoint backend per lettering standalone senza Live Designer/Fusion UI.");
  },
};

async function createAuthContext() {
  const apiKey = normalizeOptionalText(process.env.MELCO_CLOUD_API_KEY);
  const explicitHeader = normalizeOptionalText(process.env.MELCO_CLOUD_AUTH_HEADER);
  const explicitToken = normalizeOptionalText(process.env.MELCO_CLOUD_AUTH_TOKEN);

  if (explicitHeader) return { apiKey, authorization: explicitHeader };
  if (explicitToken) return { apiKey, authorization: normalizeAuthorizationToken(explicitToken) };
  if (!apiKey) return { apiKey: "", authorization: "" };

  const response = await fetch(apiUrl("/auth/apikey"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      api_key: apiKey,
      device_info: {
        name: process.env.MELCO_CLOUD_DEVICE_NAME || "Embroidery Lab",
      },
    }),
  });
  const text = await response.text();

  if (!response.ok) {
    throw httpError(response.status, `Melco auth HTTP ${response.status}`, { responseBody: text });
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw httpError(502, "Melco auth ha restituito una risposta non JSON", { responseBody: text });
  }

  if (!body.token) {
    throw httpError(502, "Melco auth non ha restituito token", { responseBody: text });
  }

  return { apiKey, authorization: `melco ${body.token}` };
}

async function postAutoDigitizeJson(input, path, dimensions, auth) {
  const response = await postAutoDigitize(input, path, dimensions, auth);
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

async function postAutoDigitizeBinary(input, path, dimensions, auth, extraParams, label) {
  const response = await postAutoDigitize(input, path, dimensions, auth, extraParams);
  const contentType = response.headers.get("content-type") ?? "";
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const xFilename = response.headers.get("x-filename") ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    throw httpError(response.status, `${label} HTTP ${response.status}`, {
      responseBody: buffer.toString("utf8"),
    });
  }

  if (isTextLikeContent(contentType)) {
    throw httpError(502, `${label} ha restituito testo invece di un file binario`, {
      responseBody: buffer.toString("utf8"),
    });
  }

  return { buffer, contentType, contentDisposition, xFilename };
}

function postAutoDigitize(input, path, dimensions, auth, extraParams = {}) {
  const form = new FormData();
  const bytes = Buffer.from(input.base64, "base64");
  const fileName = sanitizeFileName(input.name || "design.png");
  form.append("image_file", new Blob([bytes], { type: input.mimeType || "application/octet-stream" }), fileName);

  return fetch(apiUrl(path, { ...dimensions.query, ...extraParams }), {
    method: "POST",
    headers: authHeaders(auth),
    body: form,
  });
}

async function prepareMelcoSource(input, melcoOptions, runDir, context = {}) {
  const originalBuffer = Buffer.from(input.base64, "base64");
  const originalInputName = basename(String(input.name || "design.png"));
  const originalName = sanitizeFileName(originalInputName);
  const originalMimeType = input.mimeType || inferMimeType(originalName);
  const originalMetadata = await readImageMetadata(originalBuffer, "Melco source image");
  const maxSourceSidePx = maxSourceSidePxOption(melcoOptions);
  const original = sourceSummary({
    name: originalName,
    mimeType: originalMimeType,
    buffer: originalBuffer,
    metadata: originalMetadata,
  });

  const originalExtension = extensionFromMimeOrName(originalMimeType, originalName);

  let sentBuffer = originalBuffer;
  let sentName = originalName;
  let sentMimeType = originalMimeType;
  let sentMetadata = originalMetadata;
  let sentFileName = `melco-source-sent.${originalExtension}`;
  let resized = false;
  let originalArchive = null;
  let sampleReplacement = null;

  const longestSide = Math.max(originalMetadata.width ?? 0, originalMetadata.height ?? 0);
  if (maxSourceSidePx && longestSide > maxSourceSidePx) {
    const output = resizedOutputFormat(originalMimeType, originalMetadata);
    const pipeline = sharp(originalBuffer, { failOn: "none", limitInputPixels: false })
      .rotate()
      .resize({
        width: maxSourceSidePx,
        height: maxSourceSidePx,
        fit: "inside",
        withoutEnlargement: true,
      });

    sentBuffer =
      output.format === "jpeg"
        ? await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
        : await pipeline.png({ compressionLevel: 9 }).toBuffer();
    sentMetadata = await readImageMetadata(sentBuffer, "Melco resized source image");
    sentMimeType = output.mimeType;
    sentFileName = `melco-source-sent.${output.extension}`;
    sentName = sentFileName;
    resized = true;
    const archiveResult = archiveOriginalSource({
      context,
      originalInputName,
      originalBuffer,
      sentBuffer,
      sentMimeType,
    });
    originalArchive = archiveResult.originalArchive;
    sampleReplacement = archiveResult.sampleReplacement;
  }

  writeFileSync(join(runDir, sentFileName), sentBuffer);

  const sent = sourceSummary({
    name: sentName,
    mimeType: sentMimeType,
    buffer: sentBuffer,
    metadata: sentMetadata,
  });
  const preprocessing = {
    maxSourceSidePx,
    resized,
    longestSideBefore: longestSide || undefined,
    longestSideAfter: Math.max(sent.width ?? 0, sent.height ?? 0) || undefined,
    originalArchive,
    sampleReplacement,
  };
  const manifest = {
    original,
    sent,
    preprocessing,
  };
  writeFileSync(join(runDir, "melco-source.json"), JSON.stringify(manifest, null, 2), "utf8");

  return {
    input: {
      name: sentName,
      mimeType: sentMimeType,
      base64: sentBuffer.toString("base64"),
    },
    original,
    sent,
    preprocessing,
    runFiles: [
      { name: sentFileName, kind: "source-sent" },
      { name: "melco-source.json", kind: "source-info" },
    ],
  };
}

function archiveOriginalSource({ context, originalInputName, originalBuffer, sentBuffer, sentMimeType }) {
  const sourceOriginalsDir = context.sourceOriginalsDir;
  if (!sourceOriginalsDir) {
    return {
      originalArchive: { stored: false, reason: "sourceOriginalsDir not configured" },
      sampleReplacement: { replaced: false, reason: "sourceOriginalsDir not configured" },
    };
  }

  const samplePath = samplePathForName(context.samplesDir, originalInputName);
  if (samplePath && existsSync(samplePath)) {
    const sampleBuffer = readFileSync(samplePath);
    if (sampleBuffer.equals(originalBuffer)) {
      const archiveDir = join(sourceOriginalsDir, "samples");
      mkdirSync(archiveDir, { recursive: true });
      const archivePath = uniquePath(archiveDir, originalInputName);
      renameSync(samplePath, archivePath);

      const replacementPath = replacementSamplePath(samplePath, sentMimeType);
      writeFileSync(replacementPath, sentBuffer);

      return {
        originalArchive: {
          stored: true,
          kind: "sample",
          path: archivePath,
        },
        sampleReplacement: {
          replaced: true,
          path: replacementPath,
        },
      };
    }
  }

  const archiveDir = join(sourceOriginalsDir, "uploads");
  mkdirSync(archiveDir, { recursive: true });
  const archivePath = uniquePath(archiveDir, originalInputName);
  writeFileSync(archivePath, originalBuffer);

  return {
    originalArchive: {
      stored: true,
      kind: "upload",
      path: archivePath,
    },
    sampleReplacement: {
      replaced: false,
      reason: samplePath ? "uploaded bytes did not match sample file" : "not a sample library image",
    },
  };
}

function samplePathForName(samplesDir, name) {
  if (!samplesDir) return null;
  return resolve(samplesDir, basename(String(name || "")));
}

function replacementSamplePath(samplePath, sentMimeType) {
  const currentExtension = extname(samplePath).replace(/^\./, "").toLowerCase();
  const sentExtension = extensionFromMimeOrName(sentMimeType, `source.${currentExtension || "png"}`);
  if (extensionsCompatible(currentExtension, sentExtension)) return samplePath;

  const parsed = parse(samplePath);
  return join(parsed.dir, `${parsed.name}.${sentExtension}`);
}

function extensionsCompatible(currentExtension, sentExtension) {
  if (currentExtension === sentExtension) return true;
  return currentExtension === "jpeg" && sentExtension === "jpg";
}

function uniquePath(dir, originalName) {
  const parsed = parse(sanitizeFileName(basename(String(originalName || "source"))));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const extension = parsed.ext || ".bin";
  const base = parsed.name || "source";
  let candidate = join(dir, `${stamp}-${base}${extension}`);
  let index = 1;
  while (existsSync(candidate)) {
    candidate = join(dir, `${stamp}-${base}-${index}${extension}`);
    index += 1;
  }
  return candidate;
}

async function readImageMetadata(buffer, label) {
  try {
    return await sharp(buffer, { failOn: "none", limitInputPixels: false }).metadata();
  } catch (error) {
    throw httpError(400, `${label} non leggibile: ${error.message}`);
  }
}

function sourceSummary({ name, mimeType, buffer, metadata }) {
  return {
    name,
    mimeType,
    bytes: buffer.length,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    hasAlpha: metadata.hasAlpha,
  };
}

function maxSourceSidePxOption(melcoOptions) {
  const value = melcoOptions.maxSourceSidePx ?? process.env.MELCO_MAX_SOURCE_SIDE_PX;
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw httpError(400, "Melco max source side px non valido");
  }
  return number === 0 ? undefined : number;
}

function resizedOutputFormat(mimeType, metadata) {
  const lower = String(mimeType || "").toLowerCase();
  if ((lower.includes("jpeg") || lower.includes("jpg")) && !metadata.hasAlpha) {
    return { format: "jpeg", extension: "jpg", mimeType: "image/jpeg" };
  }
  return { format: "png", extension: "png", mimeType: "image/png" };
}

function extensionFromMimeOrName(mimeType, fileName) {
  const lowerName = String(fileName || "").toLowerCase();
  const extension = lowerName.match(/\.([a-z0-9]+)$/)?.[1];
  if (extension) return extension === "jpeg" ? "jpg" : extension;

  const lowerMime = String(mimeType || "").toLowerCase();
  if (lowerMime.includes("jpeg") || lowerMime.includes("jpg")) return "jpg";
  if (lowerMime.includes("png")) return "png";
  if (lowerMime.includes("gif")) return "gif";
  if (lowerMime.includes("tiff")) return "tif";
  return "bin";
}

function melcoDimensionParams(options, melcoOptions) {
  if (melcoOptions.useDefaultSize) {
    return { widthMm: undefined, heightMm: undefined, newWidth: undefined, newHeight: undefined, query: {} };
  }

  const widthMm = optionalPositiveNumber(options.widthMm, "Width mm");
  const heightMm = optionalPositiveNumber(options.heightMm, "Height mm");
  const newWidth = widthMm ? Math.round(widthMm * 10) : undefined;
  const newHeight = heightMm ? Math.round(heightMm * 10) : undefined;
  const query = {
    ...(newWidth ? { new_width: String(newWidth) } : {}),
    ...(newHeight ? { new_height: String(newHeight) } : {}),
  };
  return { widthMm, heightMm, newWidth, newHeight, query };
}

function authHeaders(auth) {
  const headers = {};
  if (auth.apiKey) headers["x-api-key"] = auth.apiKey;
  if (auth.authorization) headers.Authorization = auth.authorization;
  return headers;
}

function apiUrl(path, params = {}) {
  const url = new URL(`${baseUrl()}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }
  return url;
}

function missingConfiguration() {
  const apiKey = normalizeOptionalText(process.env.MELCO_CLOUD_API_KEY);
  const authHeader = normalizeOptionalText(process.env.MELCO_CLOUD_AUTH_HEADER);
  const authToken = normalizeOptionalText(process.env.MELCO_CLOUD_AUTH_TOKEN);
  return apiKey || authHeader || authToken ? [] : ["MELCO_CLOUD_API_KEY or MELCO_CLOUD_AUTH_HEADER/MELCO_CLOUD_AUTH_TOKEN"];
}

function enumParam(value, allowed, fallback, label) {
  if (value === "" || value === undefined || value === null) return fallback;
  const normalized = String(value).replace(/^\./, "").toLowerCase();
  if (!allowed.has(normalized)) {
    throw httpError(400, `${label} non valido: ${value}`);
  }
  return normalized;
}

function optionalPositiveNumber(value, label) {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw httpError(400, `${label} non valido`);
  }
  return number;
}

function baseUrl() {
  return (process.env.MELCO_CLOUD_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function normalizeAuthorizationToken(value) {
  return /^(melco|bearer)\s+/i.test(value) ? value : `melco ${value}`;
}

function normalizeOptionalText(value) {
  if (value === "" || value === undefined || value === null) return "";
  return String(value).trim();
}

function sanitizeFileName(name) {
  return String(name).replace(/[^0-9A-Za-z._ -]/g, "_");
}

function fileNameFromResponse(response, fallback) {
  return sanitizeFileName(response.xFilename || contentDispositionFileName(response.contentDisposition) || fallback);
}

function contentDispositionFileName(value) {
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded.replace(/"/g, ""));

  const plain = value.match(/filename="?([^";]+)"?/i)?.[1];
  return plain || "";
}

function isTextLikeContent(contentType) {
  return /json|xml|text|html/i.test(contentType);
}

function normalizeMimeType(contentType, fileName) {
  const lowerType = String(contentType || "").toLowerCase();
  if (lowerType.includes("png")) return "image/png";
  if (lowerType.includes("jpeg") || lowerType.includes("jpg")) return "image/jpeg";
  if (lowerType.includes("zip")) return "application/zip";
  return inferMimeType(fileName);
}

function inferMimeType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}
