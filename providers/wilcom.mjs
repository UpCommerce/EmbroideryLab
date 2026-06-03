import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

    const extension = getExtension(input.name);
    if (!SUPPORTED_BITMAP_EXTENSIONS.has(extension)) {
      throw httpError(400, `Formato bitmap non supportato: .${extension}`);
    }

    const mode = options.mode === "design" ? "design" : "trueview";
    const designFormat = normalizeDesignFormat(options.designFormat ?? "emb");
    const trueviewFileName = "trueview.png";
    const designFileName = `design.${designFormat}`;
    const threads = parseThreads(options.threads ?? []);

    const requestXml = buildRequestXml({
      inputFileName: sanitizeFileName(input.name),
      inputBase64: input.base64,
      mode,
      trueviewFileName,
      designFileName,
      widthMm: positiveNumberOrUndefined(options.widthMm),
      heightMm: positiveNumberOrUndefined(options.heightMm),
      dpi: positiveIntegerOrDefault(options.dpi, 160),
      removeBackground: Boolean(options.removeBackground ?? true),
      threads,
    });

    const requestPath = join(runDir, "wilcom-request.xml");
    writeFileSync(requestPath, requestXml, "utf8");

    if (!isConfigured()) {
      throw httpError(400, "Wilcom non ancora disponibile: mancano account/API key EWA.");
    }

    const baseUrl = (process.env.WILCOM_EWA_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const method = mode === "design" ? "bitmapArtDesign" : "bitmapArtTrueview";
    const response = await fetch(`${baseUrl}/api/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        appId: process.env.WILCOM_EWA_APP_ID,
        appKey: process.env.WILCOM_EWA_APP_KEY,
        requestXml,
      }),
    });

    const responseXml = await response.text();
    writeFileSync(join(runDir, "wilcom-response.xml"), responseXml, "utf8");

    if (!response.ok) {
      throw httpError(response.status, `Wilcom HTTP ${response.status}`, { responseXml });
    }

    const errorInfo = parseFirstTagAttributes(responseXml, "error_info");
    if (errorInfo) {
      throw httpError(400, "Wilcom ha restituito un errore", { errorInfo, responseXml });
    }

    const files = [];
    const runFiles = [
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
  inputFileName,
  inputBase64,
  mode,
  trueviewFileName,
  designFileName,
  widthMm,
  heightMm,
  dpi,
  removeBackground,
  threads,
}) {
  const dimensions = [
    widthMm ? `width="${xmlAttr(widthMm)}"` : "",
    heightMm ? `height="${xmlAttr(heightMm)}"` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const outputAttrs = [
    `trueview_file="${xmlAttr(trueviewFileName)}"`,
    mode === "design" ? `design_file="${xmlAttr(designFileName)}"` : "",
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
    `  <bitmap file="${xmlAttr(inputFileName)}" remove_background="${removeBackground}" />`,
    `  <autodigitize_options${dimensions ? ` ${dimensions}` : ""}>${threadXml ? `\n${threadXml}\n  ` : ""}</autodigitize_options>`,
    `  <output ${outputAttrs} />`,
    "  <files>",
    `    <file filename="${xmlAttr(inputFileName)}" filecontents="${inputBase64}" />`,
    "  </files>",
    "</xml>",
    "",
  ].join("\n");
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
