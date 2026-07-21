import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export async function generateHistoryReport({ repoDir, dbPath = join(repoDir, "data", "history.sqlite"), reportsDir = join(repoDir, "reports"), generatedAt = new Date() } = {}) {
  if (!repoDir) throw new Error("repoDir is required to generate the history report");
  if (!existsSync(dbPath)) {
    throw new Error(`History database not found: ${dbPath}`);
  }

  mkdirSync(reportsDir, { recursive: true });

  const stamp = generatedAt.toISOString().replace(/[:.]/g, "-");
  const reportPath = join(reportsDir, `embroidery-tests-report-${stamp}.html`);
  const db = new DatabaseSync(dbPath);

  const compares = db
    .prepare(
      `SELECT id, created_at, title, mode, image_count, provider_count, success_count, total_count, results_json
       FROM compares
       ORDER BY created_at DESC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      title: row.title || "Provider comparison",
      mode: row.mode || "",
      imageCount: row.image_count,
      providerCount: row.provider_count,
      successCount: row.success_count,
      totalCount: row.total_count,
      source: "official",
      results: parseJson(row.results_json, []),
    }));

  const executions = db
    .prepare(
      `SELECT run_id, created_at, provider_id, mode, image_name, ok, status, error,
          options_json, source_json, result_json, run_files_json, preview_url, source_url
       FROM executions
       ORDER BY created_at DESC`
    )
    .all()
    .map((row) => ({
      runId: row.run_id,
      createdAt: row.created_at,
      providerId: row.provider_id,
      providerName: providerName(row.provider_id),
      mode: row.mode || "",
      imageName: row.image_name || "",
      ok: Boolean(row.ok),
      status: row.status,
      error: row.error,
      options: parseJson(row.options_json, null),
      source: parseJson(row.source_json, null),
      result: parseJson(row.result_json, null),
      runFiles: parseJson(row.run_files_json, []),
      previewUrl: row.preview_url,
      sourceUrl: row.source_url,
    }));

  db.close?.();

  const officialRunIds = new Set(compares.flatMap((compare) => compare.results.map(runIdOfResult).filter(Boolean)));
  const reconstructed = reconstructGroups(executions.filter((execution) => !officialRunIds.has(execution.runId)));
  const reconstructedRunIds = new Set(reconstructed.flatMap((group) => group.results.map(runIdOfResult).filter(Boolean)));

  const compareGroups = [...compares, ...reconstructed].sort((left, right) => {
    if (right.providerCount !== left.providerCount) return right.providerCount - left.providerCount;
    return new Date(right.createdAt) - new Date(left.createdAt);
  });

  const provider3 = withGroupReportIds(compareGroups.filter((group) => group.providerCount >= 3), "C3");
  const provider2 = withGroupReportIds(compareGroups.filter((group) => group.providerCount === 2), "C2");
  const singles = withSingleReportIds(
    executions
      .filter((execution) => !officialRunIds.has(execution.runId) && !reconstructedRunIds.has(execution.runId))
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
  );

  const html = buildReport({
    generatedAt,
    compares,
    reconstructed,
    provider3,
    provider2,
    singles,
    executions,
  });

  await writeFile(reportPath, html, "utf8");

  return {
    filePath: reportPath,
    fileName: basename(reportPath),
    url: `/reports/${encodeURIComponent(basename(reportPath))}`,
    generatedAt: generatedAt.toISOString(),
    compareCount: compares.length,
    reconstructedCount: reconstructed.length,
    executionCount: executions.length,
    singleCount: singles.length,
  };
}
function reconstructGroups(rows) {
  const sorted = [...rows].sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
  const clusters = [];
  const maxGapMs = 45_000;

  for (const execution of sorted) {
    const key = executionKey(execution);
    let target = null;

    for (let index = clusters.length - 1; index >= 0; index -= 1) {
      const cluster = clusters[index];
      if (cluster.key !== key) continue;
      const gap = new Date(execution.createdAt) - new Date(cluster.lastAt);
      if (gap >= 0 && gap <= maxGapMs) {
        target = cluster;
        break;
      }
      if (gap > maxGapMs) break;
    }

    if (!target) {
      target = { key, firstAt: execution.createdAt, lastAt: execution.createdAt, executions: [] };
      clusters.push(target);
    }

    target.executions.push(execution);
    target.lastAt = execution.createdAt;
  }

  return clusters
    .map((cluster) => {
      const providers = unique(cluster.executions.map((execution) => execution.providerId).filter(Boolean));
      return {
        id: `reconstructed-${safeId(cluster.firstAt)}-${safeId(cluster.key)}`,
        createdAt: cluster.firstAt,
        title: "Reconstructed comparison",
        mode: cluster.executions[0]?.mode || "",
        imageCount: unique(cluster.executions.map((execution) => execution.imageName).filter(Boolean)).length || 1,
        providerCount: providers.length,
        successCount: cluster.executions.filter((execution) => execution.ok).length,
        totalCount: cluster.executions.length,
        source: "reconstructed",
        results: cluster.executions.map(executionToResult),
      };
    })
    .filter((group) => group.providerCount >= 2)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function executionToResult(execution) {
  return {
    ok: execution.ok,
    providerId: execution.providerId,
    providerName: execution.providerName,
    image: { name: execution.imageName || sourceImageName(execution.source) },
    mode: execution.mode,
    options: execution.options,
    data: execution.ok
      ? {
          runId: execution.runId,
          designInfo: execution.result?.designInfo,
          runFiles: execution.runFiles,
        }
      : undefined,
    error: execution.error,
    runId: execution.runId,
    reportId: execution.reportId,
  };
}

function buildReport(data) {
  const byProvider = countBy(data.executions, (execution) => execution.providerId || "unknown");
  const okByProvider = countBy(
    data.executions.filter((execution) => execution.ok),
    (execution) => execution.providerId || "unknown"
  );

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Embroidery Lab - Report prove</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f8;
      --panel: #ffffff;
      --ink: #18202a;
      --muted: #617083;
      --line: #dfe4ea;
      --accent: #0d7c66;
      --accent-soft: #e5f5f1;
      --warn: #a85d00;
      --error: #b42318;
      --ok: #067647;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.45;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      padding: 18px 28px;
      border-bottom: 1px solid var(--line);
      background: rgba(255,255,255,.94);
      backdrop-filter: blur(8px);
    }
    header h1 { margin: 0; font-size: 24px; }
    header p { margin: 4px 0 0; color: var(--muted); }
    main { max-width: 1400px; margin: 0 auto; padding: 24px; }
    section { margin: 0 0 28px; }
    h2 { margin: 0 0 12px; font-size: 20px; }
    h3 { margin: 0 0 8px; font-size: 16px; }
    .summary-grid, .provider-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: var(--panel);
    }
    .metric span { display: block; color: var(--muted); font-size: 12px; }
    .metric strong { display: block; margin-top: 4px; font-size: 22px; }
    .group {
      margin: 0 0 18px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--panel);
      overflow: hidden;
    }
    .group > summary {
      cursor: pointer;
      list-style: none;
      padding: 16px 18px;
      border-bottom: 1px solid var(--line);
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
    }
    .group > summary::-webkit-details-marker { display: none; }
    .group[open] > summary { background: #fbfcfd; }
    .summary-title { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .summary-title strong { font-size: 16px; }
    .report-id {
      display: inline-flex;
      align-items: center;
      border-radius: 6px;
      padding: 3px 7px;
      background: #111827;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .02em;
    }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
    .badge {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 12px;
      color: var(--muted);
      background: #fff;
    }
    .badge.ok { color: var(--ok); background: #ecfdf3; border-color: #abefc6; }
    .badge.error { color: var(--error); background: #fef3f2; border-color: #fecdca; }
    .badge.source { color: var(--accent); background: var(--accent-soft); border-color: #b8ded5; }
    .group-body { padding: 16px 18px 18px; }
    .image-block {
      margin: 0 0 18px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fcfdfe;
    }
    .source-row {
      display: grid;
      grid-template-columns: minmax(160px, 260px) 1fr;
      gap: 14px;
      margin-bottom: 14px;
      align-items: start;
    }
    .source-card, .result-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      overflow: hidden;
    }
    .source-card img, .result-preview img, .overview-figure img {
      display: block;
      width: 100%;
      height: 220px;
      object-fit: contain;
      background: repeating-conic-gradient(#f3f4f6 0 25%, #fff 0 50%) 50% / 18px 18px;
    }
    .zoom-link {
      display: block;
      cursor: zoom-in;
      text-decoration: none;
      outline-offset: -3px;
    }
    .zoom-link:hover img { filter: saturate(1.05) contrast(1.02); }
    .source-card .caption, .result-card .caption { padding: 10px; border-top: 1px solid var(--line); }
    .caption small { color: var(--muted); display: block; word-break: break-all; }
    .result-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .result-card.error { border-color: #fecdca; }
    .result-head {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }
    .result-head strong { text-transform: capitalize; }
    .result-preview { min-height: 220px; background: #fafafa; display: grid; place-items: center; }
    .empty-preview { color: var(--muted); padding: 28px; text-align: center; }
    .error-box { color: var(--error); padding: 14px; border-top: 1px solid #fecdca; background: #fff7f6; }
    .kv {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 8px;
      padding: 10px 12px;
      border-top: 1px solid var(--line);
    }
    .kv div { border: 1px solid var(--line); border-radius: 6px; padding: 8px; }
    .kv span { display: block; color: var(--muted); font-size: 11px; }
    .kv strong { display: block; margin-top: 2px; font-size: 13px; word-break: break-word; }
    details.settings { border-top: 1px solid var(--line); }
    details.settings summary { cursor: pointer; padding: 10px 12px; color: var(--muted); }
    pre {
      margin: 0;
      padding: 12px;
      overflow: auto;
      max-height: 360px;
      background: #0f172a;
      color: #e2e8f0;
      font-size: 12px;
      line-height: 1.45;
    }
    .files {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 10px 12px;
      border-top: 1px solid var(--line);
    }
    .file {
      text-decoration: none;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 8px;
      color: var(--ink);
      font-size: 12px;
      background: #fbfcfd;
    }
    .single-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 12px;
    }
    .overview-actions {
      display: flex;
      justify-content: flex-end;
      margin: 0 0 12px;
    }
    .overview-button {
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      color: var(--ink);
      padding: 7px 10px;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    .overview-button:hover { border-color: #b8c3cf; background: #f8fafc; }
    .overview-panel {
      display: none;
      margin: 0 0 14px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
    .overview-panel.open { display: block; }
    .overview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      align-items: stretch;
    }
    .overview-figure {
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
    }
    .overview-figure img { height: 280px; }
    .overview-figure figcaption {
      padding: 9px 10px;
      border-top: 1px solid var(--line);
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }
    .overview-figure figcaption small { color: var(--muted); word-break: break-word; }
    .lightbox {
      position: fixed;
      inset: 0;
      z-index: 99;
      display: none;
      grid-template-rows: auto 1fr;
      background: rgba(15, 23, 42, .88);
      color: #fff;
    }
    .lightbox.open { display: grid; }
    .lightbox-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 16px;
      background: rgba(15, 23, 42, .96);
    }
    .lightbox-title { font-size: 14px; color: #e5e7eb; }
    .lightbox-close {
      border: 1px solid rgba(255,255,255,.35);
      border-radius: 7px;
      background: transparent;
      color: #fff;
      padding: 7px 10px;
      font: inherit;
      cursor: pointer;
    }
    .lightbox-body {
      min-height: 0;
      padding: 18px;
      display: grid;
      place-items: center;
    }
    .lightbox img {
      max-width: 96vw;
      max-height: 86vh;
      object-fit: contain;
      background: repeating-conic-gradient(#f3f4f6 0 25%, #fff 0 50%) 50% / 18px 18px;
      border-radius: 8px;
    }
    .note {
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      color: var(--muted);
      margin-bottom: 14px;
    }
    @media (max-width: 760px) {
      main { padding: 16px; }
      .source-row { grid-template-columns: 1fr; }
      .group > summary { grid-template-columns: 1fr; }
      .badges { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Embroidery Lab - report prove</h1>
    <p>Generato il ${escapeHtml(formatDate(data.generatedAt.toISOString()))}. Immagini e file sono linkati da <code>runs/</code>, senza incorporare base64 pesanti.</p>
  </header>
  <main>
    <section>
      <div class="summary-grid">
        ${metric("Compare ufficiali", data.compares.length)}
        ${metric("Compare ricostruiti", data.reconstructed.length)}
        ${metric("Esecuzioni totali", data.executions.length)}
        ${metric("Singole residue", data.singles.length)}
      </div>
      <div class="provider-grid">
        ${Object.keys(byProvider)
          .sort()
          .map((provider) => metric(providerName(provider), `${okByProvider[provider] || 0}/${byProvider[provider]} ok`))
          .join("")}
      </div>
      <div class="note">Ordine richiesto: prima confronti con 3 o piu provider, poi confronti a 2 provider, poi esecuzioni singole. I gruppi "ricostruiti" derivano da run ravvicinate con stessa immagine/modalita e provider diversi.</div>
      <div class="note">ID report: usa codici come <strong>C3-001</strong>, <strong>C2-004</strong> o <strong>S-018</strong> per indicarmi cosa rimuovere o rivedere. I risultati dentro un confronto hanno anche ID tipo <strong>C3-001-R02</strong>.</div>
    </section>

    <section>
      <h2>Confronti a 3 provider</h2>
      ${data.provider3.length ? data.provider3.map(renderCompare).join("") : emptyNote("Nessun confronto a 3 provider trovato.")}
    </section>

    <section>
      <h2>Confronti a 2 provider</h2>
      ${data.provider2.length ? data.provider2.map(renderCompare).join("") : emptyNote("Nessun confronto a 2 provider trovato.")}
    </section>

    <section>
      <h2>Esecuzioni singole</h2>
      <div class="single-list">
        ${data.singles.map(renderSingle).join("")}
      </div>
    </section>
  </main>
  <div class="lightbox" id="image-lightbox" aria-hidden="true">
    <div class="lightbox-bar">
      <div class="lightbox-title" id="image-lightbox-title">Preview</div>
      <button class="lightbox-close" type="button" data-lightbox-close>Close</button>
    </div>
    <div class="lightbox-body" data-lightbox-close>
      <img id="image-lightbox-img" alt="">
    </div>
  </div>
  <script>
    document.addEventListener("click", (event) => {
      const overviewButton = event.target.closest("[data-overview-target]");
      if (overviewButton) {
        const panel = document.getElementById(overviewButton.dataset.overviewTarget);
        if (panel) {
          const isOpen = panel.classList.toggle("open");
          overviewButton.textContent = isOpen ? "Nascondi overview" : "Overview immagini";
        }
        return;
      }

      const zoomLink = event.target.closest(".zoom-link");
      if (zoomLink) {
        event.preventDefault();
        openLightbox(zoomLink.getAttribute("href"), zoomLink.dataset.title || zoomLink.getAttribute("aria-label") || "Preview");
        return;
      }

      if (event.target.closest("[data-lightbox-close]")) {
        closeLightbox();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeLightbox();
    });

    function openLightbox(src, title) {
      const box = document.getElementById("image-lightbox");
      const img = document.getElementById("image-lightbox-img");
      const titleEl = document.getElementById("image-lightbox-title");
      img.src = src;
      img.alt = title;
      titleEl.textContent = title;
      box.classList.add("open");
      box.setAttribute("aria-hidden", "false");
    }

    function closeLightbox() {
      const box = document.getElementById("image-lightbox");
      if (!box) return;
      box.classList.remove("open");
      box.setAttribute("aria-hidden", "true");
    }
  </script>
</body>
</html>`;
}

function renderCompare(group) {
  const byImage = groupResultsByImage(group.results);
  const title = `${group.title} - ${formatDate(group.createdAt)}`;
  return `<details class="group" id="${escapeHtml(group.reportId)}" data-report-id="${escapeHtml(group.reportId)}" open>
    <summary>
      <div class="summary-title">
        <code class="report-id">${escapeHtml(group.reportId)}</code>
        <strong>${escapeHtml(title)}</strong>
        <span class="badge source">${group.source === "official" ? "salvato" : "ricostruito"}</span>
      </div>
      <div class="badges">
        <span class="badge">${group.providerCount} provider</span>
        <span class="badge">${group.imageCount} immagini</span>
        <span class="badge ${group.successCount === group.totalCount ? "ok" : "error"}">${group.successCount}/${group.totalCount} ok</span>
        <span class="badge">${escapeHtml(group.mode || "mode n/d")}</span>
      </div>
    </summary>
    <div class="group-body">
      ${Object.entries(byImage)
        .map(([imageName, results]) => renderImageComparison(imageName, results))
        .join("")}
    </div>
  </details>`;
}

function renderImageComparison(imageName, results) {
  const source = sourceUrlFromResults(results);
  const overviewId = `overview-${safeId(imageName)}-${safeId(results.map((result) => result.reportId || runIdOfResult(result)).join("-"))}`;
  return `<div class="image-block">
    <div class="overview-actions">
      <button class="overview-button" type="button" data-overview-target="${escapeHtml(overviewId)}">Overview immagini</button>
    </div>
    <div class="overview-panel" id="${escapeHtml(overviewId)}">
      <div class="overview-grid">
        ${overviewFigures(imageName, source, results)}
      </div>
    </div>
    <div class="source-row">
      <article class="source-card">
        ${source ? zoomableImage(source, `Source - ${imageName}`, `Source ${imageName}`) : `<div class="empty-preview">Source non disponibile</div>`}
        <div class="caption">
          <strong>Source</strong>
          <small>${escapeHtml(imageName || "Immagine non indicata")}</small>
        </div>
      </article>
      <div>
        <h3>${escapeHtml(imageName || "Immagine non indicata")}</h3>
        <div class="result-grid">
          ${results.map(renderResultCard).join("")}
        </div>
      </div>
    </div>
  </div>`;
}

function renderSingle(execution) {
  return renderResultCard(executionToResult(execution), true);
}

function renderResultCard(result, single = false) {
  const provider = result.providerName || providerName(result.providerId);
  const runId = runIdOfResult(result);
  const files = resultFiles(result);
  const preview = previewUrlFromFiles(files, result);
  const statusClass = result.ok ? "ok" : "error";
  const info = result.data?.designInfo;
  const reportId = result.reportId || runId || "n/d";

  return `<article class="result-card ${result.ok ? "" : "error"}" data-report-id="${escapeHtml(reportId)}">
    <div class="result-head">
      <div>
        <strong>${escapeHtml(provider)}</strong>
        <small>${escapeHtml(result.mode || "mode n/d")}${single ? ` / ${escapeHtml(result.image?.name || "")}` : ""}</small>
      </div>
      <div class="badges">
        <span class="badge source">${escapeHtml(reportId)}</span>
        <span class="badge ${statusClass}">${result.ok ? "ok" : "errore"}</span>
      </div>
    </div>
    <div class="result-preview">
      ${preview ? zoomableImage(preview, `${provider} - ${result.image?.name || "Preview"}`, `Preview ${provider}`) : `<div class="empty-preview">Preview non disponibile</div>`}
    </div>
    ${result.ok ? "" : `<div class="error-box">${escapeHtml(result.error || "Conversione fallita")}</div>`}
    ${metricsHtml(info, result)}
    ${settingsHtml(result.options)}
    ${filesHtml(files)}
    <div class="caption">
      <small>Run: ${escapeHtml(runId || "runId n/d")}</small>
    </div>
  </article>`;
}

function metricsHtml(info, result) {
  const metrics = extractMetrics(info, result);
  if (!metrics.length) return "";
  return `<div class="kv">${metrics
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("")}</div>`;
}

function settingsHtml(options) {
  const cleaned = redactSecrets(options || {});
  const hasSettings = cleaned && Object.keys(cleaned).length;
  if (!hasSettings) return `<details class="settings"><summary>Settings</summary><pre>{}</pre></details>`;
  return `<details class="settings"><summary>Settings request</summary><pre>${escapeHtml(JSON.stringify(cleaned, null, 2))}</pre></details>`;
}

function overviewFigures(imageName, source, results) {
  const sourceFigure = source
    ? overviewFigure("Source", imageName || "Immagine", source)
    : `<figure class="overview-figure"><div class="empty-preview">Source non disponibile</div><figcaption><strong>Source</strong><small>${escapeHtml(imageName || "Immagine")}</small></figcaption></figure>`;
  return [sourceFigure, ...results.map((result) => {
    const provider = result.providerName || providerName(result.providerId);
    const preview = previewUrlFromFiles(resultFiles(result), result);
    const label = result.reportId ? `${provider} (${result.reportId})` : provider;
    return preview
      ? overviewFigure(label, result.ok ? "Preview" : result.error || "Errore", preview)
      : `<figure class="overview-figure"><div class="empty-preview">Preview non disponibile</div><figcaption><strong>${escapeHtml(label)}</strong><small>${escapeHtml(result.error || "No preview")}</small></figcaption></figure>`;
  })].join("");
}

function overviewFigure(label, caption, url) {
  return `<figure class="overview-figure">
    ${zoomableImage(url, `${label} - ${caption}`, label)}
    <figcaption><strong>${escapeHtml(label)}</strong><small>${escapeHtml(caption || "")}</small></figcaption>
  </figure>`;
}

function zoomableImage(url, title, alt) {
  return `<a class="zoom-link" href="${escapeHtml(url)}" data-title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">` +
    `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt || title)}" loading="lazy">` +
  `</a>`;
}

function filesHtml(files) {
  if (!files.length) return "";
  return `<div class="files">${files
    .map((file) => `<a class="file" href="${escapeHtml(toReportUrl(file.url))}">${escapeHtml(file.kind || "file")}: ${escapeHtml(file.name)}</a>`)
    .join("")}</div>`;
}

function withGroupReportIds(groups, prefix) {
  return groups.map((group, groupIndex) => {
    const reportId = `${prefix}-${String(groupIndex + 1).padStart(3, "0")}`;
    return {
      ...group,
      reportId,
      results: group.results.map((result, resultIndex) => ({
        ...result,
        reportId: `${reportId}-R${String(resultIndex + 1).padStart(2, "0")}`,
      })),
    };
  });
}

function withSingleReportIds(items) {
  return items.map((item, index) => ({
    ...item,
    reportId: `S-${String(index + 1).padStart(3, "0")}`,
  }));
}

function extractMetrics(info, result) {
  const source = info || {};
  const metrics = [];
  const stitches = firstDefined(source.num_stitches, source.stitches, source.NumStitches, source.numberOfStitches);
  const colors = firstDefined(source.num_colours, source.num_colors, source.colors, source.NumColors, source.numberOfColors);
  const trims = firstDefined(source.num_trims, source.trims, source.NumTrims, source.numberOfTrims);
  const width = firstDefined(source.widthMm, source.width_mm, source.width, source.Width);
  const height = firstDefined(source.heightMm, source.height_mm, source.height, source.Height);
  const colorChanges = firstDefined(source.num_colour_changes, source.color_changes, source.NumColorChanges);

  if (stitches !== undefined) metrics.push(["Stitches", stitches]);
  if (colors !== undefined) metrics.push(["Colors", colors]);
  if (trims !== undefined) metrics.push(["Trims", trims]);
  if (colorChanges !== undefined) metrics.push(["Color changes", colorChanges]);
  if (width !== undefined && height !== undefined) metrics.push(["Size", `${round(width)} x ${round(height)}`]);
  if (result.variantName) metrics.push(["Variant", result.variantName]);
  if (result.variantValue) metrics.push(["Variant value", result.variantValue]);
  return metrics;
}

function groupResultsByImage(results) {
  const grouped = {};
  for (const result of results) {
    const imageName = result.image?.name || "Unknown image";
    grouped[imageName] ||= [];
    grouped[imageName].push(result);
  }
  return grouped;
}

function sourceUrlFromResults(results) {
  for (const result of results) {
    const source = sourceUrlFromFiles(resultFiles(result));
    if (source) return source;
  }
  return "";
}

function sourceUrlFromFiles(files) {
  const preferred = files.find((file) => file.kind === "source-sent" && basename(decodeURIComponent(file.url || file.name)).startsWith("source-sent"));
  const fallback = files.find((file) => file.kind === "source-sent");
  return preferred || fallback ? toReportUrl((preferred || fallback).url) : "";
}

function previewUrlFromFiles(files, result) {
  const preferred = files.find((file) => file.kind === "preview" && /preview|trueview/i.test(file.name));
  const fallback = files.find((file) => file.kind === "preview");
  return preferred || fallback ? toReportUrl((preferred || fallback).url) : result.previewUrl ? toReportUrl(result.previewUrl) : "";
}

function resultFiles(result) {
  return result.data?.runFiles || result.runFiles || [];
}

function runIdOfResult(result) {
  return result?.data?.runId || result?.runId || "";
}

function executionKey(execution) {
  const image = execution.imageName || sourceImageName(execution.source) || "unknown";
  return `${image}::${execution.mode || "unknown"}`;
}

function sourceImageName(source) {
  return source?.original?.name || source?.sent?.name || "";
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toReportUrl(url) {
  if (!url) return "";
  if (url.startsWith("/runs/")) return `..${url}`;
  return url;
}

function redactSecrets(value, key = "") {
  if (value === null || value === undefined) return value;
  if (secretKey(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactSecrets(entryValue, entryKey)]));
  }
  if (typeof value === "string" && looksLikeSecret(value)) return "[redacted]";
  return value;
}

function secretKey(key) {
  return /key|token|secret|password|license|authorization|apikey|api_key/i.test(key);
}

function looksLikeSecret(value) {
  return /^[A-Z0-9]{5,}-[A-Z0-9]{5,}-[A-Z0-9-]{5,}$/i.test(value) || /^[a-f0-9]{24,}$/i.test(value);
}

function countBy(items, getter) {
  const result = {};
  for (const item of items) {
    const key = getter(item);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function emptyNote(text) {
  return `<div class="note">${escapeHtml(text)}</div>`;
}

function providerName(providerId) {
  return (
    {
      wilcom: "Wilcom EWA",
      pulse: "PulseID",
      melco: "Melco Cloud",
      zsk: "ZSK",
    }[providerId] || providerId || "Unknown"
  );
}

function unique(values) {
  return [...new Set(values)];
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1).replace(/\.0$/, "") : value;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/Rome",
  }).format(new Date(value));
}

function safeId(value) {
  return String(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}



