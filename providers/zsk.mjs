import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BITMAP_INPUT_FORMATS = new Set(["png", "jpg", "jpeg", "bmp"]);
const ACE_DESIGN_FORMATS = new Set(["z00", "tc", "dst"]);
const DEFAULT_ENDPOINT_PATH = "/StitchJob";
const DEFAULT_TRUEVIEW = {
  Strichdicke: "400",
  Helligkeit: "100",
  BeleuchtungEin: "1",
  BeleuchtungWinkel: "90",
  AusblendenAktiv: "1",
  AusblendenAb: "127",
};
const DEFAULT_OPTIMIZE = {
  Resolution: "0",
  ImageType: "0",
  Tolerance: "150",
  RemoveArea: "60",
  MaxColors: "24",
};
const DEFAULT_VECTOR = {
  Tolerance: "20",
  Smoothing: "50",
  DetermineBackgroundColor: "1",
  BackgroundColor: "255,255,255",
  BackgroundFill: "1",
};
const DEFAULT_PUNCH = {
  LineWidth: "10",
  SatinStitchWidth: "70",
  Overlap: "2",
  MinimumAreaSize: "5",
  MinimumHoleSize: "1",
  MinimumLineLength: "50",
};

export const zskProvider = {
  id: "zsk",
  describe() {
    const imageMissing = missingConfig();
    const textMissing = missingTextConfig();
    const configured = imageMissing.length === 0 || textMissing.length === 0;
    return {
      id: "zsk",
      name: "ZSK ACE",
      status: configured ? "ready" : "unavailable",
      configured,
      capabilities: {
        image: { supported: true, configured: imageMissing.length === 0, missing: imageMissing },
        text: { supported: true, configured: textMissing.length === 0, missing: textMissing },
      },
      modes: ["trueview", "design"],
      missing: configured ? [] : textMissing,
      reason: configured
        ? null
        : "Non disponibile: serve endpoint ZSK StitchJob e WebApiLicense; ACE token serve solo per autodigitize bitmap.",
    };
  },
  async convert(input, options, runDir) {
    mkdirSync(runDir, { recursive: true });

    const zskOptions = options.zsk ?? {};
    const aceOptions = zskOptions.ace ?? zskOptions;
    const mode = options.mode === "design" ? "design" : "trueview";
    const designFormat = normalizeDesignFormat(options.designFormat ?? zskOptions.designFormat ?? "z00");
    const pictureType = pictureTypeForInput(input);
    const source = sourceInfo(input);

    if (!pictureType) {
      writeFileSync(
        join(runDir, "zsk-ace-request.json"),
        JSON.stringify(
          {
            provider: "zsk",
            service: "ace",
            skipped: true,
            reason: "ZSK ACE supports bitmap input only: PNG, JPG or BMP.",
            source,
          },
          null,
          2
        ),
        "utf8"
      );
      throw httpError(400, `Formato input non supportato da ZSK ACE: .${getExtension(input.name) || "unknown"}`);
    }

    const files = [];
    const runFiles = [];
    const requestSummaries = [];
    let designInfo = null;

    const preview = await postStitchJob({
      label: "ZSK ACE preview",
      payload: buildAcePayload({
        requestType: "CreatePNG",
        input,
        pictureType,
        aceOptions,
        includeTrueView: true,
      }),
      runDir,
      requestFileName: "zsk-ace-preview-request.json",
      responseFileName: "zsk-ace-preview-response.json",
      source,
    });

    requestSummaries.push(preview.summary);
    runFiles.push(
      { name: "zsk-ace-preview-request.json", kind: "request" },
      { name: "zsk-ace-preview-response.json", kind: "response" }
    );
    writeOutputFile({
      runDir,
      name: "zsk-ace-preview.png",
      mimeType: "image/png",
      base64: preview.json.RequestData,
      kind: "preview",
      files,
      runFiles,
    });
    designInfo = normalizeDesignInfo(preview.json.Info);

    if (mode === "design") {
      const design = await postStitchJob({
        label: "ZSK ACE design",
        payload: buildAcePayload({
          requestType: "CreateTC",
          input,
          pictureType,
          aceOptions,
          includeTrueView: false,
        }),
        runDir,
        requestFileName: "zsk-ace-design-request.json",
        responseFileName: "zsk-ace-design-response.json",
        source,
      });

      requestSummaries.push(design.summary);
      runFiles.push(
        { name: "zsk-ace-design-request.json", kind: "request" },
        { name: "zsk-ace-design-response.json", kind: "response" }
      );
      designInfo = normalizeDesignInfo(design.json.Info) ?? designInfo;

      if (designFormat === "dst") {
        const dst = await postStitchJob({
          label: "ZSK Web API DST conversion",
          payload: {
            RequestType: "CreateDST",
            EmbroideryType: "TC",
            EmbroideryBase64: design.json.RequestData,
            ServerVersion: 3,
            WebApiLicense: licenseValue(),
          },
          runDir,
          requestFileName: "zsk-dst-conversion-request.json",
          responseFileName: "zsk-dst-conversion-response.json",
          source,
        });

        requestSummaries.push(dst.summary);
        runFiles.push(
          { name: "zsk-dst-conversion-request.json", kind: "request" },
          { name: "zsk-dst-conversion-response.json", kind: "response" }
        );
        writeOutputFile({
          runDir,
          name: "zsk-ace-design.dst",
          mimeType: "application/octet-stream",
          base64: dst.json.RequestData,
          kind: "design",
          files,
          runFiles,
        });
        designInfo = normalizeDesignInfo(dst.json.Info) ?? designInfo;
      } else {
        writeOutputFile({
          runDir,
          name: "zsk-ace-design.z00",
          mimeType: "application/octet-stream",
          base64: design.json.RequestData,
          kind: "design",
          files,
          runFiles,
        });
      }
    }

    return {
      provider: "zsk",
      requestXml: JSON.stringify({ provider: "zsk", service: "ace", requests: requestSummaries }, null, 2),
      files,
      designInfo,
      runFiles,
    };
  },
  async convertText(source, options, runDir) {
    mkdirSync(runDir, { recursive: true });

    const mode = options.mode === "design" ? "design" : "trueview";
    const textOptions = options.text ?? {};
    const zskOptions = options.zskText ?? {};
    const designFormat = normalizeTextDesignFormat(options.designFormat ?? zskOptions.designFormat ?? "z00");
    const sourceInfo = textSourceInfo(source);
    const files = [];
    const runFiles = [{ name: "text-source.json", kind: "source-info" }];
    const requestSummaries = [];
    let designInfo = null;

    writeFileSync(join(runDir, "text-source.json"), JSON.stringify(sourceInfo, null, 2), "utf8");

    const preview = await postStitchJob({
      label: "ZSK text preview",
      payload: buildTextPayload({ requestType: "CreatePNG", source, textOptions, zskOptions, includeTrueView: true }),
      runDir,
      requestFileName: "zsk-text-preview-request.json",
      responseFileName: "zsk-text-preview-response.json",
      source: sourceInfo,
      requiresAce: false,
    });

    requestSummaries.push(preview.summary);
    runFiles.push(
      { name: "zsk-text-preview-request.json", kind: "request" },
      { name: "zsk-text-preview-response.json", kind: "response" }
    );
    writeOutputFile({
      runDir,
      name: "zsk-text-preview.png",
      mimeType: "image/png",
      base64: preview.json.RequestData,
      kind: "preview",
      files,
      runFiles,
    });
    designInfo = normalizeDesignInfo(preview.json.Info);

    if (mode === "design") {
      const requestType = zskTextRequestType(designFormat);
      const design = await postStitchJob({
        label: "ZSK text design",
        payload: buildTextPayload({ requestType, source, textOptions, zskOptions, includeTrueView: false }),
        runDir,
        requestFileName: "zsk-text-design-request.json",
        responseFileName: "zsk-text-design-response.json",
        source: sourceInfo,
        requiresAce: false,
      });

      requestSummaries.push(design.summary);
      runFiles.push(
        { name: "zsk-text-design-request.json", kind: "request" },
        { name: "zsk-text-design-response.json", kind: "response" }
      );
      designInfo = normalizeDesignInfo(design.json.Info) ?? designInfo;
      writeOutputFile({
        runDir,
        name: "zsk-text-design." + zskTextOutputExtension(designFormat),
        mimeType: "application/octet-stream",
        base64: design.json.RequestData,
        kind: "design",
        files,
        runFiles,
      });
    }

    return {
      provider: "zsk",
      requestXml: JSON.stringify({ provider: "zsk", service: "webapi-text", requests: requestSummaries }, null, 2),
      files,
      designInfo: designInfo ? { ...designInfo, source_type: "text", text: source.text } : { source_type: "text", text: source.text },
      runFiles,
    };
  },
};

async function postStitchJob({ label, payload, runDir, requestFileName, responseFileName, source, requiresAce = true }) {
  const requestInfo = {
    provider: "zsk",
    endpoint: configuredEndpoint(),
    auth: authDebugInfo(),
    requestPayload: summarizePayload(payload),
    source,
  };
  writeFileSync(join(runDir, requestFileName), JSON.stringify(requestInfo, null, 2), "utf8");

  const summary = requestInfo;

  const configured = requiresAce ? isConfigured() : isTextConfigured();
  if (!configured) {
    throw httpError(400, requiresAce
      ? "ZSK ACE non configurata: imposta ZSK_WEB_API_BASE_URL, ZSK_WEB_API_KEY e ZSK_ACE_TOKEN."
      : "ZSK text non configurato: imposta ZSK_WEB_API_BASE_URL e ZSK_WEB_API_KEY.");
  }

  const response = await fetch(configuredEndpoint(), {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(payload),
  });
  const responseText = await response.text();
  writeFileSync(join(runDir, responseFileName), responseText, "utf8");

  if (!response.ok) {
    throw httpError(response.status, `${label} HTTP ${response.status}`, { responseBody: responseText });
  }

  const json = parseResponseJson(responseText);
  if (json.Success === false) {
    throw httpError(400, `${label} returned Success=false`, { responseBody: responseText });
  }

  if (!json.RequestData || typeof json.RequestData !== "string") {
    throw httpError(400, `${label} response senza RequestData base64`, { responseBody: responseText });
  }

  return { json, responseText, summary };
}

function buildTextPayload({ requestType, source, textOptions, zskOptions, includeTrueView }) {
  const needleColor = hexToRgb(textOptions.threadColor ?? zskOptions.threadColor ?? "#0073cf");
  const monogram = {
    Text: source.text.split(/\r?\n/),
    FontFamily: normalizeOptionalText(zskOptions.fontFamily) || "Arial",
    FontSizeMM: positiveNumberOrDefault(textOptions.heightMm ?? zskOptions.fontSizeMm, 12, "FontSizeMM"),
    UsedNeedle: positiveIntegerOrDefault(zskOptions.usedNeedle, 1, "UsedNeedle"),
    XposMM: numberOrDefault(zskOptions.xPosMm, 0, "XposMM"),
    YposMM: numberOrDefault(zskOptions.yPosMm, 0, "YposMM"),
    HorizontalAlignment: integerRangeOrDefault(zskOptions.horizontalAlignment, "1", "HorizontalAlignment", 0, 2),
    TextBendProcent: integerRangeOrDefault(zskOptions.textBendPercent, "0", "TextBendProcent", -100, 100),
    TextStitchParameter: enumText(zskOptions.textStitchParameter, new Set(["Default/Custom", "Small", "Big", "Budget", "Premium", "Dense"]), "Premium", "TextStitchParameter"),
    MonogramStyle: integerRangeOrDefault(zskOptions.monogramStyle, "0", "MonogramStyle", 0, 99),
  };

  const lineSpacing = parseNumberList(zskOptions.lineSpacing);
  if (lineSpacing.length > 0) monogram.LineSpacing = lineSpacing;

  return {
    RequestType: requestType,
    ...(includeTrueView ? { TrueView: buildTrueView(zskOptions.trueView), PngResolution: positiveIntegerOrDefault(zskOptions.pngResolution, 254, "PngResolution") } : {}),
    Monograms: [monogram],
    Needle: [{
      Red: needleColor.red,
      Green: needleColor.green,
      Blue: needleColor.blue,
      Name: normalizeOptionalText(zskOptions.threadName) || "Thread",
    }],
    ServerVersion: 3,
    WebApiLicense: licenseValue(),
  };
}

function buildAcePayload({ requestType, input, pictureType, aceOptions, includeTrueView }) {
  return {
    RequestType: requestType,
    ...(includeTrueView ? { TrueView: buildTrueView(aceOptions.trueView), PngResolution: positiveIntegerOrDefault(aceOptions.pngResolution, 254, "PngResolution") } : {}),
    Client: "ACE",
    ACEParaBitmapOptimize: buildOptimize(aceOptions.optimize),
    ACEParaBitmapToVector: buildVector(aceOptions.vector),
    ACEParaBitmapToPunch: buildPunch(aceOptions.punch),
    PictureType: pictureType,
    PictureBase64: input.base64,
    ServerVersion: 3,
    WebApiLicense: licenseValue(),
    ACEToken: aceTokenValue(),
  };
}

function buildOptimize(value = {}) {
  return {
    Resolution: integerRangeOrDefault(value.resolution, DEFAULT_OPTIMIZE.Resolution, "Resolution", 0, 2000),
    ImageType: integerRangeOrDefault(value.imageType, DEFAULT_OPTIMIZE.ImageType, "ImageType", 0, 3),
    Tolerance: integerRangeOrDefault(value.tolerance, DEFAULT_OPTIMIZE.Tolerance, "Optimize Tolerance", 0, 300),
    RemoveArea: integerRangeOrDefault(value.removeArea, DEFAULT_OPTIMIZE.RemoveArea, "RemoveArea", 0, 200),
    MaxColors: integerRangeOrDefault(value.maxColors, DEFAULT_OPTIMIZE.MaxColors, "MaxColors", 1, 256),
  };
}

function buildVector(value = {}) {
  return {
    Tolerance: integerRangeOrDefault(value.tolerance, DEFAULT_VECTOR.Tolerance, "Vector Tolerance", 0, 300),
    Smoothing: integerRangeOrDefault(value.smoothing, DEFAULT_VECTOR.Smoothing, "Smoothing", 0, 200),
    DetermineBackgroundColor: boolNumber(value.determineBackgroundColor, DEFAULT_VECTOR.DetermineBackgroundColor),
    BackgroundColor: rgbStringOrDefault(value.backgroundColor, DEFAULT_VECTOR.BackgroundColor, "BackgroundColor"),
    BackgroundFill: boolNumber(value.backgroundFill, DEFAULT_VECTOR.BackgroundFill),
  };
}

function buildPunch(value = {}) {
  const punch = {
    LineWidth: integerRangeOrDefault(value.lineWidth, DEFAULT_PUNCH.LineWidth, "LineWidth", 1, 1000),
    SatinStitchWidth: integerRangeOrDefault(value.satinStitchWidth, DEFAULT_PUNCH.SatinStitchWidth, "SatinStitchWidth", 1, 1000),
    Overlap: integerRangeOrDefault(value.overlap, DEFAULT_PUNCH.Overlap, "Overlap", 0, 1000),
    MinimumAreaSize: integerRangeOrDefault(value.minimumAreaSize, DEFAULT_PUNCH.MinimumAreaSize, "MinimumAreaSize", 1, 10000),
    MinimumHoleSize: integerRangeOrDefault(value.minimumHoleSize, DEFAULT_PUNCH.MinimumHoleSize, "MinimumHoleSize", 1, 10000),
    MinimumLineLength: integerRangeOrDefault(value.minimumLineLength, DEFAULT_PUNCH.MinimumLineLength, "MinimumLineLength", 1, 10000),
  };

  const threadCones = normalizeOptionalText(value.threadCones ?? process.env.ZSK_ACE_THREAD_CONES);
  if (threadCones) punch.UseThreadCones = threadCones;
  return punch;
}

function buildTrueView(value = {}) {
  return {
    Strichdicke: integerRangeOrDefault(value.Strichdicke ?? value.threadThickness, DEFAULT_TRUEVIEW.Strichdicke, "Strichdicke", 1, 2000),
    Helligkeit: integerRangeOrDefault(value.Helligkeit ?? value.brightness, DEFAULT_TRUEVIEW.Helligkeit, "Helligkeit", 0, 300),
    BeleuchtungEin: boolNumber(value.BeleuchtungEin ?? value.lightingEnabled, DEFAULT_TRUEVIEW.BeleuchtungEin),
    BeleuchtungWinkel: integerRangeOrDefault(value.BeleuchtungWinkel ?? value.lightingAngle, DEFAULT_TRUEVIEW.BeleuchtungWinkel, "BeleuchtungWinkel", 0, 360),
    AusblendenAktiv: boolNumber(value.AusblendenAktiv ?? value.hideLongStitches, DEFAULT_TRUEVIEW.AusblendenAktiv),
    AusblendenAb: integerRangeOrDefault(value.AusblendenAb ?? value.hideThreshold, DEFAULT_TRUEVIEW.AusblendenAb, "AusblendenAb", 0, 10000),
  };
}

function writeOutputFile({ runDir, name, mimeType, base64, kind, files, runFiles }) {
  writeFileSync(join(runDir, name), Buffer.from(base64, "base64"));
  files.push({ name, mimeType, base64 });
  runFiles.push({ name, kind });
}

function configuredEndpoint() {
  const baseUrl = normalizeOptionalText(process.env.ZSK_WEB_API_BASE_URL).replace(/\/+$/, "");
  const endpointPath = normalizeOptionalText(process.env.ZSK_WEB_API_ENDPOINT || DEFAULT_ENDPOINT_PATH);
  if (!baseUrl) return null;
  if (/^https?:\/\//i.test(endpointPath)) return endpointPath;
  return `${baseUrl}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}`;
}

function missingConfig() {
  return ["ZSK_WEB_API_BASE_URL", "ZSK_WEB_API_KEY", "ZSK_ACE_TOKEN"].filter((key) => !process.env[key]);
}

function missingTextConfig() {
  return ["ZSK_WEB_API_BASE_URL", "ZSK_WEB_API_KEY"].filter((key) => !process.env[key]);
}

function isConfigured() {
  return missingConfig().length === 0;
}

function isTextConfigured() {
  return missingTextConfig().length === 0;
}

function authHeaderName() {
  return normalizeOptionalText(process.env.ZSK_WEB_API_AUTH_HEADER) || "x-api-key";
}

function authHeaderValue() {
  const scheme = normalizeOptionalText(process.env.ZSK_WEB_API_AUTH_SCHEME);
  return scheme ? `${scheme} ${process.env.ZSK_WEB_API_KEY}` : process.env.ZSK_WEB_API_KEY;
}

function requestHeaders() {
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    Accept: "application/json",
  };
  if (process.env.ZSK_WEB_API_KEY) headers[authHeaderName()] = authHeaderValue();
  return headers;
}

function authDebugInfo() {
  return {
    header: authHeaderName(),
    scheme: normalizeOptionalText(process.env.ZSK_WEB_API_AUTH_SCHEME) || null,
    webApiLicenseConfigured: Boolean(process.env.ZSK_WEB_API_KEY),
  };
}

function licenseValue() {
  const value = normalizeOptionalText(process.env.ZSK_WEB_API_KEY);
  if (!value) throw httpError(400, "ZSK WebApiLicense mancante: imposta ZSK_WEB_API_KEY.");
  return value;
}

function aceTokenValue() {
  const value = normalizeOptionalText(process.env.ZSK_ACE_TOKEN);
  if (!value) throw httpError(400, "ZSK ACEToken mancante: imposta ZSK_ACE_TOKEN.");
  return value;
}

function pictureTypeForInput(input) {
  const extension = getExtension(input.name);
  if (extension === "jpeg") return "JPG";
  if (BITMAP_INPUT_FORMATS.has(extension)) return extension.toUpperCase();

  const mimeType = normalizeOptionalText(input.mimeType).toLowerCase();
  if (mimeType === "image/jpeg") return "JPG";
  if (mimeType === "image/png") return "PNG";
  if (mimeType === "image/bmp") return "BMP";
  return null;
}

function normalizeTextDesignFormat(value) {
  const normalized = String(value).replace(/^\./, "").toLowerCase();
  if (!["z00", "tc", "dst", "tbf", "dsz"].includes(normalized)) {
    throw httpError(400, "Formato output ZSK text non supportato: " + value);
  }
  return normalized === "tc" ? "z00" : normalized;
}

function zskTextRequestType(format) {
  if (format === "dst") return "CreateDST";
  if (format === "tbf") return "CreateTBF";
  if (format === "dsz") return "CreateDSZ";
  return "CreateTC";
}

function zskTextOutputExtension(format) {
  return format === "z00" ? "z00" : format;
}

function textSourceInfo(source) {
  return {
    name: source.name,
    text: source.text,
    chars: source.text.length,
    lines: source.text.split(/\r?\n/).length,
  };
}

function positiveNumberOrDefault(value, fallback, label) {
  const number = value === "" || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw httpError(400, label + " ZSK non valido");
  }
  return number;
}

function numberOrDefault(value, fallback, label) {
  const number = value === "" || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(number)) {
    throw httpError(400, label + " ZSK non valido");
  }
  return number;
}

function enumText(value, allowed, fallback, label) {
  if (value === "" || value === undefined || value === null) return fallback;
  const text = String(value);
  if (!allowed.has(text)) throw httpError(400, label + " ZSK non valido");
  return text;
}

function parseNumberList(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  return String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite);
}

function hexToRgb(value) {
  const text = String(value || "#0073cf").trim();
  const match = text.match(/^#?([0-9a-fA-F]{6})$/);
  if (!match) throw httpError(400, "Thread color ZSK non valido");
  const hex = match[1];
  return {
    red: parseInt(hex.slice(0, 2), 16),
    green: parseInt(hex.slice(2, 4), 16),
    blue: parseInt(hex.slice(4, 6), 16),
  };
}

function normalizeDesignFormat(value) {
  const normalized = String(value).replace(/^\./, "").toLowerCase();
  if (!ACE_DESIGN_FORMATS.has(normalized)) {
    throw httpError(400, `Formato output ZSK ACE non supportato: ${value}`);
  }
  return normalized;
}

function normalizeDesignInfo(info) {
  if (!info || typeof info !== "object") return null;
  return {
    ...info,
    stitches: info.numberOfStitches ?? info.num_stitches ?? info.stitches,
    width: info.widthMm ?? info.width,
    height: info.heightMm ?? info.height,
    unit: "mm",
  };
}

function sourceInfo(input) {
  return {
    name: input.name,
    mimeType: input.mimeType,
    bytes: Buffer.from(input.base64 || "", "base64").length,
  };
}

function summarizePayload(payload) {
  return JSON.parse(
    JSON.stringify(payload, (key, value) => {
      if (key === "PictureBase64" || key === "EmbroideryBase64") {
        return `[base64 ${String(value ?? "").length} chars]`;
      }
      if (key === "WebApiLicense") {
        return "[configured]";
      }
      if (key === "ACEToken") {
        return "[configured]";
      }
      return value;
    })
  );
}

function parseResponseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "Risposta ZSK non JSON", { responseBody: text });
  }
}

function getExtension(fileName) {
  const match = String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function boolNumber(value, fallback = "0") {
  if (value === "" || value === undefined || value === null) return String(fallback);
  if (typeof value === "boolean") return value ? "1" : "0";
  const text = String(value).trim().toLowerCase();
  if (text === "1" || text === "true") return "1";
  if (text === "0" || text === "false") return "0";
  throw httpError(400, "Parametro booleano ZSK non valido");
}

function integerRangeOrDefault(value, fallback, label, min, max) {
  const number = value === "" || value === undefined || value === null ? Number(fallback) : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw httpError(400, `${label} ZSK non valido`);
  }
  return String(number);
}

function positiveIntegerOrDefault(value, fallback, label) {
  const number = value === "" || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw httpError(400, `${label} ZSK non valido`);
  }
  return number;
}

function rgbStringOrDefault(value, fallback, label) {
  const text = normalizeOptionalText(value);
  if (!text) return fallback;

  const hexMatch = text.match(/^#?([0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    return `${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)}`;
  }

  const parts = text.split(",").map((part) => Number(part.trim()));
  if (parts.length === 3 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return parts.join(",");
  }

  throw httpError(400, `${label} ZSK non valido`);
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
