import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSampleDirectory } from "../lib/source-preprocess.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const samplesDir = join(ROOT_DIR, "public", "samples");
const sourceOriginalsDir = join(ROOT_DIR, "source-originals");

const results = await normalizeSampleDirectory({
  samplesDir,
  sourceOriginalsDir,
  options: {
    maxSourceSidePx: process.env.SOURCE_MAX_SIDE_PX ?? 3000,
    minSourceSidePx: process.env.SOURCE_MIN_SIDE_PX ?? 500,
  },
});

const resized = results.filter((result) => result.resized);
console.log(
  JSON.stringify(
    {
      samples: results.length,
      resized: resized.length,
      resizedImages: resized.map((result) => ({
        name: result.name,
        reason: result.reason,
        before: `${result.original.width}x${result.original.height}`,
        after: `${result.sent.width}x${result.sent.height}`,
        archive: result.archive?.path,
      })),
    },
    null,
    2
  )
);
