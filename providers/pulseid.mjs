import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_BASE_URL = "https://webapi.pulseidconnect.com";
const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  "bmp",
  "jpg",
  "jpeg",
  "tif",
  "tiff",
  "pcx",
  "mac",
  "pcd",
  "tga",
  "png",
  "cdr",
  "cmx",
  "emf",
  "wmf",
  "eps",
  "ai",
]);
const SUPPORTED_GENERATE_FORMATS = new Set(["pxf", "dst", "tcf", "pes", "z00", "pcf"]);
const THREAD_TYPES = new Set(["ttMetallic", "ttRayon", "ttCotton", "ttNylon", "ttPolyester"]);
const SEQUENCE_TYPES = new Set(["stNone", "stMinimizeColorChanges", "stMinimizeJumps", "stSmart"]);
const TRIM_TYPES = new Set(["ttNever", "ttAlways", "ttTrimAt"]);
const LOCK_TYPES = new Set(["ltNever", "ltAlways", "ltAroundTrim"]);

export const pulseIdProvider = {
  id: "pulse",
  describe() {
    return {
      id: "pulse",
      name: "PulseID",
      status: "ready",
      configured: true,
      modes: ["trueview", "design"],
      baseUrl: process.env.PULSEID_BASE_URL ?? DEFAULT_BASE_URL,
    };
  },
  async convert(input, options, runDir) {
    mkdirSync(runDir, { recursive: true });

    const extension = getExtension(input.name);
    if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
      throw httpError(400, `Formato immagine non supportato da PulseID: .${extension}`);
    }

    const mode = options.mode === "design" ? "design" : "trueview";
    const pulseOptions = options.pulse ?? {};
    const designFormat = normalizeDesignFormat(options.designFormat ?? "dst");
    const widthPoints = mmToEmbroideryPoints(options.widthMm);
    const heightPoints = mmToEmbroideryPoints(options.heightMm);
    const renderWidthPx = positiveIntegerOrDefault(pulseOptions.renderWidth, 1100, "Render width");
    const renderHeightPx = positiveIntegerOrDefault(pulseOptions.renderHeight, 1600, "Render height");
    const renderPadding = positiveIntegerOrDefault(pulseOptions.renderPadding, 40, "Render padding", true);
    const uploadName = `${Date.now()}-${sanitizeRemoteFileName(input.name || `design.${extension}`)}`;
    const baseUrl = (process.env.PULSEID_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const sourceBuffer = Buffer.from(input.base64, "base64");
    const autodigitizeParams = buildAutodigitizeParams({
      widthPoints,
      heightPoints,
      pulseOptions,
    });
    const recipe = normalizeOptionalText(pulseOptions.recipe);

    const uploadUrl = `${baseUrl}/1/Upload/Designs/${encodePath(uploadName)}?Format=json`;
    const renderUrl = `${baseUrl}/1/Render/Autodigitize/${encodePath(uploadName)}?${new URLSearchParams({
      ...autodigitizeParams,
      Format: "png",
      Background: pulseOptions.transparentPreview === false ? "ffffffff" : "00000000",
      ImageWidth: String(renderWidthPx),
      ImageHeight: String(renderHeightPx),
      Padding: String(renderPadding),
      LightenShadows: boolParam(pulseOptions.lightenShadows, false),
      ...(recipe ? { Recipe: recipe } : {}),
    })}`;
    const generateUrl = `${baseUrl}/1/Generate/Autodigitize/${encodePath(uploadName)}?${new URLSearchParams({
      ...autodigitizeParams,
      Format: designFormat.toUpperCase(),
      Filename: `design.${designFormat}`,
      ...(recipe ? { Recipe: recipe } : {}),
    })}`;

    const requestInfo = {
      provider: "pulse",
      mode,
      uploadUrl,
      renderUrl,
      generateUrl: mode === "design" ? generateUrl : null,
      autodigitizeParams,
      source: {
        name: input.name,
        mimeType: input.mimeType,
        bytes: sourceBuffer.length,
      },
    };
    writeFileSync(join(runDir, "pulseid-request.json"), JSON.stringify(requestInfo, null, 2), "utf8");

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": input.mimeType || "application/octet-stream",
      },
      body: sourceBuffer,
    });
    const uploadBody = await uploadResponse.text();
    writeFileSync(join(runDir, "pulseid-upload-response.txt"), uploadBody, "utf8");

    if (!uploadResponse.ok) {
      throw httpError(uploadResponse.status, `PulseID upload HTTP ${uploadResponse.status}`, {
        responseBody: uploadBody,
      });
    }

    const files = [];
    const runFiles = [
      { name: "pulseid-request.json", kind: "request" },
      { name: "pulseid-upload-response.txt", kind: "response" },
    ];

    const preview = await fetchBinary(renderUrl, "PulseID render");
    writeFileSync(join(runDir, "pulseid-preview.png"), preview.buffer);
    files.push({
      name: "pulseid-preview.png",
      mimeType: preview.contentType || "image/png",
      base64: preview.buffer.toString("base64"),
    });
    runFiles.push({ name: "pulseid-preview.png", kind: "preview" });

    if (mode === "design") {
      const design = await fetchBinary(generateUrl, "PulseID generate");
      const fileName = `pulseid-design.${designFormat}`;
      writeFileSync(join(runDir, fileName), design.buffer);
      files.push({
        name: fileName,
        mimeType: design.contentType || "application/octet-stream",
        base64: design.buffer.toString("base64"),
      });
      runFiles.push({ name: fileName, kind: "design" });
    }

    return {
      provider: "pulse",
      requestXml: JSON.stringify(requestInfo, null, 2),
      files,
      designInfo: null,
      runFiles,
    };
  },
};

function buildAutodigitizeParams({ widthPoints, heightPoints, pulseOptions }) {
  const numColors = optionalPositiveInteger(pulseOptions.numColors, "Num colors");
  const params = {
    GenerateBackground: boolParam(pulseOptions.generateBackground, false),
    StitchInnerBackground: "False",
    IgnoreSmallAreas: boolParam(pulseOptions.ignoreSmallAreas, true),
    UseImageDimensions: boolParam(pulseOptions.useImageDimensions, false),
    CreateSatinAndSteil: boolParam(pulseOptions.createSatinAndSteil, true),
    CenterResult: "True",
    AddSteilBorders: boolParam(pulseOptions.addSteilBorders, false),
    ThreadType: enumParam(pulseOptions.threadType, THREAD_TYPES, "ttPolyester", "Thread type"),
    SequenceType: enumParam(
      pulseOptions.sequenceType,
      SEQUENCE_TYPES,
      "stMinimizeColorChanges",
      "Sequence type"
    ),
    TrimType: enumParam(pulseOptions.trimType, TRIM_TYPES, "ttAlways", "Trim type"),
    LockType: enumParam(pulseOptions.lockType, LOCK_TYPES, "ltAroundTrim", "Lock type"),
    ProportionalResize: boolParam(pulseOptions.proportionalResize, true),
    TimeoutSeconds: "60",
  };

  if (widthPoints) params.FinalWidth = String(widthPoints);
  if (heightPoints) params.FinalHeight = String(heightPoints);
  assignOptionalNumber(params, "ThreadThickness", pulseOptions.threadThickness, "Thread thickness");
  assignOptionalNumber(params, "MaximumRunWidth", pulseOptions.maximumRunWidth, "Run max width");
  assignOptionalNumber(params, "MaximumSatinWidth", pulseOptions.maximumSatinWidth, "Satin max width");
  assignOptionalNumber(params, "MaximumSteilWidth", pulseOptions.maximumSteilWidth, "Steil max width");
  assignOptionalNumber(params, "TrimThreshold", pulseOptions.trimThreshold, "Trim threshold", true);
  if (numColors) params.NumColors = String(numColors);

  return params;
}

async function fetchBinary(url, label) {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    throw httpError(response.status, `${label} HTTP ${response.status}`, {
      responseBody: buffer.toString("utf8"),
    });
  }

  if (contentType.includes("text") || contentType.includes("json") || contentType.includes("xml")) {
    const text = buffer.toString("utf8");
    if (/error|exception|failed/i.test(text)) {
      throw httpError(400, `${label} returned text response`, { responseBody: text });
    }
  }

  return { buffer, contentType };
}

function mmToEmbroideryPoints(value) {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw httpError(400, "Dimensioni ricamo non valide");
  }
  return Math.round(number * 10);
}

function boolParam(value, fallback) {
  return value === undefined ? boolToPulse(fallback) : boolToPulse(Boolean(value));
}

function boolToPulse(value) {
  return value ? "True" : "False";
}

function enumParam(value, allowed, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
  if (!allowed.has(value)) {
    throw httpError(400, `${label} non valido: ${value}`);
  }
  return value;
}

function assignOptionalNumber(target, key, value, label, allowZero = false) {
  const number = optionalPositiveNumber(value, label, allowZero);
  if (number !== undefined) target[key] = String(number);
}

function optionalPositiveNumber(value, label, allowZero = false) {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  const isValid = Number.isFinite(number) && (allowZero ? number >= 0 : number > 0);
  if (!isValid) {
    throw httpError(400, `${label} non valido`);
  }
  return number;
}

function optionalPositiveInteger(value, label) {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw httpError(400, `${label} non valido`);
  }
  return number;
}

function positiveIntegerOrDefault(value, fallback, label, allowZero = false) {
  const number = value === "" || value === undefined || value === null ? fallback : Number(value);
  const isValid = Number.isInteger(number) && (allowZero ? number >= 0 : number > 0);
  if (!isValid) {
    throw httpError(400, `${label} non valido`);
  }
  return number;
}

function normalizeOptionalText(value) {
  if (value === "" || value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeDesignFormat(value) {
  const normalized = String(value).replace(/^\./, "").toLowerCase();
  if (!SUPPORTED_GENERATE_FORMATS.has(normalized)) {
    throw httpError(400, `Formato PulseID non supportato: ${value}`);
  }
  return normalized;
}

function getExtension(fileName) {
  const match = String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function sanitizeFileName(name) {
  return String(name).replace(/[^0-9A-Za-z._ -]/g, "_");
}

function sanitizeRemoteFileName(name) {
  const cleaned = String(name)
    .replace(/\s+/g, "-")
    .replace(/[^0-9A-Za-z._-]/g, "_")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  return cleaned || "design.png";
}

function encodePath(path) {
  return String(path)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}
