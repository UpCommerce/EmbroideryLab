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
      capabilities: {
        image: { supported: true, configured: true },
        text: { supported: true, configured: true },
      },
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
    const runType = normalizeRunType(pulseOptions.runType);
    const designFormat = normalizeDesignFormat(options.designFormat ?? "dst");
    const widthPoints = mmToEmbroideryPoints(options.widthMm);
    const heightPoints = mmToEmbroideryPoints(options.heightMm);
    const renderWidthPx = positiveIntegerOrDefault(pulseOptions.renderWidth, 1100, "Render width");
    const renderHeightPx = positiveIntegerOrDefault(pulseOptions.renderHeight, 1600, "Render height");
    const renderPadding = positiveIntegerOrDefault(pulseOptions.renderPadding, 40, "Render padding", true);
    const timeoutSeconds = positiveIntegerOrDefault(
      pulseOptions.timeoutSeconds,
      runType === "full" ? 60 : 20,
      "Timeout seconds"
    );
    const uploadName = `${Date.now()}-${sanitizeRemoteFileName(input.name || `design.${extension}`)}`;
    const baseUrl = (process.env.PULSEID_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const sourceBuffer = Buffer.from(input.base64, "base64");
    const autodigitizeParams = buildAutodigitizeParams({
      widthPoints,
      heightPoints,
      pulseOptions,
      timeoutSeconds,
    });
    const recipe = normalizeOptionalText(pulseOptions.recipe);

    const uploadUrl = `${baseUrl}/1/Upload/Designs/${encodePath(uploadName)}?Format=json`;
    const infoUrl = `${baseUrl}/1/GetInfo/Autodigitize/${encodePath(uploadName)}?${new URLSearchParams({
      ...autodigitizeParams,
      Format: "json",
      ...(recipe ? { Recipe: recipe } : {}),
    })}`;
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
      runType,
      uploadUrl,
      infoUrl,
      renderUrl,
      generateUrl: mode === "design" && runType === "full" ? generateUrl : null,
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
    let designInfo = null;

    const info = await fetchText(infoUrl, "PulseID get info");
    writeFileSync(join(runDir, "pulseid-getinfo-response.json"), info.text, "utf8");
    runFiles.push({ name: "pulseid-getinfo-response.json", kind: "response" });
    designInfo = parsePulseInfo(info.text);

    if (runType !== "infoOnly") {
      const preview = await fetchBinary(renderUrl, "PulseID render");
      writeFileSync(join(runDir, "pulseid-preview.png"), preview.buffer);
      files.push({
        name: "pulseid-preview.png",
        mimeType: preview.contentType || "image/png",
        base64: preview.buffer.toString("base64"),
      });
      runFiles.push({ name: "pulseid-preview.png", kind: "preview" });
    }

    if (mode === "design" && runType === "full") {
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
      designInfo,
      runFiles,
    };
  },
  async convertText(source, options, runDir) {
    mkdirSync(runDir, { recursive: true });

    const mode = options.mode === "design" ? "design" : "trueview";
    const textOptions = options.text ?? {};
    const pulseOptions = options.pulseText ?? {};
    const designFormat = normalizeDesignFormat(options.designFormat ?? "dst");
    const renderWidthPx = positiveIntegerOrDefault(pulseOptions.renderWidth, 900, "Render width");
    const renderHeightPx = positiveIntegerOrDefault(pulseOptions.renderHeight, 420, "Render height");
    const renderPadding = positiveIntegerOrDefault(pulseOptions.renderPadding, 30, "Render padding", true);
    const baseUrl = (process.env.PULSEID_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const letteringParams = buildLetteringParams({ source, textOptions, pulseOptions });
    const renderParams = new URLSearchParams({
      ...letteringParams,
      Format: "png",
      Background: pulseOptions.transparentPreview === false ? "ffffffff" : "00000000",
      ImageWidth: String(renderWidthPx),
      ImageHeight: String(renderHeightPx),
      Padding: String(renderPadding),
      LightenShadows: boolParam(pulseOptions.lightenShadows, false),
    });
    const infoParams = new URLSearchParams({ ...letteringParams, Format: "json" });
    const generateParams = new URLSearchParams({
      ...letteringParams,
      Format: designFormat.toUpperCase(),
      Filename: `text-design.${designFormat}`,
    });
    const infoUrl = `${baseUrl}/1/GetInfo/Lettering?${infoParams}`;
    const renderUrl = `${baseUrl}/1/Render/Lettering?${renderParams}`;
    const generateUrl = `${baseUrl}/1/Generate/Lettering?${generateParams}`;
    const sourceInfo = textSourceInfo(source);
    const requestInfo = {
      provider: "pulse",
      sourceType: "text",
      mode,
      infoUrl,
      renderUrl,
      generateUrl: mode === "design" ? generateUrl : null,
      letteringParams,
      source: sourceInfo,
    };

    writeFileSync(join(runDir, "text-source.json"), JSON.stringify(sourceInfo, null, 2), "utf8");
    writeFileSync(join(runDir, "pulseid-text-request.json"), JSON.stringify(requestInfo, null, 2), "utf8");

    const runFiles = [
      { name: "text-source.json", kind: "source-info" },
      { name: "pulseid-text-request.json", kind: "request" },
    ];
    const files = [];

    const info = await fetchText(infoUrl, "PulseID lettering get info");
    writeFileSync(join(runDir, "pulseid-text-getinfo-response.json"), info.text, "utf8");
    runFiles.push({ name: "pulseid-text-getinfo-response.json", kind: "response" });
    let designInfo = parsePulseInfo(info.text);

    const preview = await fetchBinary(renderUrl, "PulseID lettering render");
    writeFileSync(join(runDir, "pulseid-text-preview.png"), preview.buffer);
    files.push({
      name: "pulseid-text-preview.png",
      mimeType: preview.contentType || "image/png",
      base64: preview.buffer.toString("base64"),
    });
    runFiles.push({ name: "pulseid-text-preview.png", kind: "preview" });

    if (mode === "design") {
      const design = await fetchBinary(generateUrl, "PulseID lettering generate");
      const fileName = `pulseid-text-design.${designFormat}`;
      writeFileSync(join(runDir, fileName), design.buffer);
      files.push({
        name: fileName,
        mimeType: design.contentType || "application/octet-stream",
        base64: design.buffer.toString("base64"),
      });
      runFiles.push({ name: fileName, kind: "design" });
    }

    designInfo = designInfo
      ? { ...designInfo, source_type: "text", text: source.text, font: letteringParams.Font }
      : { source_type: "text", text: source.text, font: letteringParams.Font };

    return {
      provider: "pulse",
      requestXml: JSON.stringify(requestInfo, null, 2),
      files,
      designInfo,
      runFiles,
    };
  },
};

function buildAutodigitizeParams({ widthPoints, heightPoints, pulseOptions, timeoutSeconds }) {
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
    TimeoutSeconds: String(timeoutSeconds),
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

function buildLetteringParams({ source, textOptions, pulseOptions }) {
  const type = enumParam(
    pulseOptions.type,
    new Set(["ltNormal", "ltMonogram", "ltArc", "ltCircle"]),
    "ltNormal",
    "Lettering type"
  );
  const params = {
    Type: type,
    Text: source.text,
    Font: normalizeOptionalText(pulseOptions.font) || "Block New",
    Height: String(mmToEmbroideryPoints(textOptions.heightMm ?? pulseOptions.heightMm ?? 12)),
    WidthCompression: String(optionalPositiveNumber(pulseOptions.widthCompression, "Width compression") ?? 100),
    Justification: enumParam(
      pulseOptions.justification,
      new Set(["jtCenter", "jtLeft", "jtRight", "jtFillBox", "jtFitToCurve"]),
      "jtCenter",
      "Justification"
    ),
    Envelope: enumParam(
      pulseOptions.envelope,
      new Set([
        "etRectangle",
        "etBridgeConcaveTop",
        "etBridgeConcaveBottom",
        "etDoubleConcaveBridges",
        "etBridgeConvexTop",
        "etBridgeConvexBottom",
        "etDoubleConvexBridges",
        "etConcaveTopConvexBottom",
        "etConvexTopConcaveBottom",
        "etPennantRight",
        "etPennantLeft",
      ]),
      "etRectangle",
      "Envelope"
    ),
    Needle: String(optionalPositiveInteger(pulseOptions.needle, "Needle", true) ?? 0),
    Recipe: normalizeOptionalText(pulseOptions.recipe) || "Normal",
    MachineFormat: normalizeOptionalText(pulseOptions.machineFormat) || "Tajima",
    RemoveUnusedNeedles: boolParam(pulseOptions.removeUnusedNeedles, true),
  };

  const threadColor = normalizeHexColor(textOptions.threadColor ?? pulseOptions.threadColor ?? "#0073cf");
  if (threadColor) params["Palette[0]"] = threadColor.slice(1);

  if (pulseOptions.isRainbowText) {
    params.IsRainbowText = "True";
    const rainbowColors = parseColorList(pulseOptions.rainbowColors);
    rainbowColors.forEach((color, index) => {
      params[`RainbowColors[${index}].Name`] = `Color ${index + 1}`;
      params[`RainbowColors[${index}].Code`] = String(index + 1);
      params[`RainbowColors[${index}].Hex`] = color.slice(1);
    });
  }

  if (type === "ltArc") {
    assignOptionalNumber(params, "X1", pulseOptions.x1, "Arc X1", true);
    assignOptionalNumber(params, "Y1", pulseOptions.y1, "Arc Y1", true);
    assignOptionalNumber(params, "X2", pulseOptions.x2, "Arc X2", true);
    assignOptionalNumber(params, "Y2", pulseOptions.y2, "Arc Y2", true);
    assignOptionalNumber(params, "X3", pulseOptions.x3, "Arc X3", true);
    assignOptionalNumber(params, "Y3", pulseOptions.y3, "Arc Y3", true);
  }

  if (type === "ltCircle") {
    const bottomText = normalizeOptionalText(pulseOptions.bottomText);
    if (bottomText) params.BottomText = bottomText;
    assignOptionalNumber(params, "CenterX", pulseOptions.centerX, "Circle CenterX", true);
    assignOptionalNumber(params, "CenterY", pulseOptions.centerY, "Circle CenterY", true);
    assignOptionalNumber(params, "RefX", pulseOptions.refX, "Circle RefX", true);
    assignOptionalNumber(params, "RefY", pulseOptions.refY, "Circle RefY", true);
  }

  if (type === "ltMonogram") {
    const decoration = normalizeOptionalText(pulseOptions.decoration);
    if (decoration) params.Decoration = decoration;
  }

  return params;
}

async function fetchText(url, label) {
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    throw httpError(response.status, `${label} HTTP ${response.status}`, {
      responseBody: text,
    });
  }

  if (/error|exception|failed/i.test(text)) {
    throw httpError(400, `${label} returned error response`, { responseBody: text });
  }

  return { text, contentType: response.headers.get("content-type") ?? "" };
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

function parsePulseInfo(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const info = parsed?.Info;
  if (!info || typeof info !== "object") return null;
  const palette = Array.isArray(info.Palette) ? info.Palette : [];
  const stops = Array.isArray(info.Stops) ? info.Stops : [];

  return {
    width: info.Width,
    height: info.Height,
    unit: "embroidery points",
    num_stitches: info.NumStitches,
    num_trims: info.NumTrims,
    num_colours: palette.length,
    recipe: info.Recipe,
    machine_format: info.MachineFormat,
    master_density: info.MasterDensity,
    palette,
    stops,
  };
}

function normalizeRunType(value) {
  if (value === "quick" || value === "infoOnly") return value;
  return "full";
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

function optionalPositiveInteger(value, label, allowZero = false) {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || (allowZero ? number < 0 : number <= 0)) {
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

function parseColorList(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return list.map(normalizeHexColor).filter(Boolean);
}

function normalizeHexColor(value) {
  const text = String(value || "").trim();
  const match = text.match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toUpperCase()}` : "";
}

function textSourceInfo(source) {
  return {
    name: source.name,
    text: source.text,
    chars: source.text.length,
    lines: source.text.split(/\r?\n/).length,
  };
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
