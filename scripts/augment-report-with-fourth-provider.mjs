import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const repoDir = process.argv[2];
const outputDir = process.argv[3];
if (!repoDir || !outputDir) {
  throw new Error("Usage: node augment-report-with-fourth-provider.mjs <repoDir> <outputDir> [baseReportPath] [baseManifestPath]");
}

const require = createRequire(join(repoDir, "package.json"));
const sharp = require("sharp");
const reportsDir = join(repoDir, "reports");
const reportName = "three-provider-successful-executions.html";
const manifestName = "three-provider-successful-executions-manifest.json";
const baseReportPath = process.argv[4] || join(reportsDir, reportName);
const baseManifestPath = process.argv[5] || join(reportsDir, manifestName);
const mappedResultsDir = join(reportsDir, "fourth-provider-comparison", "mapped-results");
const mapping = JSON.parse(readFileSync(join(mappedResultsDir, "mapping.json"), "utf8"));
let html = readFileSync(baseReportPath, "utf8");

if (html.includes('data-provider-id="printful"')) {
  throw new Error("The report already contains Printful results");
}

for (const entry of mapping.mappings) {
  const previewPath = join(mappedResultsDir, entry.normalizedResultFile);
  if (!existsSync(previewPath)) throw new Error(`Missing mapped result: ${previewPath}`);
  const dataUri = await imageDataUri(previewPath);
  html = insertResultCard(html, entry.sourceId, dataUri);
}

html = html
  .replaceAll("All historical executions with all three providers", "All historical executions with four-provider comparison")
  .replace(
    "The complete execution history was analyzed. Every source shown below has three successful results: Wilcom EWA, PulseID and Melco Cloud. Sources missing even one provider are excluded entirely.",
    "The complete execution history was analyzed. Every source shown below contains successful Wilcom EWA, PulseID and Melco Cloud results, plus the supplied Printful preview."
  )
  .replace(/<span><b>57<\/b> successful results<\/span>/, "<span><b>76</b> comparison results</span>")
  .replace(/<span><b>3\/3<\/b> providers per source<\/span>/, "<span><b>4/4</b> providers per source</span>")
  .replaceAll("across three providers", "across four providers")
  .replace(
    /(<span>Complete sources <b>(\d+)<\/b><\/span><span>Provider results <b>)\d+(<\/b><\/span>)/g,
    (_, prefix, sourceCount, suffix) => `${prefix}${Number(sourceCount) * 4}${suffix}`
  )
  .replace(
    "19 complete source executions, each containing Wilcom EWA, PulseID and Melco Cloud.",
    "19 complete source executions, each containing Wilcom EWA, PulseID, Melco Cloud and the supplied Printful preview."
  )
  .replace(
    ".results-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}",
    ".results-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.results-grid.result-count-3{grid-template-columns:repeat(3,minmax(0,1fr))}"
  )
  .replace(
    ".overview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}",
    ".overview-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}"
  )
  .replace(
    ".result-head{margin-bottom:9px}",
    ".result-head{margin-bottom:9px}.manual-note{margin:10px 0 0;color:var(--muted);font-size:12px}"
  );

html = html.replace(
  /<header>[\s\S]*?<\/header>/,
  `<header><div><h1>Embroidery Lab</h1><p>Provider comparison for embroidery previews</p></div></header>`
);

const manifest = JSON.parse(readFileSync(baseManifestPath, "utf8"));
manifest.generatedAt = new Date().toISOString();
manifest.criteria.fourthProviderPreviewAvailablePerSource = true;
manifest.criteria.fourthProviderPreviewSource = "manual Printful mapped results";
manifest.resultCount += mapping.resultCount;
for (const comparison of manifest.comparisons) {
  if (!comparison.providersPerSource.includes("printful")) comparison.providersPerSource.push("printful");
  comparison.resultCount += comparison.sourceExecutionCount;
}
manifest.fourthProvider = {
  id: "printful",
  label: "Printful",
  integrationType: "manually supplied previews",
  mappingFile: "fourth-provider-comparison/mapped-results/mapping.json",
  resultCount: mapping.resultCount,
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, reportName), html, "utf8");
writeFileSync(join(outputDir, manifestName), JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify({
  report: reportName,
  sessions: manifest.compareCount,
  sources: manifest.sourceExecutionCount,
  results: manifest.resultCount,
  fourthProviderResults: mapping.resultCount,
}, null, 2));

function insertResultCard(document, sourceId, dataUri) {
  const startToken = `<article class="source-group" id="${sourceId}">`;
  const start = document.indexOf(startToken);
  if (start < 0) throw new Error(`Source group not found in report: ${sourceId}`);
  const nextSource = document.indexOf('<article class="source-group"', start + startToken.length);
  const sectionClose = document.indexOf("</section>", start);
  const boundary = [nextSource, sectionClose].filter((value) => value >= 0).sort((left, right) => left - right)[0];
  if (boundary === undefined) throw new Error(`Source group boundary not found: ${sourceId}`);
  let segment = document.slice(start, boundary).replace("result-count-3", "result-count-4");
  const sourceClose = segment.lastIndexOf("</article>");
  if (sourceClose < 0) throw new Error(`Source group is not closed: ${sourceId}`);
  const sourceLayoutClose = segment.lastIndexOf("</div>", sourceClose);
  const resultsGridClose = segment.lastIndexOf("</div>", sourceLayoutClose - 1);
  if (resultsGridClose < 0) throw new Error(`Results grid not found: ${sourceId}`);
  const card = `\n<article class="result-card manual-result" id="${sourceId}-R04" data-provider-id="printful">
    <div class="result-head"><div><code>${sourceId}-R04</code><h4>Printful</h4></div><span class="ok">Provided</span></div>
    <button class="image-button" type="button" data-label="Printful result"><img src="${dataUri}" alt="Printful result"></button>
    <p class="manual-note">Printful preview supplied for manual comparison. API request, response and settings were not provided.</p>
  </article>\n      `;
  segment = `${segment.slice(0, resultsGridClose)}${card}${segment.slice(resultsGridClose)}`;
  return `${document.slice(0, start)}${segment}${document.slice(boundary)}`;
}

async function imageDataUri(path) {
  const optimized = await sharp(path)
    .rotate()
    .resize({ width: 1400, height: 1100, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
  return `data:image/webp;base64,${optimized.toString("base64")}`;
}




