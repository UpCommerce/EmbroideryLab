import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const DEFAULT_BASE_URL = "https://public.ewa.wilcomapps.com";
const SUPPORTED_BITMAP_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "bmp",
  "png",
  "gif",
  "psd",
  "tif",
  "tiff",
]);
const SUPPORTED_VECTOR_EXTENSIONS = new Set(["pdf", "eps"]);
const MAX_ARTWORK_BYTES = 2_000_000;
const MAX_REQUEST_XML_BYTES = 20 * 1024 * 1024;
const MAX_AREA_MM2 = 22500;

export const wilcomProvider = {
  id: "wilcom",
  describe() {
    return {
      id: "wilcom",
      name: "Wilcom EWA",
      status: isConfigured() ? "ready" : "unavailable",
      configured: isConfigured(),
      modes: ["trueview", "design"],
      missing: missingCredentials(),
      reason: isConfigured()
        ? null
        : "Non disponibile: serve un account Wilcom EWA con AutoDigitizing abilitato.",
    };
  },
  async convert(input, options, runDir) {
    mkdirSync(runDir, { recursive: true });

    const wilcomOptions = options.wilcom ?? options;
    let extension = getExtension(input.name);
    let sourceKind = resolveSourceKind(extension, wilcomOptions.inputKind);
    const preparedInput = await prepareWilcomInput({
      input,
      sourceKind,
      wilcomOptions,
      runDir,
    });
    const wilcomInput = preparedInput.input;
    extension = getExtension(wilcomInput.name);
    sourceKind = preparedInput.sourceKind;
    validateSourceExtension(sourceKind, extension);
    validateArtworkSize(wilcomInput);

    const widthMm = wilcomOptions.useSourceDpi
      ? undefined
      : positiveNumberOrUndefined(options.widthMm ?? wilcomOptions.widthMm);
    const heightMm = wilcomOptions.useSourceDpi
      ? undefined
      : positiveNumberOrUndefined(options.heightMm ?? wilcomOptions.heightMm);
    validateTargetArea(widthMm, heightMm);

    const colorSource = normalizeColorSource(wilcomOptions.colorSource);
    const threads = colorSource === "palette" ? parseThreads(wilcomOptions.threads ?? options.threads ?? []) : [];
    const threadChart = colorSource === "threadChart" ? parseThreadChart(wilcomOptions.threadChart) : null;
    if (colorSource === "threadChart" && !threadChart) {
      throw httpError(400, "Wilcom thread chart mancante: carica un file .tch oppure usa Palette/Default.");
    }

    const mode = options.mode === "design" ? "design" : "trueview";
    const designFormat = normalizeDesignFormat(options.designFormat ?? "emb");
    const designVersion = normalizeDesignVersion(wilcomOptions.designVersion, designFormat);
    const trueviewFileName = "trueview.png";
    const designFileName = `design.${designFormat}`;

    const requestXml = buildRequestXml({
      sourceKind,
      inputFileName: sanitizeFileName(wilcomInput.name),
      inputBase64: wilcomInput.base64,
      mode,
      trueviewFileName,
      designFileName,
      designVersion,
      widthMm,
      heightMm,
      dpi: positiveIntegerOrDefault(wilcomOptions.dpi ?? options.dpi, 160),
      removeBackground: Boolean(wilcomOptions.removeBackground ?? options.removeBackground ?? true),
      threads,
      threadChart,
    });
    validateRequestXmlSize(requestXml);

    const requestPath = join(runDir, "wilcom-request.xml");
    writeFileSync(requestPath, requestXml, "utf8");

    if (!isConfigured()) {
      throw httpError(400, "Wilcom non ancora disponibile: mancano account/API key EWA.");
    }

    const baseUrl = (process.env.WILCOM_EWA_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const methodPrefix = sourceKind === "vector" ? "vectorArt" : "bitmapArt";
    const method = `${methodPrefix}${mode === "design" ? "Design" : "Trueview"}`;
    const requestBody = new URLSearchParams({
      appId: process.env.WILCOM_EWA_APP_ID,
      appKey: process.env.WILCOM_EWA_APP_KEY,
      requestXml,
    });
    const response = await fetch(`${baseUrl}/api/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: requestBody,
    });

    const responseXml = await response.text();
    writeFileSync(join(runDir, "wilcom-response.xml"), responseXml, "utf8");
    const errorInfo = parseFirstTagAttributes(responseXml, "error_info");

    if (!response.ok) {
      throw httpError(response.status, wilcomErrorMessage(response.status, errorInfo), {
        errorInfo,
        responseBody: responseXml,
        responseXml,
      });
    }

    if (errorInfo) {
      throw httpError(400, wilcomErrorMessage(400, errorInfo), {
        errorInfo,
        responseBody: responseXml,
        responseXml,
      });
    }

    const files = [];
    const runFiles = [
      ...preparedInput.runFiles,
      { name: "wilcom-request.xml", kind: "request" },
      { name: "wilcom-response.xml", kind: "response" },
    ];

    for (const file of parseFileEntries(responseXml)) {
      if (!file.filename || !file.filecontents) continue;

      const safeName = sanitizeFileName(file.filename);
      writeFileSync(join(runDir, safeName), Buffer.from(file.filecontents, "base64"));
      files.push({
        name: safeName,
        mimeType: inferMimeType(safeName),
        base64: file.filecontents,
      });
      runFiles.push({ name: safeName, kind: safeName.toLowerCase().endsWith(".png") ? "preview" : "design" });
    }

    const designInfo = parseFirstTagAttributes(responseXml, "design_info");
    if (designInfo) {
      writeFileSync(join(runDir, "design-info.json"), JSON.stringify(designInfo, null, 2), "utf8");
      runFiles.push({ name: "design-info.json", kind: "metadata" });
    }

    return {
      provider: "wilcom",
      requestXml,
      responseXml,
      files,
      designInfo,
      runFiles,
    };
  },
};

function buildRequestXml({
  sourceKind,
  inputFileName,
  inputBase64,
  mode,
  trueviewFileName,
  designFileName,
  designVersion,
  widthMm,
  heightMm,
  dpi,
  removeBackground,
  threads,
  threadChart,
}) {
  const dimensions = [
    widthMm ? `width="${xmlAttr(widthMm)}"` : "",
    heightMm ? `height="${xmlAttr(heightMm)}"` : "",
    threadChart ? `thread_file="${xmlAttr(threadChart.name)}"` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const outputAttrs = [
    `trueview_file="${xmlAttr(trueviewFileName)}"`,
    mode === "design" ? `design_file="${xmlAttr(designFileName)}"` : "",
    designVersion ? `design_version="${xmlAttr(designVersion)}"` : "",
    `dpi="${xmlAttr(String(dpi))}"`,
  ]
    .filter(Boolean)
    .join(" ");

  const threadXml = threads.length
    ? [
        "    <threads>",
        ...threads.map(
          (thread, index) =>
            `      <thread color="${thread.rgbInt}" code="${index + 1}" brand="Embroidery Lab" description="${xmlAttr(thread.hex)}" />`
        ),
        "    </threads>",
      ].join("\n")
    : "";

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<xml>",
    `  <${sourceKind} file="${xmlAttr(inputFileName)}" remove_background="${removeBackground}" />`,
    `  <autodigitize_options${dimensions ? ` ${dimensions}` : ""}>${threadXml ? `\n${threadXml}\n  ` : ""}</autodigitize_options>`,
    `  <output ${outputAttrs} />`,
    "  <files>",
    `    <file filename="${xmlAttr(inputFileName)}" filecontents="${inputBase64}" />`,
    ...(threadChart ? [`    <file filename="${xmlAttr(threadChart.name)}" filecontents="${threadChart.base64}" />`] : []),
    "  </files>",
    "</xml>",
    "",
  ].join("\n");
}

async function prepareWilcomInput({ input, sourceKind, wilcomOptions, runDir }) {
  const shouldSimplify =
    sourceKind === "bitmap" &&
    (wilcomOptions.simplifyBitmap === true || wilcomOptions.simplifyBitmap === "true");

  if (!shouldSimplify) {
    return { input, sourceKind, runFiles: [] };
  }

  const colors = integerRangeOrDefault(wilcomOptions.simplifyColors, 24, 2, 256, "Wilcom simplify colors");
  const originalBuffer = Buffer.from(input.base64, "base64");
  let simplifiedBuffer;

  try {
    simplifiedBuffer = await sharp(originalBuffer, { failOn: "none", limitInputPixels: false })
      .rotate()
      .toColourspace("srgb")
      .png({ palette: true, colors, compressionLevel: 9 })
      .toBuffer();
  } catch (error) {
    throw httpError(400, `Preprocess Wilcom non riuscito: ${error.message}`);
  }

  const simplifiedName = "wilcom-source-simplified.png";
  const summaryName = "wilcom-source-simplified.json";
  writeFileSync(join(runDir, simplifiedName), simplifiedBuffer);
  writeFileSync(
    join(runDir, summaryName),
    JSON.stringify(
      {
        original: {
          name: input.name,
          bytes: originalBuffer.length,
        },
        sent: {
          name: simplifiedName,
          bytes: simplifiedBuffer.length,
          colors,
        },
        note: "Optional Wilcom bitmap simplification: palette PNG with a fixed number of colors before EWA autodigitizing.",
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    input: {
      name: simplifiedName,
      mimeType: "image/png",
      base64: simplifiedBuffer.toString("base64"),
    },
    sourceKind: "bitmap",
    runFiles: [
      { name: simplifiedName, kind: "source-sent" },
      { name: summaryName, kind: "metadata" },
    ],
  };
}

function resolveSourceKind(extension, requestedKind = "auto") {
  const normalized = String(requestedKind || "auto");
  if (normalized === "bitmap" || normalized === "vector") return normalized;
  if (SUPPORTED_VECTOR_EXTENSIONS.has(extension)) return "vector";
  return "bitmap";
}

function validateSourceExtension(sourceKind, extension) {
  const supported = sourceKind === "vector" ? SUPPORTED_VECTOR_EXTENSIONS : SUPPORTED_BITMAP_EXTENSIONS;
  if (!supported.has(extension)) {
    const label = sourceKind === "vector" ? "vector" : "bitmap";
    throw httpError(400, `Formato ${label} Wilcom non supportato: .${extension}`);
  }
}

function validateArtworkSize(input) {
  const bytes = Buffer.byteLength(input.base64, "base64");
  if (bytes > MAX_ARTWORK_BYTES) {
    throw httpError(400, `Artwork Wilcom troppo grande: ${bytes} bytes. Limite: ${MAX_ARTWORK_BYTES} bytes.`);
  }
}

function validateTargetArea(widthMm, heightMm) {
  if (!widthMm || !heightMm) return;
  const area = Number(widthMm) * Number(heightMm);
  if (area > MAX_AREA_MM2) {
    throw httpError(400, `Area ricamo Wilcom troppo grande: ${area.toFixed(0)} mm2. Limite: ${MAX_AREA_MM2} mm2.`);
  }
}

function validateRequestXmlSize(requestXml) {
  const bytes = Buffer.byteLength(requestXml, "utf8");
  if (bytes > MAX_REQUEST_XML_BYTES) {
    throw httpError(400, `Request Wilcom troppo grande: ${bytes} bytes. Limite: ${MAX_REQUEST_XML_BYTES} bytes.`);
  }
}

function normalizeColorSource(value) {
  const normalized = String(value || "palette");
  if (["palette", "threadChart", "default"].includes(normalized)) return normalized;
  throw httpError(400, "Wilcom color source non valido");
}

function normalizeDesignVersion(value, designFormat) {
  if (value === "" || value === undefined || value === null) return undefined;
  if (designFormat !== "emb") {
    throw httpError(400, "Wilcom design_version puo essere usato solo con formato EMB");
  }
  return String(value);
}

function parseThreadChart(value) {
  if (!value || typeof value !== "object") return null;
  const name = sanitizeFileName(value.name || "");
  if (!name.toLowerCase().endsWith(".tch")) {
    throw httpError(400, "Wilcom thread chart non valido: serve un file .tch");
  }

  const dataUrl = typeof value.dataUrl === "string" ? value.dataUrl : "";
  const dataUrlMatch = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  const base64 = value.base64 || dataUrlMatch?.[1];
  if (!base64) {
    throw httpError(400, "Wilcom thread chart senza contenuto base64");
  }

  return { name, base64 };
}

function wilcomErrorMessage(status, errorInfo) {
  if (errorInfo?.message) {
    const code = errorInfo.errorcode ? ` ${errorInfo.errorcode}` : "";
    return `Wilcom${code}: ${errorInfo.message}`;
  }
  return `Wilcom HTTP ${status}`;
}

function parseThreads(value) {
  const list = Array.isArray(value) ? value : String(value).split(",");
  return list
    .map((item) => String(item).trim())
    .filter(Boolean)
    .map((hex) => {
      const normalized = hex.startsWith("#") ? hex : `#${hex}`;
      if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
        throw httpError(400, `Colore thread non valido: ${hex}`);
      }

      const red = Number.parseInt(normalized.slice(1, 3), 16);
      const green = Number.parseInt(normalized.slice(3, 5), 16);
      const blue = Number.parseInt(normalized.slice(5, 7), 16);
      return {
        hex: normalized.toUpperCase(),
        rgbInt: red + (green << 8) + (blue << 16),
      };
    });
}

function parseFileEntries(xml) {
  const entries = [];
  const fileTagPattern = /<file\b([^>]*?)(?:\/>|>[\s\S]*?<\/file>)/gi;
  let match;
  while ((match = fileTagPattern.exec(xml))) {
    entries.push(parseAttributes(match[1]));
  }
  return entries;
}

function parseFirstTagAttributes(xml, tagName) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/${tagName}>)`, "i");
  const match = pattern.exec(xml);
  return match ? parseAttributes(match[1]) : null;
}

function parseAttributes(attributeText) {
  const attributes = {};
  const attrPattern = /([A-Za-z_:-][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = attrPattern.exec(attributeText))) {
    attributes[match[1]] = xmlUnescape(match[2] ?? match[3] ?? "");
  }
  return attributes;
}

function positiveNumberOrUndefined(value) {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw httpError(400, "Dimensioni ricamo non valide");
  }
  return String(number);
}

function positiveIntegerOrDefault(value, fallback) {
  const number = value === "" || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw httpError(400, "DPI non valido");
  }
  return number;
}

function integerRangeOrDefault(value, fallback, min, max, label) {
  const number = value === "" || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw httpError(400, `${label} non valido`);
  }
  return number;
}

function normalizeDesignFormat(value) {
  const normalized = String(value).replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9]+$/.test(normalized)) {
    throw httpError(400, "Formato file ricamo non valido");
  }
  return normalized;
}

function missingCredentials() {
  return ["WILCOM_EWA_APP_ID", "WILCOM_EWA_APP_KEY"].filter((key) => !process.env[key]);
}

function isConfigured() {
  return missingCredentials().length === 0;
}

function getExtension(fileName) {
  const match = String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function inferMimeType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function sanitizeFileName(name) {
  return String(name).replace(/[^0-9A-Za-z._ -]/g, "_");
}

function xmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlUnescape(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}
