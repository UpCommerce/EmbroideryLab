import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SUPPORTED_INPUT_FORMATS = new Set(["dst", "tc", "z00", "tbf"]);
const SUPPORTED_DESIGN_FORMATS = new Set(["dst", "tc", "z00", "tbf"]);
const DEFAULT_ENDPOINT_PATH = "/StitchJob";
const DEFAULT_TRUEVIEW = {
  Strichdicke: "300",
  Helligkeit: "100",
  BeleuchtungEin: "1",
  BeleuchtungWinkel: "90",
  AusblendenAktiv: "1",
  AusblendenAb: "127",
};

export const zskProvider = {
  id: "zsk",
  describe() {
    return {
      id: "zsk",
      name: "ZSK Web API",
      status: isConfigured() ? "ready" : "unavailable",
      configured: isConfigured(),
      modes: ["trueview", "design"],
      missing: missingConfig(),
      reason: isConfigured()
        ? null
        : "Non disponibile: servono URL endpoint ZSK Web API e API key commerciali.",
    };
  },
  async convert(input, options, runDir) {
    mkdirSync(runDir, { recursive: true });

    const zskOptions = options.zsk ?? {};
    const mode = options.mode === "design" ? "design" : "trueview";
    const designFormat = normalizeDesignFormat(options.designFormat ?? zskOptions.designFormat ?? "dst");
    const extension = getExtension(input.name);
    const textOnly = Boolean(zskOptions.textOnly);

    if (!textOnly && !SUPPORTED_INPUT_FORMATS.has(extension)) {
      writeFileSync(
        join(runDir, "zsk-request.json"),
        JSON.stringify(
          {
            provider: "zsk",
            skipped: true,
            reason:
              "ZSK Web API public docs describe text/monogram generation and existing embroidery file composition; bitmap auto-digitizing from PNG/JPG is not documented.",
            source: sourceInfo(input),
          },
          null,
          2
        ),
        "utf8"
      );
      throw httpError(400, `Formato input non supportato da ZSK Web API pubblica: .${extension || "unknown"}`);
    }

    const embroideryType = textOnly ? undefined : normalizeEmbroideryType(extension);
    const requestPayload = buildRequestPayload({
      input,
      mode,
      designFormat,
      embroideryType,
      textOnly,
      options,
      zskOptions,
    });

    const requestInfo = {
      provider: "zsk",
      mode,
      endpoint: configuredEndpoint(),
      auth: authDebugInfo(),
      requestPayload,
      source: sourceInfo(input),
    };
    writeFileSync(join(runDir, "zsk-request.json"), JSON.stringify(requestInfo, null, 2), "utf8");

    if (!isConfigured()) {
      throw httpError(400, "ZSK Web API non configurata: imposta ZSK_WEB_API_BASE_URL e ZSK_WEB_API_KEY.");
    }

    const response = await fetch(configuredEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        [authHeaderName()]: process.env.ZSK_WEB_API_KEY,
      },
      body: JSON.stringify(requestPayload),
    });
    const responseText = await response.text();
    writeFileSync(join(runDir, "zsk-response.json"), responseText, "utf8");

    if (!response.ok) {
      throw httpError(response.status, `ZSK Web API HTTP ${response.status}`, { responseBody: responseText });
    }

    const responseJson = parseResponseJson(responseText);
    if (responseJson.Success === false) {
      throw httpError(400, "ZSK Web API ha restituito Success=false", { responseBody: responseText });
    }

    const outputBase64 = responseJson.RequestData;
    if (!outputBase64 || typeof outputBase64 !== "string") {
      throw httpError(400, "ZSK Web API response senza RequestData base64", { responseBody: responseText });
    }

    const files = [];
    const runFiles = [
      { name: "zsk-request.json", kind: "request" },
      { name: "zsk-response.json", kind: "response" },
    ];
    const outputName = mode === "design" ? `zsk-design.${fileExtensionForDesignFormat(designFormat)}` : "zsk-preview.png";
    const outputKind = mode === "design" ? "design" : "preview";
    const outputBuffer = Buffer.from(outputBase64, "base64");

    writeFileSync(join(runDir, outputName), outputBuffer);
    files.push({
      name: outputName,
      mimeType: inferMimeType(outputName),
      base64: outputBase64,
    });
    runFiles.push({ name: outputName, kind: outputKind });

    if (responseJson.Info) {
      writeFileSync(join(runDir, "zsk-design-info.json"), JSON.stringify(responseJson.Info, null, 2), "utf8");
      runFiles.push({ name: "zsk-design-info.json", kind: "metadata" });
    }

    return {
      provider: "zsk",
      requestXml: JSON.stringify(requestInfo, null, 2),
      responseXml: responseText,
      files,
      designInfo: responseJson.Info ?? null,
      runFiles,
    };
  },
};

function buildRequestPayload({ input, mode, designFormat, embroideryType, textOnly, options, zskOptions }) {
  const payload = {
    RequestType: requestTypeForMode(mode, designFormat),
    Monograms: parseMonograms(zskOptions.monograms, options),
  };

  if (!textOnly) {
    payload.EmbroideryType = embroideryType;
    payload.EmbroideryBase64 = input.base64;
  }

  const embroiderySize = buildEmbroiderySize(options, zskOptions);
  if (embroiderySize) payload.EmbroiderySize = embroiderySize;

  const designOffset = buildDesignOffset(zskOptions);
  if (designOffset) payload.DesignOffset = designOffset;

  const needle = parseNeedleDefinitions(zskOptions.needle);
  if (needle.length) payload.Needle = needle;

  const seqAssignmentJson = normalizeOptionalText(zskOptions.seqAssignmentJson);
  if (seqAssignmentJson) payload.SeqAssignmentJson = seqAssignmentJson;

  if (mode === "trueview") {
    payload.TrueView = buildTrueView(zskOptions.trueView);
    payload.PngResolution = positiveIntegerOrDefault(zskOptions.pngResolution, 254, "PngResolution");
  }

  return payload;
}

function requestTypeForMode(mode, designFormat) {
  if (mode === "trueview") return "CreatePNG";
  if (designFormat === "dst") return "CreateDST";
  if (designFormat === "tc" || designFormat === "z00") return "CreateTC";
  if (designFormat === "tbf") return "CreateTBF";
  throw httpError(400, `Formato ZSK non supportato: ${designFormat}`);
}

function parseMonograms(value, options) {
  if (Array.isArray(value) && value.length) {
    return value.map(normalizeMonogram);
  }

  const text = normalizeOptionalText(options.text);
  if (!text) return [];

  return [
    normalizeMonogram({
      Text: text.split(/\r?\n/).filter(Boolean),
      FontFamily: options.fontFamily ?? "Arial",
      FontSizeMM: options.fontSizeMm ?? 10,
      UsedNeedle: 1,
      XposMM: 0,
      YposMM: 0,
      HorizontalAlignment: 0,
      TextStitchParameter: "Premium",
      MonogramStyle: 0,
    }),
  ];
}

function normalizeMonogram(value) {
  if (!value || typeof value !== "object") {
    throw httpError(400, "Monogramma ZSK non valido");
  }

  const text = Array.isArray(value.Text) ? value.Text : [value.Text ?? ""];
  const monogram = {
    Text: text.map((line) => String(line)).filter(Boolean),
    FontFamily: normalizeOptionalText(value.FontFamily) || "Arial",
    FontSizeMM: positiveNumberOrDefault(value.FontSizeMM, 10, "FontSizeMM"),
    UsedNeedle: positiveIntegerOrDefault(value.UsedNeedle, 1, "UsedNeedle"),
    XposMM: numberOrDefault(value.XposMM, 0, "XposMM"),
    YposMM: numberOrDefault(value.YposMM, 0, "YposMM"),
  };

  assignOptionalNumber(monogram, "HorizontalAlignment", value.HorizontalAlignment, "HorizontalAlignment", true);
  assignOptionalNumber(monogram, "TextBendProcent", value.TextBendProcent, "TextBendProcent", true);
  assignOptionalNumber(monogram, "TextStyle", value.TextStyle, "TextStyle", true);
  assignOptionalNumber(monogram, "RadiusMM", value.RadiusMM, "RadiusMM");
  assignOptionalNumber(monogram, "MonogramStyle", value.MonogramStyle, "MonogramStyle", true);

  const textStitchParameter = normalizeOptionalText(value.TextStitchParameter);
  if (textStitchParameter) monogram.TextStitchParameter = textStitchParameter;

  if (!monogram.Text.length) {
    throw httpError(400, "Testo monogramma ZSK mancante");
  }

  return monogram;
}

function buildEmbroiderySize(options, zskOptions) {
  const width = optionalPositiveNumber(zskOptions.widthMm ?? options.widthMm, "EmbroiderySize.Widthmm");
  const height = optionalPositiveNumber(zskOptions.heightMm ?? options.heightMm, "EmbroiderySize.Heightmm");
  if (!width && !height) return null;
  if (!width || !height) {
    throw httpError(400, "EmbroiderySize ZSK richiede sia widthMm sia heightMm");
  }
  return { Widthmm: width, Heightmm: height };
}

function buildDesignOffset(zskOptions) {
  const offsetX = optionalNumber(zskOptions.offsetXmm, "DesignOffset.OffsetXmm");
  const offsetY = optionalNumber(zskOptions.offsetYmm, "DesignOffset.OffsetYmm");
  if (offsetX === undefined && offsetY === undefined) return null;
  return { OffsetXmm: offsetX ?? 0, OffsetYmm: offsetY ?? 0 };
}

function buildTrueView(value) {
  if (!value || typeof value !== "object") return DEFAULT_TRUEVIEW;
  return {
    Strichdicke: stringIntegerOrDefault(value.Strichdicke, DEFAULT_TRUEVIEW.Strichdicke, "Strichdicke"),
    Helligkeit: stringIntegerOrDefault(value.Helligkeit, DEFAULT_TRUEVIEW.Helligkeit, "Helligkeit"),
    BeleuchtungEin: stringIntegerOrDefault(value.BeleuchtungEin, DEFAULT_TRUEVIEW.BeleuchtungEin, "BeleuchtungEin"),
    BeleuchtungWinkel: stringIntegerOrDefault(
      value.BeleuchtungWinkel,
      DEFAULT_TRUEVIEW.BeleuchtungWinkel,
      "BeleuchtungWinkel"
    ),
    AusblendenAktiv: stringIntegerOrDefault(value.AusblendenAktiv, DEFAULT_TRUEVIEW.AusblendenAktiv, "AusblendenAktiv"),
    AusblendenAb: stringIntegerOrDefault(value.AusblendenAb, DEFAULT_TRUEVIEW.AusblendenAb, "AusblendenAb"),
  };
}

function parseNeedleDefinitions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((needle, index) => {
    if (!needle || typeof needle !== "object") {
      throw httpError(400, `Needle ZSK non valida alla posizione ${index + 1}`);
    }
    return {
      Red: colorChannel(needle.Red ?? needle.R, "Red"),
      Green: colorChannel(needle.Green ?? needle.G, "Green"),
      Blue: colorChannel(needle.Blue ?? needle.B, "Blue"),
      Name: normalizeOptionalText(needle.Name ?? needle.ColorName) || `Needle ${index + 1}`,
    };
  });
}

function configuredEndpoint() {
  const baseUrl = normalizeOptionalText(process.env.ZSK_WEB_API_BASE_URL).replace(/\/+$/, "");
  const endpointPath = normalizeOptionalText(process.env.ZSK_WEB_API_ENDPOINT || DEFAULT_ENDPOINT_PATH);
  if (!baseUrl) return null;
  if (/^https?:\/\//i.test(endpointPath)) return endpointPath;
  return `${baseUrl}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}`;
}

function missingConfig() {
  return ["ZSK_WEB_API_BASE_URL", "ZSK_WEB_API_KEY"].filter((key) => !process.env[key]);
}

function isConfigured() {
  return missingConfig().length === 0;
}

function authHeaderName() {
  return normalizeOptionalText(process.env.ZSK_WEB_API_AUTH_HEADER) || "x-api-key";
}

function authDebugInfo() {
  return {
    header: authHeaderName(),
    configured: Boolean(process.env.ZSK_WEB_API_KEY),
  };
}

function normalizeEmbroideryType(extension) {
  if (extension === "z00") return "TC";
  return extension.toUpperCase();
}

function normalizeDesignFormat(value) {
  const normalized = String(value).replace(/^\./, "").toLowerCase();
  if (!SUPPORTED_DESIGN_FORMATS.has(normalized)) {
    throw httpError(400, `Formato output ZSK non supportato: ${value}`);
  }
  return normalized;
}

function fileExtensionForDesignFormat(value) {
  return value === "tc" ? "z00" : value;
}

function getExtension(fileName) {
  const match = String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function sourceInfo(input) {
  return {
    name: input.name,
    mimeType: input.mimeType,
    bytes: Buffer.from(input.base64 || "", "base64").length,
  };
}

function parseResponseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "Risposta ZSK Web API non JSON", { responseBody: text });
  }
}

function inferMimeType(fileName) {
  return fileName.toLowerCase().endsWith(".png") ? "image/png" : "application/octet-stream";
}

function colorChannel(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 255) {
    throw httpError(400, `${label} needle ZSK non valido`);
  }
  return number;
}

function stringIntegerOrDefault(value, fallback, label) {
  const number = value === "" || value === undefined || value === null ? Number(fallback) : Number(value);
  if (!Number.isInteger(number)) {
    throw httpError(400, `${label} ZSK non valido`);
  }
  return String(number);
}

function assignOptionalNumber(target, key, value, label, allowZero = false) {
  const number = optionalPositiveNumber(value, label, allowZero);
  if (number !== undefined) target[key] = number;
}

function positiveIntegerOrDefault(value, fallback, label) {
  const number = value === "" || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw httpError(400, `${label} ZSK non valido`);
  }
  return number;
}

function positiveNumberOrDefault(value, fallback, label) {
  const number = value === "" || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw httpError(400, `${label} ZSK non valido`);
  }
  return number;
}

function numberOrDefault(value, fallback, label) {
  const number = value === "" || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(number)) {
    throw httpError(400, `${label} ZSK non valido`);
  }
  return number;
}

function optionalPositiveNumber(value, label, allowZero = false) {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  const isValid = Number.isFinite(number) && (allowZero ? number >= 0 : number > 0);
  if (!isValid) {
    throw httpError(400, `${label} ZSK non valido`);
  }
  return number;
}

function optionalNumber(value, label) {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw httpError(400, `${label} ZSK non valido`);
  }
  return number;
}

function normalizeOptionalText(value) {
  if (value === "" || value === undefined || value === null) return "";
  return String(value).trim();
}

function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}
