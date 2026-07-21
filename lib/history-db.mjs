import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

let db;

export function openHistoryDatabase(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS executions (
      run_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      mode TEXT,
      image_name TEXT,
      ok INTEGER NOT NULL,
      status INTEGER,
      error TEXT,
      options_json TEXT,
      source_json TEXT,
      result_json TEXT,
      run_files_json TEXT,
      preview_url TEXT,
      source_url TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_executions_provider_id ON executions(provider_id);

    CREATE TABLE IF NOT EXISTS compares (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      title TEXT,
      mode TEXT,
      image_count INTEGER NOT NULL,
      provider_count INTEGER NOT NULL,
      success_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      summary_json TEXT,
      results_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_compares_created_at ON compares(created_at DESC);
  `);
}

export function recordExecution(record) {
  const database = getDatabase();
  const runFiles = normalizeRunFiles(record.runFiles ?? []);
  const sourcePreprocess = record.sourcePreprocess ?? record.sourcePreprocessManifest ?? null;
  const options = record.options ?? null;
  const result = record.result ? summarizeResult(record.result) : null;
  const error = record.error ? errorMessage(record.error) : null;
  const createdAt = record.createdAt ?? timestampFromRunId(record.runId) ?? new Date().toISOString();
  const imageName =
    record.image?.name ??
    sourcePreprocess?.original?.name ??
    sourcePreprocess?.sent?.name ??
    "";

  database
    .prepare(
      `INSERT OR REPLACE INTO executions (
        run_id, created_at, provider_id, mode, image_name, ok, status, error,
        options_json, source_json, result_json, run_files_json, preview_url, source_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      record.runId,
      createdAt,
      record.providerId,
      options?.mode ?? record.mode ?? null,
      imageName,
      record.ok ? 1 : 0,
      record.status ?? (record.ok ? 200 : 500),
      error,
      json(options),
      json(sourcePreprocess),
      json(result),
      json(runFiles),
      fileUrlByKind(runFiles, "preview"),
      fileUrlByKind(runFiles, "source-sent")
    );
}

export function listExecutions({ limit = 100 } = {}) {
  return getDatabase()
    .prepare(
      `SELECT run_id, created_at, provider_id, mode, image_name, ok, status, error,
        options_json, source_json, result_json, run_files_json, preview_url, source_url
       FROM executions
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit)
    .map(executionRow);
}

export function recordCompare(compare) {
  const database = getDatabase();
  const id = compare.id ?? createHistoryId("cmp");
  const createdAt = compare.createdAt ?? new Date().toISOString();
  const results = Array.isArray(compare.results) ? compare.results.map(sanitizeCompareResult) : [];
  const imageCount = new Set(results.map((result) => result.image?.name).filter(Boolean)).size;
  const providerCount = new Set(results.map((result) => result.providerId).filter(Boolean)).size;
  const successCount = results.filter((result) => result.ok).length;
  const totalCount = results.length;
  const summary = {
    id,
    title: compare.title ?? "Comparison",
    createdAt,
    mode: compare.mode ?? "",
    imageCount,
    providerCount,
    successCount,
    totalCount,
  };

  database
    .prepare(
      `INSERT OR REPLACE INTO compares (
        id, created_at, title, mode, image_count, provider_count, success_count,
        total_count, summary_json, results_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      createdAt,
      summary.title,
      summary.mode,
      imageCount,
      providerCount,
      successCount,
      totalCount,
      json(summary),
      json(results)
    );

  return { ...summary, results };
}

export function listCompares({ limit = 50 } = {}) {
  return getDatabase()
    .prepare(
      `SELECT id, created_at, title, mode, image_count, provider_count, success_count, total_count
       FROM compares
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit)
    .map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      title: row.title,
      mode: row.mode,
      imageCount: row.image_count,
      providerCount: row.provider_count,
      successCount: row.success_count,
      totalCount: row.total_count,
    }));
}

export function getCompare(id) {
  const row = getDatabase()
    .prepare(
      `SELECT id, created_at, title, mode, image_count, provider_count, success_count,
        total_count, summary_json, results_json
       FROM compares
       WHERE id = ?`
    )
    .get(id);

  if (!row) return null;

  return {
    id: row.id,
    createdAt: row.created_at,
    title: row.title,
    mode: row.mode,
    imageCount: row.image_count,
    providerCount: row.provider_count,
    successCount: row.success_count,
    totalCount: row.total_count,
    summary: parseJson(row.summary_json, {}),
    results: parseJson(row.results_json, []),
  };
}

export function backfillExecutionsFromRuns(runsDir) {
  if (!existsSync(runsDir)) return;

  for (const entry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runId = entry.name;
    if (executionHasDetails(runId)) continue;

    const runDir = join(runsDir, runId);
    const providerId = providerFromRunId(runId);
    if (!providerId) continue;

    const sourcePreprocess = readJsonIfExists(join(runDir, "source.json"));
    const errorLog = readJsonIfExists(join(runDir, "error.json"));
    const runFiles = runFilesFromDirectory(runId, runDir);

    recordExecution({
      runId,
      providerId,
      createdAt: timestampFromRunId(runId),
      ok: !errorLog,
      status: errorLog?.status ?? (errorLog ? 500 : 200),
      error: errorLog?.error?.message,
      image: errorLog?.image ?? sourcePreprocess?.original,
      options: errorLog?.options,
      sourcePreprocess,
      runFiles,
    });
  }
}

export function runFilesFromDirectory(runId, runDir) {
  if (!existsSync(runDir)) return [];

  return readdirSync(runDir)
    .map((name) => join(runDir, name))
    .filter((path) => statSync(path).isFile())
    .map((path) => {
      const name = basename(path);
      return {
        name,
        kind: inferRunFileKind(name),
        url: `/runs/${runId}/${encodeURIComponent(name)}`,
      };
    })
    .sort((left, right) => `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`));
}

function executionHasDetails(runId) {
  const row = getDatabase()
    .prepare("SELECT options_json, result_json FROM executions WHERE run_id = ?")
    .get(runId);
  if (!row) return false;

  return hasUsefulJson(row.options_json) || hasUsefulJson(row.result_json);
}

function hasUsefulJson(value) {
  return Boolean(value && value !== "null" && value !== "{}");
}

function executionRow(row) {
  return {
    runId: row.run_id,
    createdAt: row.created_at,
    providerId: row.provider_id,
    mode: row.mode,
    imageName: row.image_name,
    ok: Boolean(row.ok),
    status: row.status,
    error: row.error,
    options: parseJson(row.options_json, null),
    source: parseJson(row.source_json, null),
    result: parseJson(row.result_json, null),
    runFiles: parseJson(row.run_files_json, []),
    previewUrl: row.preview_url,
    sourceUrl: row.source_url,
  };
}

function sanitizeCompareResult(result) {
  return {
    ok: Boolean(result.ok),
    providerId: result.providerId,
    providerName: result.providerName,
    variantName: result.variantName,
    variantKey: result.variantKey,
    variantValue: result.variantValue,
    sourceType: result.sourceType ?? (result.image?.text ? "text" : "image"),
    image: {
      name: result.image?.name ?? "",
      text: result.image?.text,
    },
    mode: result.mode,
    options: result.options,
    data: result.ok
      ? {
          runId: result.data?.runId,
          designInfo: result.data?.designInfo,
          runFiles: normalizeRunFiles(result.data?.runFiles ?? []),
        }
      : undefined,
    error: result.ok ? undefined : result.error,
    runId: result.runId,
    logFile: result.logFile,
    upstreamResponse: result.upstreamResponse,
  };
}

function summarizeResult(result) {
  return {
    provider: result.provider,
    designInfo: result.designInfo,
    fileCount: Array.isArray(result.files) ? result.files.length : 0,
  };
}

function normalizeRunFiles(files) {
  return files
    .filter((file) => file?.name && file?.url)
    .map((file) => ({
      name: file.name,
      kind: file.kind ?? inferRunFileKind(file.name),
      url: file.url,
    }));
}

function fileUrlByKind(files, kind) {
  return files.find((file) => file.kind === kind)?.url ?? null;
}

function inferRunFileKind(name) {
  const lower = name.toLowerCase();
  if (lower === "error.json") return "error";
  if (lower.startsWith("source-sent.") || lower.includes("source-sent.")) return "source-sent";
  if (lower.endsWith("source.json")) return "source-info";
  if (lower.includes("request")) return "request";
  if (lower.includes("response")) return "response";
  if (lower.includes("metadata") || lower === "design-info.json") return "metadata";
  if (lower.includes("preview") || lower === "trueview.png") return "preview";
  if ([".emb", ".dst", ".pes", ".exp", ".jef", ".ofm", ".z00", ".pxf", ".tcf", ".pcf"].includes(extname(lower))) return "design";
  if ([".png", ".jpg", ".jpeg"].includes(extname(lower))) return "preview";
  return "file";
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function providerFromRunId(runId) {
  return runId.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-([a-z0-9]+)-/i)?.[1] ?? null;
}

function timestampFromRunId(runId) {
  const match = runId.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!match) return null;
  return `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
}

function createHistoryId(prefix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${random}`;
}

function getDatabase() {
  if (!db) throw new Error("History database not opened");
  return db;
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function errorMessage(error) {
  if (typeof error === "string") return error;
  return error?.message ?? "Conversion failed";
}
