import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, extname, join, parse } from "node:path";
import sharp from "sharp";

const DEFAULT_MAX_SOURCE_SIDE_PX = 3000;
const DEFAULT_MIN_SOURCE_SIDE_PX = 500;
const VECTOR_SOURCE_EXTENSIONS = new Set([".pdf", ".eps"]);

export async function preprocessSourceImage(input, options = {}, context = {}) {
  const originalBuffer = Buffer.from(input.base64, "base64");
  const originalName = basename(String(input.name || "design.png"));
  const originalMimeType = input.mimeType || inferMimeType(originalName);

  if (isVectorSource(originalName, originalMimeType)) {
    return passThroughSource({
      context,
      originalBuffer,
      originalName,
      originalMimeType,
      reason: "vector source passthrough",
    });
  }

  const originalMetadata = await readImageMetadata(originalBuffer, "Source image");
  const maxSourceSidePx = integerOption(
    options.maxSourceSidePx ?? process.env.SOURCE_MAX_SIDE_PX,
    DEFAULT_MAX_SOURCE_SIDE_PX,
    "Max source side px"
  );
  const minSourceSidePx = integerOption(
    options.minSourceSidePx ?? process.env.SOURCE_MIN_SIDE_PX,
    DEFAULT_MIN_SOURCE_SIDE_PX,
    "Min source side px"
  );
  const maxSourcePixels = integerOption(options.maxSourcePixels ?? process.env.SOURCE_MAX_PIXELS, undefined, "Max source pixels");
  const maxSourceBytes = integerOption(options.maxSourceBytes ?? process.env.SOURCE_MAX_BYTES, undefined, "Max source bytes");
  let transform = transformPlan(originalMetadata, {
    maxSourceSidePx,
    minSourceSidePx,
    maxSourcePixels,
    originalBytes: originalBuffer.length,
    maxSourceBytes,
  });
  const original = sourceSummary({
    name: originalName,
    mimeType: originalMimeType,
    buffer: originalBuffer,
    metadata: originalMetadata,
  });

  let sentBuffer = originalBuffer;
  let sentMimeType = originalMimeType;
  let sentMetadata = originalMetadata;

  if (transform.resized) {
    const output = resizedOutputFormat(originalMimeType, originalMetadata);
    const resized = await resizeSourceBuffer({
      originalBuffer,
      output,
      width: transform.width,
      height: transform.height,
      maxSourceBytes,
    });
    sentBuffer = resized.buffer;
    sentMimeType = output.mimeType;
    sentMetadata = await readImageMetadata(sentBuffer, "Processed source image");
    transform = {
      ...transform,
      width: sentMetadata.width ?? transform.width,
      height: sentMetadata.height ?? transform.height,
      scale: sentMetadata.width && originalMetadata.width ? sentMetadata.width / originalMetadata.width : transform.scale,
      reason: resized.byteConstrained ? combineReasons(transform.reason, "too large file") : transform.reason,
    };
  }

  const sent = sourceSummary({
    name: originalName,
    mimeType: sentMimeType,
    buffer: sentBuffer,
    metadata: sentMetadata,
  });
  const archive = transform.resized
    ? archiveOriginalAndReplace({
        context,
        originalName,
        originalBuffer,
        sentBuffer,
      })
    : { originalArchive: null, sampleReplacement: null };
  const manifest = {
    original,
    sent,
    preprocessing: {
      maxSourceSidePx,
      minSourceSidePx,
      maxSourcePixels,
      maxSourceBytes,
      resized: transform.resized,
      reason: transform.reason,
      scale: transform.scale,
      archive: archive.originalArchive,
      sampleReplacement: archive.sampleReplacement,
    },
  };

  const runFiles = [];
  if (context.runDir) {
    mkdirSync(context.runDir, { recursive: true });
    const sentFileName = `source-sent.${extensionFromMimeOrName(sentMimeType, originalName)}`;
    writeFileSync(join(context.runDir, sentFileName), sentBuffer);
    writeFileSync(join(context.runDir, "source.json"), JSON.stringify(manifest, null, 2), "utf8");
    runFiles.push({ name: sentFileName, kind: "source-sent" }, { name: "source.json", kind: "source-info" });
  }

  return {
    image: {
      name: originalName,
      mimeType: sentMimeType,
      base64: sentBuffer.toString("base64"),
    },
    original,
    sent,
    preprocessing: manifest.preprocessing,
    manifest,
    runFiles,
  };
}

async function resizeSourceBuffer({ originalBuffer, output, width, height, maxSourceBytes }) {
  let nextWidth = width;
  let nextHeight = height;
  let byteConstrained = false;
  let buffer = await renderResizedBuffer({ originalBuffer, output, width: nextWidth, height: nextHeight });

  while (maxSourceBytes && buffer.length > maxSourceBytes && nextWidth > 1 && nextHeight > 1) {
    byteConstrained = true;
    const scale = Math.max(0.1, Math.min(0.9, Math.sqrt(maxSourceBytes / buffer.length) * 0.95));
    nextWidth = Math.max(1, Math.floor(nextWidth * scale));
    nextHeight = Math.max(1, Math.floor(nextHeight * scale));
    buffer = await renderResizedBuffer({ originalBuffer, output, width: nextWidth, height: nextHeight });
  }

  return { buffer, byteConstrained };
}

async function renderResizedBuffer({ originalBuffer, output, width, height }) {
  const pipeline = sharp(originalBuffer, { failOn: "none", limitInputPixels: false })
    .rotate()
    .resize({
      width,
      height,
      fit: "fill",
      withoutEnlargement: false,
    });

  return output.format === "jpeg"
    ? await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    : await pipeline.png({ compressionLevel: 9 }).toBuffer();
}

function combineReasons(first, second) {
  if (!first || first === second) return second;
  return `${first}; ${second}`;
}

function passThroughSource({ context, originalBuffer, originalName, originalMimeType, reason }) {
  const original = sourceSummary({
    name: originalName,
    mimeType: originalMimeType,
    buffer: originalBuffer,
    metadata: {},
  });
  const manifest = {
    original,
    sent: original,
    preprocessing: {
      maxSourceSidePx: null,
      minSourceSidePx: null,
      maxSourcePixels: null,
      maxSourceBytes: null,
      resized: false,
      reason,
      scale: 1,
      archive: null,
      sampleReplacement: null,
    },
  };

  const runFiles = [];
  if (context.runDir) {
    mkdirSync(context.runDir, { recursive: true });
    const sentFileName = `source-sent.${extensionFromMimeOrName(originalMimeType, originalName)}`;
    writeFileSync(join(context.runDir, sentFileName), originalBuffer);
    writeFileSync(join(context.runDir, "source.json"), JSON.stringify(manifest, null, 2), "utf8");
    runFiles.push({ name: sentFileName, kind: "source-sent" }, { name: "source.json", kind: "source-info" });
  }

  return {
    image: {
      name: originalName,
      mimeType: originalMimeType,
      base64: originalBuffer.toString("base64"),
    },
    original,
    sent: original,
    preprocessing: manifest.preprocessing,
    manifest,
    runFiles,
  };
}

export async function normalizeSampleDirectory({ samplesDir, sourceOriginalsDir, options = {} }) {
  mkdirSync(samplesDir, { recursive: true });
  mkdirSync(sourceOriginalsDir, { recursive: true });
  const { readdirSync, statSync } = await import("node:fs");
  const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff"]);
  const results = [];

  for (const name of readdirSync(samplesDir)) {
    const samplePath = join(samplesDir, name);
    if (!statSync(samplePath).isFile() || !imageExtensions.has(extname(name).toLowerCase())) continue;

    const buffer = readFileSync(samplePath);
    const result = await preprocessSourceImage(
      {
        name,
        mimeType: inferMimeType(name),
        base64: buffer.toString("base64"),
      },
      options,
      {
        samplesDir,
        sourceOriginalsDir,
      }
    );
    results.push({
      name,
      resized: result.preprocessing.resized,
      reason: result.preprocessing.reason,
      original: result.original,
      sent: result.sent,
      archive: result.preprocessing.archive,
    });
  }

  return results;
}

async function readImageMetadata(buffer, label) {
  try {
    return await sharp(buffer, { failOn: "none", limitInputPixels: false }).metadata();
  } catch (error) {
    throw httpError(400, `${label} non leggibile: ${error.message}`);
  }
}

function transformPlan(metadata, { maxSourceSidePx, minSourceSidePx, maxSourcePixels, originalBytes, maxSourceBytes }) {
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) return { resized: false, reason: "missing dimensions" };

  const longestSide = Math.max(width, height);
  const shortestSide = Math.min(width, height);
  const pixelCount = width * height;
  const downscale = maxSourceSidePx && longestSide > maxSourceSidePx ? maxSourceSidePx / longestSide : 1;
  const pixelDownscale = maxSourcePixels && pixelCount > maxSourcePixels ? Math.sqrt(maxSourcePixels / pixelCount) : 1;
  const upscale = minSourceSidePx && shortestSide < minSourceSidePx ? minSourceSidePx / shortestSide : 1;
  const constrainedDownscale = Math.min(downscale, pixelDownscale);
  const scale = constrainedDownscale < 1 ? constrainedDownscale : upscale > 1 ? upscale : 1;
  const rewriteForByteLimit = maxSourceBytes && originalBytes > maxSourceBytes;

  if (scale === 1 && !rewriteForByteLimit) {
    return {
      resized: false,
      reason: "within source size bounds",
      scale,
      width,
      height,
    };
  }

  return {
    resized: true,
    reason: transformReason({ downscale, pixelDownscale, upscale, rewriteForByteLimit }),
    scale,
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function transformReason({ downscale, pixelDownscale, upscale, rewriteForByteLimit }) {
  if (downscale < 1 || pixelDownscale < 1) return "too large";
  if (upscale > 1) return "too small";
  if (rewriteForByteLimit) return "too large file";
  return "within source size bounds";
}

function archiveOriginalAndReplace({ context, originalName, originalBuffer, sentBuffer }) {
  const sourceOriginalsDir = context.sourceOriginalsDir;
  if (!sourceOriginalsDir) {
    return {
      originalArchive: { stored: false, reason: "sourceOriginalsDir not configured" },
      sampleReplacement: { replaced: false, reason: "sourceOriginalsDir not configured" },
    };
  }

  const samplePath = context.samplesDir ? join(context.samplesDir, basename(originalName)) : null;
  if (samplePath && existsSync(samplePath)) {
    const sampleBuffer = readFileSync(samplePath);
    if (sampleBuffer.equals(originalBuffer)) {
      const archiveDir = join(sourceOriginalsDir, "samples");
      mkdirSync(archiveDir, { recursive: true });
      const archivePath = uniquePath(archiveDir, originalName);
      renameSync(samplePath, archivePath);
      writeFileSync(samplePath, sentBuffer);
      return {
        originalArchive: { stored: true, kind: "sample", path: archivePath },
        sampleReplacement: { replaced: true, path: samplePath },
      };
    }
  }

  const archiveDir = join(sourceOriginalsDir, "uploads");
  mkdirSync(archiveDir, { recursive: true });
  const archivePath = uniquePath(archiveDir, originalName);
  writeFileSync(archivePath, originalBuffer);
  return {
    originalArchive: { stored: true, kind: "upload", path: archivePath },
    sampleReplacement: {
      replaced: false,
      reason: samplePath ? "uploaded bytes did not match sample file" : "not a sample library image",
    },
  };
}

function integerOption(value, fallback, label) {
  if (value === "" || value === undefined || value === null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw httpError(400, `${label} non valido`);
  }
  return number === 0 ? undefined : number;
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
  if (lowerMime.includes("pdf")) return "pdf";
  if (lowerMime.includes("postscript") || lowerMime.includes("eps")) return "eps";
  return "bin";
}

function inferMimeType(fileName) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".eps")) return "application/postscript";
  return "application/octet-stream";
}

function isVectorSource(fileName, mimeType) {
  const extension = extname(String(fileName || "")).toLowerCase();
  const lowerMime = String(mimeType || "").toLowerCase();
  return VECTOR_SOURCE_EXTENSIONS.has(extension) || lowerMime.includes("pdf") || lowerMime.includes("postscript");
}

function uniquePath(dir, originalName) {
  const parsed = parse(basename(String(originalName || "source")));
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

function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}
