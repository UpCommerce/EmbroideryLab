const state = {
  providers: [],
  samples: [],
  selectedSampleName: "",
  provider: "wilcom",
  mode: "trueview",
  image: null,
  wilcomPaletteEdited: false,
  comparison: {
    uploads: [],
    selectedSampleNames: new Set(),
    selectedProviderIds: new Set(),
    results: [],
    mode: "trueview",
    wilcomThreadChart: undefined,
    wilcomPaletteEdited: false,
  },
};

const DEFAULT_SAMPLE_URL = "/samples/example.png";
const DEFAULT_SAMPLE_NAME = "example.png";
const DEFAULT_TARGET_WIDTH_MM = "90";
const DEFAULT_TARGET_HEIGHT_MM = "45";
const AUTO_THREAD_PALETTE_SIZE = 8;

const pulseThreadTypeVariants = [
  { value: "ttPolyester", label: "Polyester" },
  { value: "ttRayon", label: "Rayon" },
  { value: "ttCotton", label: "Cotton" },
  { value: "ttNylon", label: "Nylon" },
  { value: "ttMetallic", label: "Metallic" },
];

const pulseDefaultOptions = {
  runType: "full",
  ignoreSmallAreas: true,
  createSatinAndSteil: true,
  addSteilBorders: false,
  generateBackground: false,
  sequenceType: "stMinimizeColorChanges",
  trimType: "ttAlways",
  lockType: "ltAroundTrim",
  renderWidth: "1100",
  renderHeight: "1600",
  renderPadding: "40",
  timeoutSeconds: "60",
  recipe: "Normal",
  proportionalResize: true,
  lightenShadows: false,
  transparentPreview: true,
  useImageDimensions: false,
};

const providerFormats = {
  wilcom: ["emb", "dst", "pes", "exp", "jef"],
  pulse: ["dst", "pes", "pxf", "tcf", "z00", "pcf"],
  melco: ["ofm", "exp", "dst"],
  zsk: ["z00", "dst"],
};

const els = {
  providerStatus: document.querySelector("#provider-status"),
  historyButton: document.querySelector("#history-button"),
  compareButton: document.querySelector("#compare-button"),
  providerTabs: document.querySelector("#provider-tabs"),
  modeButtons: document.querySelectorAll("[data-mode]"),
  fileInput: document.querySelector("#file-input"),
  dropZone: document.querySelector("#drop-zone"),
  fileName: document.querySelector("#file-name"),
  sampleButton: document.querySelector("#sample-button"),
  sampleGrid: document.querySelector("#sample-grid"),
  sourceImage: document.querySelector("#source-image"),
  sourceEmpty: document.querySelector("#source-empty"),
  runButton: document.querySelector("#run-button"),
  statusBox: document.querySelector("#status-box"),
  resultImage: document.querySelector("#result-image"),
  resultEmpty: document.querySelector("#result-empty"),
  runId: document.querySelector("#run-id"),
  metrics: document.querySelector("#metrics"),
  files: document.querySelector("#files"),
  requestXml: document.querySelector("#request-xml"),
  compareDialog: document.querySelector("#compare-dialog"),
  compareClose: document.querySelector("#compare-close"),
  compareFileInput: document.querySelector("#compare-file-input"),
  compareUploadList: document.querySelector("#compare-upload-list"),
  compareSampleGrid: document.querySelector("#compare-sample-grid"),
  compareProviderList: document.querySelector("#compare-provider-list"),
  compareMode: document.querySelector("#compare-mode"),
  compareRunButton: document.querySelector("#compare-run-button"),
  compareStatus: document.querySelector("#compare-status"),
  comparisonDialog: document.querySelector("#comparison-dialog"),
  comparisonClose: document.querySelector("#comparison-close"),
  comparisonSection: document.querySelector("#comparison-section"),
  comparisonSummary: document.querySelector("#comparison-summary"),
  comparisonGrid: document.querySelector("#comparison-grid"),
  comparisonRecapButton: document.querySelector("#comparison-recap-button"),
  comparisonHtmlRecapButton: document.querySelector("#comparison-html-recap-button"),
  historyDialog: document.querySelector("#history-dialog"),
  historyClose: document.querySelector("#history-close"),
  historySummary: document.querySelector("#history-summary"),
  historyCompares: document.querySelector("#history-compares"),
  historyComparesCount: document.querySelector("#history-compares-count"),
  historyExecutions: document.querySelector("#history-executions"),
  historyExecutionsCount: document.querySelector("#history-executions-count"),
  targetSizeRow: document.querySelector("#target-size-row"),
  sourceMaxSide: document.querySelector("#source-max-side"),
  sourceMinSide: document.querySelector("#source-min-side"),
  widthMm: document.querySelector("#width-mm"),
  heightMm: document.querySelector("#height-mm"),
  formatBlock: document.querySelector("#format-block"),
  designFormat: document.querySelector("#design-format"),
  dpi: document.querySelector("#dpi"),
  wilcomOptions: document.querySelector("#wilcom-options"),
  wilcomInputKind: document.querySelector("#wilcom-input-kind"),
  wilcomUseSourceDpi: document.querySelector("#wilcom-use-source-dpi"),
  wilcomDesignVersionBlock: document.querySelector("#wilcom-design-version-block"),
  wilcomDesignVersion: document.querySelector("#wilcom-design-version"),
  wilcomColorSource: document.querySelector("#wilcom-color-source"),
  wilcomThreadChartBlock: document.querySelector("#wilcom-thread-chart-block"),
  wilcomThreadChart: document.querySelector("#wilcom-thread-chart"),
  wilcomThreadChartName: document.querySelector("#wilcom-thread-chart-name"),
  threadPaletteBlock: document.querySelector("#thread-palette-block"),
  threads: document.querySelector("#threads"),
  swatches: document.querySelector("#swatches"),
  removeBackgroundToggle: document.querySelector("#remove-background-toggle"),
  removeBackground: document.querySelector("#remove-background"),
  pulseOptions: document.querySelector("#pulse-options"),
  pulseRunType: document.querySelector("#pulse-run-type"),
  pulseTimeoutSeconds: document.querySelector("#pulse-timeout-seconds"),
  pulseThreadType: document.querySelector("#pulse-thread-type"),
  pulseThreadTypeCompareButton: document.querySelector("#pulse-thread-type-compare-button"),
  pulseThreadThickness: document.querySelector("#pulse-thread-thickness"),
  pulseIgnoreSmallAreas: document.querySelector("#pulse-ignore-small-areas"),
  pulseCreateSatin: document.querySelector("#pulse-create-satin"),
  pulseAddSteilBorders: document.querySelector("#pulse-add-steil-borders"),
  pulseGenerateBackground: document.querySelector("#pulse-generate-background"),
  pulseSequenceType: document.querySelector("#pulse-sequence-type"),
  pulseTrimType: document.querySelector("#pulse-trim-type"),
  pulseLockType: document.querySelector("#pulse-lock-type"),
  pulseTrimThreshold: document.querySelector("#pulse-trim-threshold"),
  pulseMaximumRunWidth: document.querySelector("#pulse-maximum-run-width"),
  pulseMaximumSatinWidth: document.querySelector("#pulse-maximum-satin-width"),
  pulseMaximumSteilWidth: document.querySelector("#pulse-maximum-steil-width"),
  pulseNumColors: document.querySelector("#pulse-num-colors"),
  pulseRenderWidth: document.querySelector("#pulse-render-width"),
  pulseRenderHeight: document.querySelector("#pulse-render-height"),
  pulseRenderPadding: document.querySelector("#pulse-render-padding"),
  pulseRecipe: document.querySelector("#pulse-recipe"),
  pulseProportionalResize: document.querySelector("#pulse-proportional-resize"),
  pulseLightenShadows: document.querySelector("#pulse-lighten-shadows"),
  pulseTransparentPreview: document.querySelector("#pulse-transparent-preview"),
  pulseUseImageDimensions: document.querySelector("#pulse-use-image-dimensions"),
  melcoOptions: document.querySelector("#melco-options"),
  melcoUseDefaultSize: document.querySelector("#melco-use-default-size"),
  zskOptions: document.querySelector("#zsk-options"),
  zskImageType: document.querySelector("#zsk-image-type"),
  zskOptimizeTolerance: document.querySelector("#zsk-optimize-tolerance"),
  zskRemoveArea: document.querySelector("#zsk-remove-area"),
  zskMaxColors: document.querySelector("#zsk-max-colors"),
  zskVectorTolerance: document.querySelector("#zsk-vector-tolerance"),
  zskSmoothing: document.querySelector("#zsk-smoothing"),
  zskDetermineBackground: document.querySelector("#zsk-determine-background"),
  zskBackgroundColor: document.querySelector("#zsk-background-color"),
  zskBackgroundFill: document.querySelector("#zsk-background-fill"),
  zskLineWidth: document.querySelector("#zsk-line-width"),
  zskSatinStitchWidth: document.querySelector("#zsk-satin-stitch-width"),
  zskOverlap: document.querySelector("#zsk-overlap"),
  zskMinimumAreaSize: document.querySelector("#zsk-minimum-area-size"),
  zskMinimumHoleSize: document.querySelector("#zsk-minimum-hole-size"),
  zskMinimumLineLength: document.querySelector("#zsk-minimum-line-length"),
  zskThreadCones: document.querySelector("#zsk-thread-cones"),
  compareProviderOptions: document.querySelector(".compare-provider-options"),
  compareSourceMaxSide: document.querySelector("#compare-source-max-side"),
  compareSourceMinSide: document.querySelector("#compare-source-min-side"),
  compareWidthMm: document.querySelector("#compare-width-mm"),
  compareHeightMm: document.querySelector("#compare-height-mm"),
  compareWilcomOptions: document.querySelector("#compare-wilcom-options"),
  compareWilcomFormatBlock: document.querySelector("#compare-wilcom-format-block"),
  compareWilcomFormat: document.querySelector("#compare-wilcom-format"),
  compareWilcomInputKind: document.querySelector("#compare-wilcom-input-kind"),
  compareWilcomDpi: document.querySelector("#compare-wilcom-dpi"),
  compareWilcomDesignVersionBlock: document.querySelector("#compare-wilcom-design-version-block"),
  compareWilcomDesignVersion: document.querySelector("#compare-wilcom-design-version"),
  compareWilcomColorSource: document.querySelector("#compare-wilcom-color-source"),
  compareWilcomUseSourceDpi: document.querySelector("#compare-wilcom-use-source-dpi"),
  compareWilcomRemoveBackground: document.querySelector("#compare-wilcom-remove-background"),
  compareWilcomPaletteBlock: document.querySelector("#compare-wilcom-palette-block"),
  compareWilcomSwatches: document.querySelector("#compare-wilcom-swatches"),
  compareWilcomThreads: document.querySelector("#compare-wilcom-threads"),
  compareWilcomThreadChartBlock: document.querySelector("#compare-wilcom-thread-chart-block"),
  compareWilcomThreadChart: document.querySelector("#compare-wilcom-thread-chart"),
  compareWilcomThreadChartName: document.querySelector("#compare-wilcom-thread-chart-name"),
  comparePulseOptions: document.querySelector("#compare-pulse-options"),
  comparePulseFormatBlock: document.querySelector("#compare-pulse-format-block"),
  comparePulseFormat: document.querySelector("#compare-pulse-format"),
  comparePulseRunType: document.querySelector("#compare-pulse-run-type"),
  comparePulseTimeoutSeconds: document.querySelector("#compare-pulse-timeout-seconds"),
  comparePulseThreadType: document.querySelector("#compare-pulse-thread-type"),
  comparePulseThreadThickness: document.querySelector("#compare-pulse-thread-thickness"),
  comparePulseNumColors: document.querySelector("#compare-pulse-num-colors"),
  comparePulseIgnoreSmallAreas: document.querySelector("#compare-pulse-ignore-small-areas"),
  comparePulseCreateSatin: document.querySelector("#compare-pulse-create-satin"),
  comparePulseAddSteilBorders: document.querySelector("#compare-pulse-add-steil-borders"),
  comparePulseGenerateBackground: document.querySelector("#compare-pulse-generate-background"),
  comparePulseUseImageDimensions: document.querySelector("#compare-pulse-use-image-dimensions"),
  comparePulseSequenceType: document.querySelector("#compare-pulse-sequence-type"),
  comparePulseTrimType: document.querySelector("#compare-pulse-trim-type"),
  comparePulseLockType: document.querySelector("#compare-pulse-lock-type"),
  comparePulseTrimThreshold: document.querySelector("#compare-pulse-trim-threshold"),
  comparePulseMaximumRunWidth: document.querySelector("#compare-pulse-maximum-run-width"),
  comparePulseMaximumSatinWidth: document.querySelector("#compare-pulse-maximum-satin-width"),
  comparePulseMaximumSteilWidth: document.querySelector("#compare-pulse-maximum-steil-width"),
  comparePulseRecipe: document.querySelector("#compare-pulse-recipe"),
  comparePulseRenderWidth: document.querySelector("#compare-pulse-render-width"),
  comparePulseRenderHeight: document.querySelector("#compare-pulse-render-height"),
  comparePulseRenderPadding: document.querySelector("#compare-pulse-render-padding"),
  comparePulseProportionalResize: document.querySelector("#compare-pulse-proportional-resize"),
  comparePulseLightenShadows: document.querySelector("#compare-pulse-lighten-shadows"),
  comparePulseTransparentPreview: document.querySelector("#compare-pulse-transparent-preview"),
  compareMelcoOptions: document.querySelector("#compare-melco-options"),
  compareMelcoFormatBlock: document.querySelector("#compare-melco-format-block"),
  compareMelcoFormat: document.querySelector("#compare-melco-format"),
  compareMelcoUseDefaultSize: document.querySelector("#compare-melco-use-default-size"),
  compareZskOptions: document.querySelector("#compare-zsk-options"),
  compareZskFormatBlock: document.querySelector("#compare-zsk-format-block"),
  compareZskFormat: document.querySelector("#compare-zsk-format"),
  compareZskImageType: document.querySelector("#compare-zsk-image-type"),
  compareZskMaxColors: document.querySelector("#compare-zsk-max-colors"),
  compareZskOptimizeTolerance: document.querySelector("#compare-zsk-optimize-tolerance"),
  compareZskRemoveArea: document.querySelector("#compare-zsk-remove-area"),
  compareZskVectorTolerance: document.querySelector("#compare-zsk-vector-tolerance"),
  compareZskSmoothing: document.querySelector("#compare-zsk-smoothing"),
  compareZskBackgroundColor: document.querySelector("#compare-zsk-background-color"),
  compareZskDetermineBackground: document.querySelector("#compare-zsk-determine-background"),
  compareZskBackgroundFill: document.querySelector("#compare-zsk-background-fill"),
  compareZskLineWidth: document.querySelector("#compare-zsk-line-width"),
  compareZskSatinStitchWidth: document.querySelector("#compare-zsk-satin-stitch-width"),
  compareZskOverlap: document.querySelector("#compare-zsk-overlap"),
  compareZskMinimumAreaSize: document.querySelector("#compare-zsk-minimum-area-size"),
  compareZskMinimumHoleSize: document.querySelector("#compare-zsk-minimum-hole-size"),
  compareZskMinimumLineLength: document.querySelector("#compare-zsk-minimum-line-length"),
  compareZskThreadCones: document.querySelector("#compare-zsk-thread-cones"),
};

await init();

async function init() {
  wireEvents();
  await loadProviders();
  await loadSamples();
  renderFormatOptions();
  renderSwatches();
  renderCompareWilcomSwatches();
  await loadSampleImage();
  updateRunState();
}

function wireEvents() {
  els.fileInput.addEventListener("change", () => {
    const [file] = els.fileInput.files;
    if (file) {
      state.selectedSampleName = "";
      setImageFile(file);
    }
  });

  els.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });

  els.dropZone.addEventListener("dragleave", () => {
    els.dropZone.classList.remove("dragging");
  });

  els.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
    const [file] = event.dataTransfer.files;
    if (file) {
      state.selectedSampleName = "";
      setImageFile(file);
    }
  });

  els.sampleButton.addEventListener("click", async () => {
    await loadSampleImage(currentSample());
  });

  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      els.modeButtons.forEach((item) => item.classList.toggle("active", item === button));
      updateRunState();
    });
  });

  els.threads.addEventListener("input", renderSwatches);
  els.designFormat.addEventListener("change", updateRunState);
  els.wilcomInputKind.addEventListener("change", updateRunState);
  els.wilcomUseSourceDpi.addEventListener("change", updateRunState);
  els.wilcomColorSource.addEventListener("change", updateRunState);
  els.wilcomThreadChart.addEventListener("change", updateWilcomThreadChartName);
  els.runButton.addEventListener("click", runConversion);
  els.historyButton.addEventListener("click", openHistoryDialog);
  els.historyClose.addEventListener("click", closeHistoryDialog);
  els.compareButton.addEventListener("click", openCompareDialog);
  els.compareClose.addEventListener("click", closeCompareDialog);
  els.compareFileInput.addEventListener("change", handleCompareUploads);
  els.compareMode.addEventListener("change", () => {
    state.comparison.mode = els.compareMode.value;
    renderCompareProviderOptions();
  });
  els.comparePulseRunType.addEventListener("change", () => {
    applyPulseRunTypeDefaults("compare");
    renderCompareProviderOptions();
  });
  els.compareWilcomFormat.addEventListener("change", renderCompareProviderOptions);
  els.compareWilcomColorSource.addEventListener("change", renderCompareProviderOptions);
  els.compareWilcomThreads.addEventListener("input", renderCompareWilcomSwatches);
  els.compareWilcomThreadChart.addEventListener("change", updateCompareWilcomThreadChartName);
  els.compareRunButton.addEventListener("click", runComparison);
  els.comparisonClose.addEventListener("click", closeComparisonDialog);
  els.comparisonRecapButton.addEventListener("click", downloadComparisonRecap);
  els.comparisonHtmlRecapButton.addEventListener("click", downloadComparisonHtmlRecap);
  els.melcoUseDefaultSize.addEventListener("change", updateRunState);
  els.pulseRunType.addEventListener("change", () => {
    applyPulseRunTypeDefaults("single");
    updateRunState();
  });
  els.pulseUseImageDimensions.addEventListener("change", updateRunState);
  els.pulseThreadTypeCompareButton.addEventListener("click", runPulseThreadTypeComparison);
  els.resultImage.addEventListener("click", openResultPreview);
  els.resultImage.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openResultPreview();
    }
  });
}

function applyPulseRunTypeDefaults(scope) {
  const isCompare = scope === "compare";
  const runType = isCompare ? els.comparePulseRunType.value : els.pulseRunType.value;
  const defaults = pulseRunTypeDefaults(runType);
  const controls = isCompare
    ? {
        renderWidth: els.comparePulseRenderWidth,
        renderHeight: els.comparePulseRenderHeight,
        renderPadding: els.comparePulseRenderPadding,
        timeoutSeconds: els.comparePulseTimeoutSeconds,
      }
    : {
        renderWidth: els.pulseRenderWidth,
        renderHeight: els.pulseRenderHeight,
        renderPadding: els.pulseRenderPadding,
        timeoutSeconds: els.pulseTimeoutSeconds,
      };

  controls.renderWidth.value = defaults.renderWidth;
  controls.renderHeight.value = defaults.renderHeight;
  controls.renderPadding.value = defaults.renderPadding;
  controls.timeoutSeconds.value = defaults.timeoutSeconds;
}

function pulseRunTypeDefaults(runType) {
  if (runType === "quick") {
    return { renderWidth: "360", renderHeight: "360", renderPadding: "20", timeoutSeconds: "20" };
  }

  return { renderWidth: "1100", renderHeight: "1600", renderPadding: "40", timeoutSeconds: "60" };
}

async function loadProviders() {
  const response = await fetch("/api/providers");
  const data = await response.json();
  state.providers = data.providers ?? [];
  const current = currentProvider();
  if (!current || current.status !== "ready") {
    state.provider = state.providers.find((provider) => provider.status === "ready")?.id ?? state.provider;
  }
  renderProviders();
}

async function loadSamples() {
  const response = await fetch("/api/samples", { cache: "no-store" });
  const data = await response.json();
  state.samples = data.samples ?? [];
  const defaultSample = state.samples.find((sample) => sample.name === DEFAULT_SAMPLE_NAME) ?? state.samples[0];
  state.selectedSampleName = defaultSample?.name ?? "";
  renderSamples();
}

function renderProviders() {
  els.providerTabs.replaceChildren();

  for (const provider of state.providers) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "provider-tab";
    button.textContent = provider.name;
    button.disabled = provider.status !== "ready";
    button.classList.toggle("active", provider.id === state.provider);
    button.addEventListener("click", () => {
      state.provider = provider.id;
      renderProviders();
      renderFormatOptions();
      renderProviderOptions();
      updateRunState();
    });
    els.providerTabs.append(button);
  }

  const current = currentProvider();
  const suffix =
    current?.status === "ready" ? "ready" : current?.reason || "not available";
  els.providerStatus.textContent = `${current?.name ?? "Provider"} - ${suffix}`;
}

async function setImageFile(file) {
  const dataUrl = await readAsDataUrl(file);
  state.image = {
    name: file.name || "design.png",
    dataUrl,
  };

  els.fileName.textContent = state.image.name;
  const imageReady = isImageDataUrl(dataUrl) ? waitForImageLoad(els.sourceImage) : Promise.resolve();
  if (isImageDataUrl(dataUrl)) {
    els.sourceImage.src = dataUrl;
    els.sourceImage.hidden = false;
    els.sourceEmpty.hidden = true;
  } else {
    els.sourceImage.removeAttribute("src");
    els.sourceImage.hidden = true;
    els.sourceEmpty.textContent = `Source selected: ${state.image.name}`;
    els.sourceEmpty.hidden = false;
  }
  clearResult();
  updateSampleSelection();
  updateRunState();
  await imageReady;
  if (state.image?.dataUrl === dataUrl) {
    state.wilcomPaletteEdited = false;
    await populatePaletteFromImage(state.image, els.threads, renderSwatches);
  }
}

async function loadSampleImage(sample = currentSample()) {
  const targetSample = sample ?? { name: DEFAULT_SAMPLE_NAME, url: DEFAULT_SAMPLE_URL };
  const response = await fetch(targetSample.url, { cache: "no-store" });
  if (!response.ok) {
    setStatus("Sample not found", "error");
    return;
  }

  const blob = await response.blob();
  const file = new File([blob], targetSample.name, {
    type: blob.type || "image/png",
  });
  state.selectedSampleName = targetSample.name;
  await setImageFile(file);
}

function renderSamples() {
  els.sampleGrid.replaceChildren();

  for (const sample of state.samples) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sample-card";
    button.classList.toggle("active", sample.name === state.selectedSampleName);
    button.dataset.sampleName = sample.name;
    button.title = sample.name;
    button.innerHTML = `<img src="${sample.url}" alt=""><span>${escapeHtml(sample.name)}</span>`;
    button.addEventListener("mousedown", preventPointerFocusScroll);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.currentTarget.blur();
      preserveScroll(() => loadSampleImage(sample));
    });
    els.sampleGrid.append(button);
  }
}
function renderCompareSamples() {
  if (!els.compareSampleGrid) return;
  els.compareSampleGrid.replaceChildren();

  for (const sample of state.samples) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sample-card";
    button.classList.toggle("active", state.comparison.selectedSampleNames.has(sample.name));
    button.dataset.sampleName = sample.name;
    button.title = sample.name;
    button.innerHTML = '<img src="' + sample.url + '" alt=""><span>' + escapeHtml(sample.name) + '</span>';
    button.addEventListener("mousedown", preventPointerFocusScroll);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.currentTarget.blur();
      if (state.comparison.selectedSampleNames.has(sample.name)) {
        state.comparison.selectedSampleNames.delete(sample.name);
      } else {
        state.comparison.selectedSampleNames.add(sample.name);
      }
      state.comparison.wilcomPaletteEdited = false;
      preserveScroll(async () => {
        updateCompareSampleSelection();
        await populateComparePaletteFromSelection();
        updateCompareRunState();
      });
    });
    els.compareSampleGrid.append(button);
  }
}

function updateSampleSelection() {
  els.sampleGrid.querySelectorAll(".sample-card").forEach((button) => {
    button.classList.toggle("active", button.dataset.sampleName === state.selectedSampleName);
  });
}

function updateCompareSampleSelection() {
  if (!els.compareSampleGrid) return;
  els.compareSampleGrid.querySelectorAll(".sample-card").forEach((button) => {
    button.classList.toggle("active", state.comparison.selectedSampleNames.has(button.dataset.sampleName));
  });
}

function renderCompareProviders() {
  if (!els.compareProviderList) return;
  els.compareProviderList.replaceChildren();

  const readyProviders = state.providers.filter((provider) => provider.status === "ready");
  if (state.comparison.selectedProviderIds.size === 0) {
    readyProviders.forEach((provider) => state.comparison.selectedProviderIds.add(provider.id));
  }

  for (const provider of state.providers) {
    const label = document.createElement("label");
    label.className = "compare-provider-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = provider.id;
    checkbox.disabled = provider.status !== "ready";
    checkbox.checked = provider.status === "ready" && state.comparison.selectedProviderIds.has(provider.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.comparison.selectedProviderIds.add(provider.id);
      } else {
        state.comparison.selectedProviderIds.delete(provider.id);
      }
      renderCompareProviderOptions();
      updateCompareRunState();
    });

    const name = document.createElement("span");
    name.textContent = provider.name;
    const status = document.createElement("small");
    status.textContent = provider.status === "ready" ? "ready" : provider.reason || "unavailable";
    label.append(checkbox, name, status);
    els.compareProviderList.append(label);
  }
  renderCompareProviderOptions();
}

function renderCompareProviderOptions() {
  const selectedIds = new Set(selectedCompareProviderIds());
  const isDesign = els.compareMode.value === "design";
  const hasSelectedProvider = selectedIds.size > 0;

  els.compareProviderOptions.hidden = !hasSelectedProvider;
  els.compareWilcomOptions.hidden = !selectedIds.has("wilcom");
  els.comparePulseOptions.hidden = !selectedIds.has("pulse");
  els.compareMelcoOptions.hidden = !selectedIds.has("melco");
  els.compareZskOptions.hidden = !selectedIds.has("zsk");

  els.compareWilcomFormatBlock.hidden = !isDesign;
  els.comparePulseFormatBlock.hidden = !isDesign || els.comparePulseRunType.value !== "full";
  els.compareMelcoFormatBlock.hidden = !isDesign;
  els.compareZskFormatBlock.hidden = !isDesign;
  els.compareWilcomDesignVersionBlock.hidden =
    !isDesign || els.compareWilcomFormat.value !== "emb";
  els.compareWilcomPaletteBlock.hidden = els.compareWilcomColorSource.value !== "palette";
  els.compareWilcomThreadChartBlock.hidden = els.compareWilcomColorSource.value !== "threadChart";
}


async function runConversion() {
  if (!state.image) return;

  setStatus("Running", "neutral");
  els.runButton.disabled = true;
  clearResult();

  try {
    const payload = {
      provider: state.provider,
      image: state.image,
      options: buildOptionsForProvider(state.provider, state.mode),
    };

    const response = await fetch("/api/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) throw conversionErrorFromResponse(data);

    renderResult(data);
    setStatus("Conversion complete", "ok");
  } catch (error) {
    setStatus(error.message || "Conversion failed", "error");
    if (error.logFile) {
      els.runId.textContent = error.runId ?? "";
      renderFiles([{ name: "error.json", kind: "error", url: error.logFile }]);
    }
  } finally {
    updateRunState();
  }
}

function renderResult(data) {
  els.runId.textContent = data.runId ?? "";

  const preview = (data.files ?? []).find((file) => file.mimeType?.startsWith("image/"));
  if (preview) {
    els.resultImage.src = `data:${preview.mimeType};base64,${preview.base64}`;
    els.resultImage.hidden = false;
    els.resultImage.tabIndex = 0;
    els.resultImage.setAttribute("role", "button");
    els.resultEmpty.hidden = true;
  } else {
    els.resultImage.hidden = true;
    els.resultImage.removeAttribute("tabindex");
    els.resultImage.removeAttribute("role");
    els.resultEmpty.hidden = false;
    els.resultEmpty.textContent = "No preview returned";
  }

  renderMetrics(data.designInfo);
  renderFiles(data.runFiles ?? []);

  if (data.requestXml) {
    els.requestXml.textContent = data.requestXml;
    els.requestXml.hidden = false;
  }
}

function openResultPreview() {
  const src = els.resultImage.getAttribute("src");
  if (!src || els.resultImage.hidden) return;

  const previewWindow = window.open(src, "_blank", "noopener,noreferrer");
  if (previewWindow) previewWindow.opener = null;
}

async function openCompareDialog() {
  if (state.selectedSampleName && state.comparison.selectedSampleNames.size === 0 && state.comparison.uploads.length === 0) {
    state.comparison.selectedSampleNames.add(state.selectedSampleName);
  }

  state.comparison.mode = state.mode;
  els.compareMode.value = state.comparison.mode;
  syncCompareCommonSettingsFromMain();
  renderCompareSamples();
  renderCompareProviders();
  updateCompareRunState();
  setCompareStatus("Idle", "neutral");
  state.comparison.wilcomPaletteEdited = false;
  await populateComparePaletteFromSelection();

  if (typeof els.compareDialog.showModal === "function") {
    els.compareDialog.showModal();
  } else {
    els.compareDialog.setAttribute("open", "");
  }
}

function closeCompareDialog() {
  if (typeof els.compareDialog.close === "function") {
    els.compareDialog.close();
  } else {
    els.compareDialog.removeAttribute("open");
  }
}

function openComparisonDialog() {
  if (typeof els.comparisonDialog.showModal === "function") {
    els.comparisonDialog.showModal();
  } else {
    els.comparisonDialog.setAttribute("open", "");
  }
}

function closeComparisonDialog() {
  if (typeof els.comparisonDialog.close === "function") {
    els.comparisonDialog.close();
  } else {
    els.comparisonDialog.removeAttribute("open");
  }
}

async function openHistoryDialog() {
  setHistoryLoading();
  if (typeof els.historyDialog.showModal === "function") {
    els.historyDialog.showModal();
  } else {
    els.historyDialog.setAttribute("open", "");
  }
  await loadHistory();
}

function closeHistoryDialog() {
  if (typeof els.historyDialog.close === "function") {
    els.historyDialog.close();
  } else {
    els.historyDialog.removeAttribute("open");
  }
}

function setHistoryLoading() {
  els.historySummary.textContent = "Loading";
  els.historyCompares.textContent = "";
  els.historyExecutions.textContent = "";
  els.historyComparesCount.textContent = "";
  els.historyExecutionsCount.textContent = "";
}

async function loadHistory() {
  try {
    const response = await fetch("/api/history", { cache: "no-store" });
    const data = await readJsonResponse(response, "History endpoint");
    if (!response.ok) throw new Error(data.error || "Cannot load history");

    renderHistory(data);
  } catch (error) {
    els.historySummary.textContent = error.message || "Cannot load history";
  }
}

function renderHistory(data) {
  const compares = data.compares ?? [];
  const executions = data.executions ?? [];
  const inferredCompares = inferCompareGroupsFromExecutions(executions);
  const compareGroups = [
    ...compares.map((compare) => ({ type: "saved", compare })),
    ...inferredCompares.map((group) => ({ type: "inferred", group })),
  ];

  els.historySummary.textContent = `${compareGroups.length} compare groups, ${executions.length} raw executions`;
  els.historyComparesCount.textContent = `${compareGroups.length}`;
  els.historyExecutionsCount.textContent = `${executions.length}`;
  renderHistoryCompares(compareGroups);
  renderHistoryExecutions(executions);
}

function renderHistoryCompares(compareGroups) {
  els.historyCompares.replaceChildren();
  if (compareGroups.length === 0) {
    els.historyCompares.textContent = "No compare groups yet";
    return;
  }

  for (const entry of compareGroups) {
    els.historyCompares.append(
      entry.type === "saved"
        ? renderSavedCompareHistoryItem(entry.compare)
        : renderInferredCompareHistoryItem(entry.group)
    );
  }
}

function renderSavedCompareHistoryItem(compare) {
  const item = document.createElement("details");
  item.className = "history-item history-accordion";
  item.innerHTML = `
    <summary>
      <div>
        <strong>${escapeHtml(compare.title || "Comparison")}</strong>
        <span>${escapeHtml(formatDateTime(compare.createdAt))} / ${escapeHtml(compare.mode || "unknown mode")}</span>
        <small>${compare.successCount}/${compare.totalCount} successful / ${compare.imageCount} images / ${compare.providerCount} providers / saved compare</small>
      </div>
    </summary>
    <div class="history-detail">
      <div class="history-actions">
        <button class="ghost-button" type="button" data-history-action="open">Open</button>
        <button class="ghost-button" type="button" data-history-action="md">Download MD</button>
        <button class="ghost-button" type="button" data-history-action="html">Download HTML</button>
      </div>
      <div class="history-request-grid">
        ${historyFact("Images", compare.imageCount)}
        ${historyFact("Providers", compare.providerCount)}
        ${historyFact("Mode", compare.mode || "unknown")}
        ${historyFact("Success", `${compare.successCount}/${compare.totalCount}`)}
      </div>
      <div class="history-result-grid" data-history-detail>Loading details...</div>
    </div>`;

  item.querySelector('[data-history-action="open"]').addEventListener("click", async () => {
    const loaded = await fetchSavedCompare(compare.id);
    if (loaded) openHistoryComparisonResults(loaded.results ?? [], loaded.mode);
  });
  item.querySelector('[data-history-action="md"]').addEventListener("click", async () => {
    const loaded = await fetchSavedCompare(compare.id);
    if (loaded) downloadHistoryComparisonResults(loaded.results ?? [], loaded.mode, "md");
  });
  item.querySelector('[data-history-action="html"]').addEventListener("click", async () => {
    const loaded = await fetchSavedCompare(compare.id);
    if (loaded) downloadHistoryComparisonResults(loaded.results ?? [], loaded.mode, "html");
  });

  item.addEventListener("toggle", async () => {
    if (!item.open || item.dataset.loaded === "true") return;
    item.dataset.loaded = "true";
    const container = item.querySelector("[data-history-detail]");
    await loadSavedCompareInto(compare.id, container);
  });

  return item;
}

function renderInferredCompareHistoryItem(group) {
  const item = document.createElement("details");
  item.className = "history-item history-accordion";
  item.innerHTML = `
    <summary>
      <div>
        <strong>${escapeHtml(group.title)}</strong>
        <span>${escapeHtml(formatDateTime(group.createdAt))} / ${escapeHtml(group.modes.join(", ") || "unknown mode")}</span>
        <small>${group.successCount}/${group.totalCount} successful / ${group.images.length} images / ${group.providers.length} providers / reconstructed from executions</small>
      </div>
    </summary>
    <div class="history-detail">
      <div class="history-actions">
        <button class="ghost-button" type="button" data-history-action="open">Open</button>
        <button class="ghost-button" type="button" data-history-action="md">Download MD</button>
        <button class="ghost-button" type="button" data-history-action="html">Download HTML</button>
      </div>
      ${historyRequestSummary(group)}
      <div class="history-result-grid">
        ${group.results.map(historyResultCardHtml).join("")}
      </div>
    </div>`;
  item.querySelector('[data-history-action="open"]').addEventListener("click", () => {
    openHistoryComparisonResults(group.results, group.modes[0] || "trueview");
  });
  item.querySelector('[data-history-action="md"]').addEventListener("click", () => {
    downloadHistoryComparisonResults(group.results, group.modes[0] || "trueview", "md");
  });
  item.querySelector('[data-history-action="html"]').addEventListener("click", () => {
    downloadHistoryComparisonResults(group.results, group.modes[0] || "trueview", "html");
  });
  return item;
}

async function loadSavedCompareInto(id, container) {
  try {
    const compare = await fetchSavedCompare(id);
    if (!compare) return;
    const group = groupSummaryFromResults(compare.results ?? [], {
      title: compare.title || "Saved comparison",
      createdAt: compare.createdAt,
      mode: compare.mode,
    });
    container.parentElement.querySelector(".history-request-grid")?.remove();
    container.insertAdjacentHTML("beforebegin", historyRequestSummary(group));
    container.innerHTML = (compare.results ?? []).map(historyResultCardHtml).join("") || "No results saved";
  } catch (error) {
    container.textContent = error.message || "Cannot load compare";
  }
}

async function fetchSavedCompare(id) {
  try {
    const response = await fetch(`/api/history/compares/${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await readJsonResponse(response, "Compare history endpoint");
    if (!response.ok) throw new Error(data.error || "Compare not found");
    return data.compare;
  } catch (error) {
    els.historySummary.textContent = error.message || "Cannot load compare";
    return null;
  }
}

function openHistoryComparisonResults(results, mode) {
  state.comparison.mode = mode || "trueview";
  state.comparison.results = results ?? [];
  renderComparisonResults(state.comparison.results.length);
  els.comparisonRecapButton.hidden = state.comparison.results.length === 0;
  els.comparisonHtmlRecapButton.hidden = state.comparison.results.length === 0;
  closeHistoryDialog();
  openComparisonDialog();
}

function downloadHistoryComparisonResults(results, mode, type) {
  const previousMode = state.comparison.mode;
  const previousResults = state.comparison.results;
  state.comparison.mode = mode || "trueview";
  state.comparison.results = results ?? [];

  try {
    if (type === "html") {
      downloadComparisonHtmlRecap();
    } else {
      downloadComparisonRecap();
    }
  } finally {
    state.comparison.mode = previousMode;
    state.comparison.results = previousResults;
  }
}

function renderHistoryExecutions(executions) {
  els.historyExecutions.replaceChildren();
  if (executions.length === 0) {
    els.historyExecutions.textContent = "No executions yet";
    return;
  }

  for (const execution of executions) {
    const item = document.createElement("div");
    item.className = `history-item${execution.ok ? "" : " error"}`;
    const files = execution.runFiles ?? [];
    const primaryFile = execution.previewUrl || execution.sourceUrl || files[0]?.url;
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(providerLabel(execution.providerId))} / ${escapeHtml(execution.imageName || execution.runId)}</strong>
        <span>${escapeHtml(formatDateTime(execution.createdAt))} / ${escapeHtml(execution.mode || "unknown mode")}</span>
        <small>${execution.ok ? "ok" : escapeHtml(execution.error || "failed")} / ${escapeHtml(execution.runId)}</small>
      </div>
      ${primaryFile ? `<a class="ghost-button history-link-button" href="${escapeHtml(primaryFile)}" target="_blank" rel="noreferrer">Files</a>` : ""}`;
    els.historyExecutions.append(item);
  }
}

function inferCompareGroupsFromExecutions(executions) {
  const sorted = [...executions].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const groups = [];
  let current = [];

  for (const execution of sorted) {
    if (!current.length) {
      current = [execution];
      continue;
    }

    const previous = current[current.length - 1];
    const gapMs = Math.abs(Date.parse(previous.createdAt) - Date.parse(execution.createdAt));
    if (gapMs <= 120_000) {
      current.push(execution);
    } else {
      pushInferredGroup(groups, current);
      current = [execution];
    }
  }

  pushInferredGroup(groups, current);
  return groups.slice(0, 30);
}

function pushInferredGroup(groups, executions) {
  if (executions.length < 2) return;

  const results = executions.map(historyResultFromExecution);
  const summary = groupSummaryFromResults(results, {
    title: "Probable compare",
    createdAt: executions[0].createdAt,
  });

  if (summary.providers.length < 2 && summary.images.length < 2 && summary.totalCount < 3) return;
  groups.push(summary);
}

function historyResultFromExecution(execution) {
  return {
    ok: execution.ok,
    providerId: execution.providerId,
    providerName: providerLabel(execution.providerId),
    image: { name: execution.imageName || execution.runId },
    mode: execution.mode,
    options: execution.options,
    data: {
      runId: execution.runId,
      designInfo: execution.result?.designInfo,
      runFiles: execution.runFiles ?? [],
    },
    error: execution.error,
    runId: execution.runId,
    logFile: (execution.runFiles ?? []).find((file) => file.kind === "error")?.url,
    previewUrl: execution.previewUrl,
    sourceUrl: execution.sourceUrl,
  };
}

function groupSummaryFromResults(results, base = {}) {
  const providers = uniqueList(results.map((result) => result.providerName || providerLabel(result.providerId)));
  const images = uniqueList(results.map((result) => result.image?.name).filter(Boolean));
  const modes = uniqueList(results.map((result) => result.mode || base.mode).filter(Boolean));
  return {
    title: base.title || "Comparison",
    createdAt: base.createdAt || results[0]?.createdAt || new Date().toISOString(),
    images,
    providers,
    modes,
    successCount: results.filter((result) => result.ok).length,
    totalCount: results.length,
    results,
  };
}

function historyRequestSummary(group) {
  return `<div class="history-request-grid">
    ${historyFact("Images", group.images.join(", ") || "Unknown")}
    ${historyFact("Providers", group.providers.join(", ") || "Unknown")}
    ${historyFact("Modes", group.modes.join(", ") || "Unknown")}
    ${historyFact("Results", `${group.successCount}/${group.totalCount} successful`)}
  </div>`;
}

function historyFact(label, value) {
  return `<div class="history-request-card"><span>${escapeHtml(label)}</span><small>${escapeHtml(value)}</small></div>`;
}

function historyResultCardHtml(result) {
  const preview = historyPreviewUrl(result);
  const title = result.variantName
    ? `${result.providerName || providerLabel(result.providerId)} / ${result.variantName}`
    : result.providerName || providerLabel(result.providerId);
  const files = result.ok
    ? result.data?.runFiles ?? []
    : result.logFile
      ? [{ name: "error.json", kind: "error", url: result.logFile }]
      : result.data?.runFiles ?? [];
  const metrics = result.ok ? metricItems(result.data?.designInfo) : [["Error", result.error || "failed"]];
  const metricsHtml = metrics.length
    ? `<div class="metrics comparison-metrics">${metrics.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`
    : "";
  const options = compactJson(result.options);

  return `<article class="history-result-card${result.ok ? "" : " error"}">
    ${preview ? `<img class="history-preview" src="${escapeHtml(preview)}" alt="">` : `<div class="history-preview empty">No preview</div>`}
    <div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(result.image?.name || "")}</span>
      <small>${escapeHtml(result.mode || "unknown mode")} / ${escapeHtml(result.data?.runId || result.runId || "")}</small>
      ${metricsHtml}
      <div class="history-options">${escapeHtml(options || "No request options saved")}</div>
      <div class="history-files-inline">
        ${files.map((file) => `<a class="history-file-chip" href="${escapeHtml(file.url)}" target="_blank" rel="noreferrer"><span>${escapeHtml(file.name)}</span><small>${escapeHtml(file.kind || "file")}</small></a>`).join("")}
      </div>
    </div>
  </article>`;
}

function historyPreviewUrl(result) {
  const files = result.data?.runFiles ?? [];
  return (
    result.previewUrl ||
    files.find((file) => file.kind === "preview")?.url ||
    files.find((file) => file.kind === "source-sent")?.url ||
    result.sourceUrl ||
    ""
  );
}

function compactJson(value) {
  if (!value) return "";
  return JSON.stringify(value, null, 2);
}

function uniqueList(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
async function openHistoricalCompare(id) {
  const response = await fetch(`/api/history/compares/${encodeURIComponent(id)}`, { cache: "no-store" });
  const data = await readJsonResponse(response, "Compare history endpoint");
  if (!response.ok) {
    els.historySummary.textContent = data.error || "Compare not found";
    return;
  }

  const compare = data.compare;
  state.comparison.mode = compare.mode || "trueview";
  state.comparison.results = compare.results ?? [];
  renderComparisonResults(compare.totalCount ?? state.comparison.results.length);
  els.comparisonRecapButton.hidden = state.comparison.results.length === 0;
  els.comparisonHtmlRecapButton.hidden = state.comparison.results.length === 0;
  closeHistoryDialog();
  openComparisonDialog();
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const body = text.length > 160 ? `${text.slice(0, 160)}...` : text;
    const error = new Error(`${label} returned non-JSON response: ${body}`);
    error.status = response.status;
    throw error;
  }
}

async function saveComparisonHistory(title) {
  if (state.comparison.results.length === 0) return;

  try {
    await fetch("/api/history/compares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        mode: state.comparison.mode,
        results: state.comparison.results.map(historyResult),
      }),
    });
  } catch {
    // History should never block the comparison result UI.
  }
}

function historyResult(result) {
  return {
    ok: result.ok,
    providerId: result.providerId,
    providerName: result.providerName,
    variantName: result.variantName,
    variantKey: result.variantKey,
    variantValue: result.variantValue,
    image: {
      name: result.image?.name ?? "",
    },
    mode: result.mode,
    options: result.options,
    data: result.ok
      ? {
          runId: result.data?.runId,
          designInfo: result.data?.designInfo,
          runFiles: result.data?.runFiles ?? [],
        }
      : undefined,
    error: result.error,
    runId: result.runId,
    logFile: result.logFile,
    upstreamResponse: result.upstreamResponse,
  };
}

async function handleCompareUploads() {
  const files = Array.from(els.compareFileInput.files ?? []);
  state.comparison.uploads = await Promise.all(files.map(fileToImage));
  state.comparison.wilcomPaletteEdited = false;
  renderCompareUploads();
  await populateComparePaletteFromSelection();
  updateCompareRunState();
}

function renderCompareUploads() {
  if (state.comparison.uploads.length === 0) {
    els.compareUploadList.textContent = "PNG, JPG, BMP, GIF, TIF, PDF, EPS";
    return;
  }

  els.compareUploadList.textContent = state.comparison.uploads.map((image) => image.name).join(", ");
}

function updateCompareRunState() {
  const imageCount = state.comparison.uploads.length + state.comparison.selectedSampleNames.size;
  const providerCount = selectedCompareProviderIds().length;
  els.compareRunButton.disabled = imageCount === 0 || providerCount === 0;
}

function syncCompareCommonSettingsFromMain() {
  els.compareSourceMaxSide.value = els.sourceMaxSide.value;
  els.compareSourceMinSide.value = els.sourceMinSide.value;
  els.compareWidthMm.value = els.widthMm.value;
  els.compareHeightMm.value = els.heightMm.value;
}

function selectedCompareProviderIds() {
  return Array.from(state.comparison.selectedProviderIds).filter((id) => {
    const provider = state.providers.find((item) => item.id === id);
    return provider?.status === "ready";
  });
}

async function runComparison() {
  const images = await collectCompareImages();
  const providerIds = selectedCompareProviderIds();
  const mode = els.compareMode.value;
  const total = images.length * providerIds.length;

  if (total === 0) return;

  state.comparison.mode = mode;
  state.comparison.results = [];
  renderComparisonResults(total);
  els.compareRunButton.disabled = true;
  els.comparisonRecapButton.hidden = true;
  els.comparisonHtmlRecapButton.hidden = true;

  let completed = 0;
  for (const image of images) {
    for (const providerId of providerIds) {
      const provider = state.providers.find((item) => item.id === providerId);
      setCompareStatus(`Running ${provider?.name ?? providerId} / ${image.name} (${completed + 1}/${total})`, "neutral");
      const result = await runComparisonItem(image, providerId, mode);
      state.comparison.results.push(result);
      completed += 1;
      renderComparisonResults(total);
    }
  }

  setCompareStatus(`Complete (${completed}/${total})`, "ok");
  els.compareRunButton.disabled = false;
  els.comparisonRecapButton.hidden = state.comparison.results.length === 0;
  els.comparisonHtmlRecapButton.hidden = state.comparison.results.length === 0;
  await saveComparisonHistory("Provider comparison");
  closeCompareDialog();
  openComparisonDialog();
}

async function runPulseThreadTypeComparison() {
  const provider = state.providers.find((item) => item.id === "pulse");
  if (!provider || provider.status !== "ready") {
    setStatus("PulseID is not ready", "error");
    return;
  }

  if (!state.image) {
    setStatus("Choose an image first", "error");
    return;
  }

  const image = { ...state.image };
  const mode = state.mode;
  const total = pulseThreadTypeVariants.length;

  state.comparison.mode = mode;
  state.comparison.results = [];
  renderComparisonResults(total);
  els.comparisonRecapButton.hidden = true;
  els.comparisonHtmlRecapButton.hidden = true;
  els.pulseThreadTypeCompareButton.disabled = true;
  els.runButton.disabled = true;

  let completed = 0;
  try {
    for (const variant of pulseThreadTypeVariants) {
      setStatus(`Running Pulse thread type ${variant.label} (${completed + 1}/${total})`, "neutral");
      const result = await runComparisonItem(image, "pulse", mode, {
        options: buildPulseThreadTypeComparisonOptions(mode, variant.value),
        variantName: `Thread type: ${variant.label}`,
        variantKey: "pulse.threadType",
        variantValue: variant.value,
      });
      state.comparison.results.push(result);
      completed += 1;
      renderComparisonResults(total);
    }

    setStatus(`Pulse thread type comparison complete (${completed}/${total})`, "ok");
    els.comparisonRecapButton.hidden = state.comparison.results.length === 0;
    els.comparisonHtmlRecapButton.hidden = state.comparison.results.length === 0;
    await saveComparisonHistory("Pulse thread type comparison");
    openComparisonDialog();
  } finally {
    updateRunState();
  }
}

async function runComparisonItem(image, providerId, mode, overrides = {}) {
  const provider = state.providers.find((item) => item.id === providerId);
  const options =
    overrides.options ??
    await buildCompareOptionsForProvider(providerId, mode, image);
  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: providerId,
        image,
        options,
      }),
    });
    const data = await response.json();

    if (!response.ok) throw conversionErrorFromResponse(data);

    return {
      ok: true,
      providerId,
      providerName: provider?.name ?? providerId,
      variantName: overrides.variantName,
      variantKey: overrides.variantKey,
      variantValue: overrides.variantValue,
      image,
      mode,
      options,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      providerId,
      providerName: provider?.name ?? providerId,
      variantName: overrides.variantName,
      variantKey: overrides.variantKey,
      variantValue: overrides.variantValue,
      image,
      mode,
      options,
      error: error.message || "Conversion failed",
      runId: error.runId,
      logFile: error.logFile,
      upstreamResponse: error.upstreamResponse,
    };
  }
}

function buildPulseThreadTypeComparisonOptions(mode, threadType) {
  return stripEmpty({
    mode,
    preprocessing: readSourcePreprocessingOptions(),
    widthMm: DEFAULT_TARGET_WIDTH_MM,
    heightMm: DEFAULT_TARGET_HEIGHT_MM,
    designFormat: mode === "design" ? "dst" : undefined,
    pulse: {
      ...pulseDefaultOptions,
      threadType,
    },
  });
}

function buildOptionsForProvider(providerId, mode, { forceMelcoDefaultSize = false } = {}) {
  const formats = providerFormats[providerId] ?? ["dst"];
  const selectedFormat = formats.includes(els.designFormat.value) ? els.designFormat.value : formats[0];
  const pulseOptions = providerId === "pulse" ? readPulseOptions({ ignoreSelectedProvider: true }) : undefined;
  const melcoOptions =
    providerId === "melco"
      ? {
          ...readMelcoOptions({ ignoreSelectedProvider: true }),
          ...(forceMelcoDefaultSize ? { useDefaultSize: true } : {}),
        }
      : undefined;
  const zskOptions = providerId === "zsk" ? readZskOptions({ ignoreSelectedProvider: true }) : undefined;
  const wilcomOptions = providerId === "wilcom" ? readWilcomOptions({ ignoreSelectedProvider: true }) : undefined;
  const providerOptions = pulseOptions ?? melcoOptions ?? zskOptions ?? wilcomOptions;
  const includeTargetSize = providerUsesTargetSize(providerId, providerOptions);
  const includeDesignFormat = mode === "design" && providerProducesDesignFile(providerId, providerOptions);

  return stripEmpty({
    mode,
    preprocessing: readSourcePreprocessingOptions(),
    ...(includeTargetSize ? { widthMm: els.widthMm.value, heightMm: els.heightMm.value } : {}),
    designFormat: includeDesignFormat ? selectedFormat : undefined,
    wilcom: wilcomOptions,
    pulse: pulseOptions,
    melco: melcoOptions,
    zsk: zskOptions,
  });
}

async function buildCompareOptionsForProvider(providerId, mode, image = undefined) {
  const selectedFormat = mode === "design" ? compareDesignFormat(providerId) : undefined;
  let providerOptions = readCompareOptionsForProvider(providerId, mode, selectedFormat);
  if (
    providerId === "wilcom" &&
    providerOptions?.colorSource === "palette" &&
    !state.comparison.wilcomPaletteEdited
  ) {
    const threads = await extractThreadPaletteFromImage(image);
    if (threads.length > 0) {
      providerOptions = { ...providerOptions, threads };
    }
  }
  const includeTargetSize = providerUsesTargetSize(providerId, providerOptions);
  const includeDesignFormat = mode === "design" && providerProducesDesignFile(providerId, providerOptions);

  return stripEmpty({
    mode,
    preprocessing: readCompareSourcePreprocessingOptions(),
    ...(includeTargetSize ? { widthMm: els.compareWidthMm.value, heightMm: els.compareHeightMm.value } : {}),
    designFormat: includeDesignFormat ? selectedFormat : undefined,
    wilcom: providerId === "wilcom" ? providerOptions : undefined,
    pulse: providerId === "pulse" ? providerOptions : undefined,
    melco: providerId === "melco" ? providerOptions : undefined,
    zsk: providerId === "zsk" ? providerOptions : undefined,
  });
}

function compareDesignFormat(providerId) {
  const formats = providerFormats[providerId] ?? ["dst"];
  const select = {
    wilcom: els.compareWilcomFormat,
    pulse: els.comparePulseFormat,
    melco: els.compareMelcoFormat,
    zsk: els.compareZskFormat,
  }[providerId];
  const value = select?.value;
  return formats.includes(value) ? value : formats[0];
}

function readCompareOptionsForProvider(providerId, mode, selectedFormat) {
  if (providerId === "wilcom") return readCompareWilcomOptions(mode, selectedFormat);
  if (providerId === "pulse") return readComparePulseOptions();
  if (providerId === "melco") return readCompareMelcoOptions();
  if (providerId === "zsk") return readCompareZskOptions();
  return undefined;
}

function readCompareWilcomOptions(mode, selectedFormat) {
  return stripEmpty({
    inputKind: els.compareWilcomInputKind.value,
    useSourceDpi: els.compareWilcomUseSourceDpi.checked,
    dpi: els.compareWilcomDpi.value,
    designVersion:
      mode === "design" && selectedFormat === "emb"
        ? els.compareWilcomDesignVersion.value
        : undefined,
    colorSource: els.compareWilcomColorSource.value,
    threads: els.compareWilcomColorSource.value === "palette"
      ? parseThreadText(els.compareWilcomThreads.value)
      : undefined,
    threadChart:
      els.compareWilcomColorSource.value === "threadChart"
        ? state.comparison.wilcomThreadChart
        : undefined,
    removeBackground: els.compareWilcomRemoveBackground.checked,
  });
}

function readComparePulseOptions() {
  return stripEmpty({
    runType: els.comparePulseRunType.value,
    timeoutSeconds: els.comparePulseTimeoutSeconds.value,
    threadType: els.comparePulseThreadType.value,
    threadThickness: els.comparePulseThreadThickness.value,
    ignoreSmallAreas: els.comparePulseIgnoreSmallAreas.checked,
    createSatinAndSteil: els.comparePulseCreateSatin.checked,
    addSteilBorders: els.comparePulseAddSteilBorders.checked,
    generateBackground: els.comparePulseGenerateBackground.checked,
    sequenceType: els.comparePulseSequenceType.value,
    trimType: els.comparePulseTrimType.value,
    lockType: els.comparePulseLockType.value,
    trimThreshold: els.comparePulseTrimThreshold.value,
    maximumRunWidth: els.comparePulseMaximumRunWidth.value,
    maximumSatinWidth: els.comparePulseMaximumSatinWidth.value,
    maximumSteilWidth: els.comparePulseMaximumSteilWidth.value,
    numColors: els.comparePulseNumColors.value,
    renderWidth: els.comparePulseRenderWidth.value,
    renderHeight: els.comparePulseRenderHeight.value,
    renderPadding: els.comparePulseRenderPadding.value,
    recipe: els.comparePulseRecipe.value,
    proportionalResize: els.comparePulseProportionalResize.checked,
    lightenShadows: els.comparePulseLightenShadows.checked,
    transparentPreview: els.comparePulseTransparentPreview.checked,
    useImageDimensions: els.comparePulseUseImageDimensions.checked,
  });
}

function readCompareMelcoOptions() {
  return stripEmpty({
    useDefaultSize: els.compareMelcoUseDefaultSize.checked,
  });
}

function readCompareZskOptions() {
  return {
    ace: {
      optimize: stripEmpty({
        imageType: els.compareZskImageType.value,
        tolerance: els.compareZskOptimizeTolerance.value,
        removeArea: els.compareZskRemoveArea.value,
        maxColors: els.compareZskMaxColors.value,
      }),
      vector: stripEmpty({
        tolerance: els.compareZskVectorTolerance.value,
        smoothing: els.compareZskSmoothing.value,
        determineBackgroundColor: els.compareZskDetermineBackground.checked,
        backgroundColor: els.compareZskBackgroundColor.value,
        backgroundFill: els.compareZskBackgroundFill.checked,
      }),
      punch: stripEmpty({
        lineWidth: els.compareZskLineWidth.value,
        satinStitchWidth: els.compareZskSatinStitchWidth.value,
        overlap: els.compareZskOverlap.value,
        minimumAreaSize: els.compareZskMinimumAreaSize.value,
        minimumHoleSize: els.compareZskMinimumHoleSize.value,
        minimumLineLength: els.compareZskMinimumLineLength.value,
        threadCones: els.compareZskThreadCones.value,
      }),
    },
  };
}

async function collectCompareImages() {
  const sampleImages = await Promise.all(
    Array.from(state.comparison.selectedSampleNames).map(async (name) => {
      const sample = state.samples.find((item) => item.name === name);
      if (!sample) return null;
      const response = await fetch(sample.url, { cache: "no-store" });
      const blob = await response.blob();
      const file = new File([blob], sample.name, { type: blob.type || "image/png" });
      return fileToImage(file);
    })
  );

  return [...state.comparison.uploads, ...sampleImages.filter(Boolean)];
}

function renderComparisonResults(total = state.comparison.results.length) {
  els.comparisonGrid.replaceChildren();
  const successCount = state.comparison.results.filter((result) => result.ok).length;
  els.comparisonSummary.textContent = `${successCount}/${total} successful`;

  for (const result of state.comparison.results) {
    const card = document.createElement("article");
    card.className = `comparison-card${result.ok ? "" : " error"}`;
    const displayName = result.variantName
      ? `${result.providerName} - ${result.variantName}`
      : result.providerName;

    const preview = result.ok ? previewFile(result.data?.files ?? []) : null;
    const previewUrl = previewUrlForResult(result);
    const metrics = result.ok ? metricItems(result.data.designInfo) : [];
    const runFiles = result.ok
      ? result.data.runFiles ?? []
      : result.logFile
        ? [{ name: "error.json", kind: "error", url: result.logFile }]
        : [];

    card.innerHTML = `
      <div class="comparison-card-head">
        <strong>${escapeHtml(displayName)}</strong>
        <span>${escapeHtml(result.image.name)}</span>
      </div>
      <div class="comparison-images">
        ${sourcePreviewHtml(result.image, result)}
        ${previewUrl ? `<img src="${escapeHtml(previewUrl)}" alt="">` : preview ? `<img src="data:${preview.mimeType};base64,${preview.base64}" alt="">` : `<div class="comparison-error">${escapeHtml(result.error || "No preview")}</div>`}
      </div>
      <div class="metrics comparison-metrics">
        ${metrics.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
      </div>
      <div class="files comparison-files">
        ${runFiles.map((file) => `<a class="file-link" href="${file.url}" target="_blank" rel="noreferrer"><span>${escapeHtml(file.name)}</span><span>${escapeHtml(file.kind)}</span></a>`).join("")}
      </div>`;
    els.comparisonGrid.append(card);
  }
}

function previewFile(files) {
  return files.find((file) => file.mimeType?.startsWith("image/"));
}

function sourcePreviewHtml(image, result = undefined) {
  const sourceUrl = result ? sourceUrlForResult(result) : "";
  if (sourceUrl) return `<img src="${escapeHtml(sourceUrl)}" alt="">`;
  if (isImageDataUrl(image.dataUrl)) return `<img src="${image.dataUrl}" alt="">`;
  return `<div class="comparison-error">${escapeHtml(image.name)}</div>`;
}

function sourceMarkdown(image, width) {
  if (isImageDataUrl(image.dataUrl)) {
    return `<img src="${image.dataUrl}" width="${width}" style="max-width:${width}px;height:auto;border:1px solid #d7d4cd;border-radius:6px;background:#fff;" />`;
  }

  return `<div style="width:${width}px;max-width:${width}px;border:1px solid #d7d4cd;border-radius:6px;background:#fff;padding:12px;font-family:Arial,sans-serif;font-size:12px;">${htmlEscape(image.name)}</div>`;
}

function metricItems(info) {
  if (!info) return [];

  return [
    ["Stitches", info.num_stitches ?? info.stitches],
    ["Colors", info.num_colours ?? info.colors],
    ["Trims", info.num_trims ?? info.trims],
    ["Width", formatDimension(info.width, info.unit)],
    ["Height", formatDimension(info.height, info.unit)],
    ["Objects", info.num_objects],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function downloadComparisonRecap() {
  const markdown = buildComparisonMarkdown();
  downloadBlob(markdown, "text/markdown;charset=utf-8", "md");
}

function downloadComparisonHtmlRecap() {
  const html = buildComparisonHtml();
  downloadBlob(html, "text/html;charset=utf-8", "html");
}

function downloadBlob(content, type, extension) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `embroidery-comparison-${new Date().toISOString().slice(0, 10)}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildComparisonMarkdown() {
  const groupedResults = groupComparisonResultsByImage();
  const lines = [
    "# Embroidery comparison",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Mode: ${state.comparison.mode}`,
    "",
  ];

  for (const group of groupedResults) {
    lines.push(`## Source: ${mdEscape(group.image.name)}`, "");
    lines.push(sourceMarkdown(group.image, 240), "");
    lines.push("| Provider | Variant | Preview | Metrics | Files |");
    lines.push("| --- | --- | --- | --- | --- |");

    for (const result of group.results) {
      const variant = result.variantName ? mdEscape(result.variantName) : "-";
      if (!result.ok) {
        const logLink = result.logFile
          ? `<a href="${location.origin}${result.logFile}">error.json</a> <small>error</small>`
          : "-";
        lines.push(`| ${mdEscape(result.providerName)} | ${variant} | Failed | ${mdEscape(result.error || "Conversion failed")} | ${logLink} |`);
        continue;
      }

      const preview = previewFile(result.data.files ?? []);
      const previewHtml = preview
        ? `<img src="data:${preview.mimeType};base64,${preview.base64}" width="220" style="max-width:220px;height:auto;border:1px solid #d7d4cd;border-radius:6px;background:#fff;" />`
        : "No preview";
      const metrics = metricItems(result.data.designInfo)
        .concat(result.options?.widthMm && result.options?.heightMm ? [["Target size", `${result.options.widthMm} x ${result.options.heightMm} mm`]] : [])
        .map(([label, value]) => `<strong>${htmlEscape(label)}:</strong> ${htmlEscape(value)}`)
        .join("<br>");
      const files = (result.data.runFiles ?? [])
        .map((file) => `<a href="${location.origin}${file.url}">${htmlEscape(file.name)}</a> <small>${htmlEscape(file.kind)}</small>`)
        .join("<br>");

      lines.push(`| ${mdEscape(result.providerName)} | ${variant} | ${previewHtml} | ${metrics || "-"} | ${files || "-"} |`);
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function buildComparisonHtml() {
  const groupedResults = groupComparisonResultsByImage();
  const generated = new Date().toISOString();
  const sections = groupedResults.map((group) => comparisonGroupHtml(group)).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Embroidery comparison</title>
    <style>
      :root { color-scheme: light; --bg: #f4f1ec; --panel: #fffefa; --ink: #1e2428; --muted: #68747a; --line: #d7d4cd; --field: #f8f7f3; --accent: #0b6fb3; --bad: #a73b37; --good: #227a52; }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      header { position: sticky; top: 0; z-index: 2; padding: 22px 28px; border-bottom: 1px solid var(--line); background: var(--panel); }
      h1, h2, h3 { margin: 0; letter-spacing: 0; }
      h1 { font-size: 24px; }
      h2 { font-size: 18px; }
      h3 { font-size: 15px; }
      .meta { margin-top: 6px; color: var(--muted); }
      main { display: grid; gap: 22px; padding: 22px; }
      section { display: grid; gap: 14px; padding: 18px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
      .source { display: grid; grid-template-columns: minmax(220px, 320px) 1fr; gap: 16px; align-items: start; }
      .source img, .preview img, .placeholder { width: 100%; max-height: 260px; object-fit: contain; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
      .placeholder { display: grid; min-height: 180px; place-items: center; padding: 14px; color: var(--muted); text-align: center; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
      article { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 8px; background: #fffefa; }
      article.error { border-color: #d8a39d; }
      .card-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
      .badge { color: var(--muted); font-size: 12px; font-weight: 700; text-align: right; }
      .preview { display: grid; min-height: 190px; place-items: center; }
      .error-box { display: grid; min-height: 190px; place-items: center; padding: 14px; border: 1px solid #d8a39d; border-radius: 8px; background: #fff6f3; color: var(--bad); text-align: center; }
      .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 8px; }
      .metric { padding: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--field); }
      .metric span { display: block; color: var(--muted); font-size: 11px; font-weight: 800; text-transform: uppercase; }
      .metric strong { display: block; margin-top: 2px; overflow-wrap: anywhere; }
      .files { display: grid; gap: 6px; }
      a { color: var(--accent); }
      .file { display: flex; justify-content: space-between; gap: 10px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 6px; background: var(--field); text-decoration: none; }
      .file small { color: var(--muted); }
      @media (max-width: 720px) { .source { grid-template-columns: 1fr; } header, main { padding-inline: 14px; } }
    </style>
  </head>
  <body>
    <header>
      <h1>Embroidery comparison</h1>
      <div class="meta">Generated: ${htmlEscape(generated)} | Mode: ${htmlEscape(state.comparison.mode)}</div>
    </header>
    <main>
      ${sections || "<section><h2>No results</h2></section>"}
    </main>
  </body>
</html>`;
}

function comparisonGroupHtml(group) {
  const sourceUrl = sourceUrlForGroup(group);
  const image = group.image ?? { name: "Source" };
  const sourceMedia = sourceUrl
    ? `<img src="${htmlEscape(sourceUrl)}" alt="">`
    : sourcePreviewHtml(image);
  const resultCards = group.results.map((result) => comparisonResultHtml(result)).join("\n");

  return `<section>
  <div class="source">
    <div>${sourceMedia}</div>
    <div>
      <h2>${htmlEscape(image.name)}</h2>
      <div class="meta">${group.results.length} provider result${group.results.length === 1 ? "" : "s"}</div>
    </div>
  </div>
  <div class="cards">${resultCards}</div>
</section>`;
}

function comparisonResultHtml(result) {
  const displayName = result.variantName
    ? `${result.providerName} - ${result.variantName}`
    : result.providerName;
  const runFiles = result.ok
    ? result.data.runFiles ?? []
    : result.logFile
      ? [{ name: "error.json", kind: "error", url: result.logFile }]
      : [];
  const previewUrl = previewUrlForResult(result);
  const previewHtml = result.ok
    ? previewUrl
      ? `<img src="${htmlEscape(previewUrl)}" alt="">`
      : previewBase64Html(result, 260)
    : `<div class="error-box">${htmlEscape(result.error || "Conversion failed")}</div>`;
  const metrics = result.ok
    ? metricItems(result.data.designInfo)
        .concat(result.options?.widthMm && result.options?.heightMm ? [["Target size", `${result.options.widthMm} x ${result.options.heightMm} mm`]] : [])
    : [["Status", "Failed"]];

  return `<article class="${result.ok ? "" : "error"}">
  <div class="card-head">
    <h3>${htmlEscape(displayName)}</h3>
    <span class="badge">${htmlEscape(result.mode || state.comparison.mode)}</span>
  </div>
  <div class="preview">${previewHtml}</div>
  <div class="metrics">${metrics.map(([label, value]) => `<div class="metric"><span>${htmlEscape(label)}</span><strong>${htmlEscape(value)}</strong></div>`).join("")}</div>
  <div class="files">${runFiles.map((file) => `<a class="file" href="${htmlEscape(absoluteUrl(file.url))}"><span>${htmlEscape(file.name)}</span><small>${htmlEscape(file.kind)}</small></a>`).join("") || '<span class="meta">No files</span>'}</div>
</article>`;
}

function sourceUrlForGroup(group) {
  for (const result of group.results) {
    const sourceUrl = sourceUrlForResult(result);
    if (sourceUrl) return sourceUrl;
  }
  return "";
}

function sourceUrlForResult(result) {
  const file = (result.data?.runFiles ?? []).find((item) => item.kind === "source-sent" && item.url);
  return file ? absoluteUrl(file.url) : "";
}

function previewUrlForResult(result) {
  const file = (result.data?.runFiles ?? []).find((item) => item.kind === "preview" && item.url);
  return file ? absoluteUrl(file.url) : "";
}

function previewBase64Html(result, width) {
  const preview = previewFile(result.data?.files ?? []);
  return preview
    ? `<img src="data:${htmlEscape(preview.mimeType)};base64,${preview.base64}" width="${width}" alt="">`
    : '<div class="placeholder">No preview</div>';
}

function absoluteUrl(url) {
  if (!url) return "";
  return new URL(url, location.origin).href;
}

function groupComparisonResultsByImage() {
  const groups = new Map();
  for (const result of state.comparison.results) {
    const imageName = result.image?.name ?? "source";
    const imageKey = result.image?.dataUrl
      ? result.image.dataUrl.slice(0, 80)
      : imageName;
    const key = `${imageName}|${imageKey}`;
    if (!groups.has(key)) {
      groups.set(key, { image: result.image, results: [] });
    }
    groups.get(key).results.push(result);
  }
  return Array.from(groups.values());
}

function setCompareStatus(message, type) {
  els.compareStatus.textContent = message;
  els.compareStatus.classList.toggle("error", type === "error");
  els.compareStatus.classList.toggle("ok", type === "ok");
}

function conversionErrorFromResponse(data) {
  const error = new Error(data.error || "Conversion failed");
  error.runId = data.runId;
  error.logFile = data.logFile;
  error.upstreamResponse = data.upstreamResponse;
  return error;
}

function mdEscape(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fileToImage(file) {
  return {
    name: file.name || "design.png",
    dataUrl: await readAsDataUrl(file),
  };
}

function renderMetrics(info) {
  els.metrics.replaceChildren();
  if (!info) return;

  const items = metricItems(info);


  for (const [label, value] of items) {
    const metric = document.createElement("div");
    metric.className = "metric";
    metric.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
    els.metrics.append(metric);
  }
}

function renderFiles(files) {
  els.files.replaceChildren();
  for (const file of files) {
    const link = document.createElement("a");
    link.className = "file-link";
    link.href = file.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.innerHTML = `<span>${escapeHtml(file.name)}</span><span>${escapeHtml(file.kind)}</span>`;
    els.files.append(link);
  }
}

function renderSwatches() {
  const colors = parseThreadInput();
  renderPaletteEditor({
    colors,
    container: els.swatches,
    onUpdate: (index, color) => {
      state.wilcomPaletteEdited = true;
      replacePaletteColor(els.threads, index, color);
      renderSwatches();
    },
    onRemove: (index) => {
      state.wilcomPaletteEdited = true;
      removePaletteColor(els.threads, index);
      renderSwatches();
    },
    onAdd: (color) => {
      state.wilcomPaletteEdited = true;
      addPaletteColor(els.threads, color);
      renderSwatches();
    },
  });
}

function renderCompareWilcomSwatches() {
  const colors = parseThreadText(els.compareWilcomThreads.value);
  renderPaletteEditor({
    colors,
    container: els.compareWilcomSwatches,
    onUpdate: (index, color) => {
      state.comparison.wilcomPaletteEdited = true;
      replacePaletteColor(els.compareWilcomThreads, index, color);
      renderCompareWilcomSwatches();
    },
    onRemove: (index) => {
      state.comparison.wilcomPaletteEdited = true;
      removePaletteColor(els.compareWilcomThreads, index);
      renderCompareWilcomSwatches();
    },
    onAdd: (color) => {
      state.comparison.wilcomPaletteEdited = true;
      addPaletteColor(els.compareWilcomThreads, color);
      renderCompareWilcomSwatches();
    },
  });
}

function renderPaletteEditor({ colors, container, onUpdate, onRemove, onAdd }) {
  container.replaceChildren();
  colors.forEach((color, index) => {
    const item = document.createElement("div");
    item.className = "swatch-item";

    const picker = document.createElement("input");
    picker.type = "color";
    picker.className = "swatch-color";
    picker.value = color.toLowerCase();
    picker.title = color;
    picker.setAttribute("aria-label", `Edit ${color}`);
    picker.addEventListener("change", () => onUpdate(index, picker.value));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "swatch-remove";
    remove.textContent = "x";
    remove.title = `Remove ${color}`;
    remove.setAttribute("aria-label", `Remove ${color}`);
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onRemove(index);
    });

    item.append(picker, remove);
    container.append(item);
  });

  const add = document.createElement("label");
  add.className = "swatch-item swatch-add";
  add.title = "Add color";

  const addInput = document.createElement("input");
  addInput.type = "color";
  addInput.className = "swatch-color";
  addInput.value = nextPaletteColor(colors).toLowerCase();
  addInput.setAttribute("aria-label", "Add thread color");
  addInput.addEventListener("change", () => onAdd(addInput.value));

  const addMark = document.createElement("span");
  addMark.textContent = "+";
  addMark.setAttribute("aria-hidden", "true");

  add.append(addInput, addMark);
  container.append(add);
}

function clearResult() {
  els.resultImage.removeAttribute("src");
  els.resultImage.hidden = true;
  els.resultImage.removeAttribute("tabindex");
  els.resultImage.removeAttribute("role");
  els.resultEmpty.hidden = false;
  els.resultEmpty.textContent = "No result yet";
  els.runId.textContent = "";
  els.metrics.replaceChildren();
  els.files.replaceChildren();
  els.requestXml.textContent = "";
  els.requestXml.hidden = true;
}

function updateRunState() {
  const current = currentProvider();
  const pulseProvider = state.providers.find((provider) => provider.id === "pulse");
  els.runButton.disabled = !state.image || !current || current.status !== "ready";
  els.pulseThreadTypeCompareButton.disabled = !state.image || pulseProvider?.status !== "ready";
  renderProviderOptions();
}

function renderProviderOptions() {
  els.wilcomOptions.hidden = state.provider !== "wilcom";
  els.pulseOptions.hidden = state.provider !== "pulse";
  els.melcoOptions.hidden = state.provider !== "melco";
  els.zskOptions.hidden = state.provider !== "zsk";
  els.targetSizeRow.hidden = !providerUsesTargetSize(state.provider);
  els.formatBlock.hidden =
    state.mode !== "design" || (state.provider === "pulse" && els.pulseRunType.value !== "full");
  els.removeBackgroundToggle.hidden = state.provider !== "wilcom";
  els.threadPaletteBlock.hidden = state.provider !== "wilcom" || els.wilcomColorSource.value !== "palette";
  els.wilcomThreadChartBlock.hidden = state.provider !== "wilcom" || els.wilcomColorSource.value !== "threadChart";
  els.wilcomDesignVersionBlock.hidden =
    state.provider !== "wilcom" || state.mode !== "design" || els.designFormat.value !== "emb";
}

function providerUsesTargetSize(providerId, providerOptions = undefined) {
  if (providerId === "pulse") {
    const pulseOptions =
      providerOptions ?? readPulseOptions({ ignoreSelectedProvider: true }) ?? {};
    return !pulseOptions.useImageDimensions;
  }
  if (providerId === "wilcom") {
    const wilcomOptions =
      providerOptions ?? readWilcomOptions({ ignoreSelectedProvider: true }) ?? {};
    return !wilcomOptions.useSourceDpi;
  }
  if (providerId === "melco") {
    const melcoOptions =
      providerOptions ?? readMelcoOptions({ ignoreSelectedProvider: true }) ?? {};
    return !melcoOptions.useDefaultSize;
  }
  return false;
}

function providerProducesDesignFile(providerId, providerOptions = undefined) {
  if (providerId === "pulse") {
    return (providerOptions?.runType ?? "full") === "full";
  }
  return true;
}

function renderFormatOptions() {
  const currentValue = els.designFormat.value;
  const formats = providerFormats[state.provider] ?? ["dst"];
  els.designFormat.replaceChildren(
    ...formats.map((format) => {
      const option = document.createElement("option");
      option.value = format;
      option.textContent = format.toUpperCase();
      return option;
    })
  );
  els.designFormat.value = formats.includes(currentValue) ? currentValue : formats[0];
}

function setStatus(message, type) {
  els.statusBox.textContent = message;
  els.statusBox.classList.toggle("error", type === "error");
  els.statusBox.classList.toggle("ok", type === "ok");
}

function currentProvider() {
  return state.providers.find((provider) => provider.id === state.provider);
}

function currentSample() {
  return (
    state.samples.find((sample) => sample.name === state.selectedSampleName) ??
    state.samples.find((sample) => sample.name === DEFAULT_SAMPLE_NAME) ??
    state.samples[0] ??
    null
  );
}

function parseThreadInput() {
  return parseThreadText(els.threads.value);
}

function parseThreadText(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^#?[0-9a-fA-F]{6}$/.test(item))
    .map((item) => (item.startsWith("#") ? item : `#${item}`));
}

function addPaletteColor(input, color) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return;

  const colors = parseThreadText(input.value).map((item) => item.toUpperCase());
  if (!colors.includes(normalized)) colors.push(normalized);
  input.value = colors.join(",");
}

function replacePaletteColor(input, index, color) {
  const normalized = normalizeHexColor(color);
  const colors = parseThreadText(input.value).map((item) => item.toUpperCase());
  if (!normalized || index < 0 || index >= colors.length) return;

  const existingIndex = colors.indexOf(normalized);
  if (existingIndex >= 0 && existingIndex !== index) {
    colors.splice(index, 1);
    input.value = colors.join(",");
    return;
  }

  colors[index] = normalized;
  input.value = colors.join(",");
}

function removePaletteColor(input, index) {
  const colors = parseThreadText(input.value).map((item) => item.toUpperCase());
  if (index < 0 || index >= colors.length) return;

  colors.splice(index, 1);
  input.value = colors.join(",");
}

function setPaletteColors(input, colors) {
  const normalized = [];
  for (const color of colors) {
    const next = normalizeHexColor(color);
    if (next && !normalized.includes(next)) normalized.push(next);
  }
  if (normalized.length > 0) input.value = normalized.join(",");
}

function nextPaletteColor(colors) {
  const defaults = ["#0073CF", "#FFFFFF", "#FF5B00", "#FF2BA6", "#64C05A", "#000000"];
  const existing = new Set(colors.map((item) => item.toUpperCase()));
  return defaults.find((color) => !existing.has(color)) ?? "#0073CF";
}

function normalizeHexColor(value) {
  const match = String(value || "").trim().match(/^#?[0-9a-fA-F]{6}$/);
  if (!match) return "";
  const hex = match[0].startsWith("#") ? match[0] : `#${match[0]}`;
  return hex.toUpperCase();
}

async function populatePaletteFromImage(image, input, render) {
  const colors = await extractThreadPaletteFromImage(image);
  if (colors.length === 0) return;

  setPaletteColors(input, colors);
  render();
}

async function populateComparePaletteFromSelection() {
  if (state.comparison.wilcomPaletteEdited) return;

  const image = await firstComparePaletteImage();
  if (!image) return;

  await populatePaletteFromImage(image, els.compareWilcomThreads, renderCompareWilcomSwatches);
}

async function firstComparePaletteImage() {
  if (state.comparison.uploads.length > 0) return state.comparison.uploads[0];

  const [sampleName] = state.comparison.selectedSampleNames;
  const sample = state.samples.find((item) => item.name === sampleName);
  if (!sample) return state.image;

  const response = await fetch(sample.url, { cache: "no-store" });
  if (!response.ok) return state.image;

  const blob = await response.blob();
  const file = new File([blob], sample.name, { type: blob.type || "image/png" });
  return fileToImage(file);
}

async function extractThreadPaletteFromImage(image) {
  if (!image || !isImageDataUrl(image.dataUrl)) return [];

  try {
    return await extractDominantColors(image.dataUrl, AUTO_THREAD_PALETTE_SIZE);
  } catch {
    return [];
  }
}

async function extractDominantColors(dataUrl, maxColors) {
  const source = await loadImageForPalette(dataUrl);
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) return [];

  const maxSide = 180;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];

  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  const pixels = context.getImageData(0, 0, width, height).data;
  const buckets = new Map();
  let opaquePixels = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 80) continue;

    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const key = `${red >> 4},${green >> 4},${blue >> 4}`;
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
    opaquePixels += 1;
  }

  if (opaquePixels === 0) return [];

  const candidates = Array.from(buckets.values())
    .filter((bucket) => bucket.count >= 3)
    .map((bucket) => ({
      count: bucket.count,
      share: bucket.count / opaquePixels,
      red: Math.round(bucket.red / bucket.count),
      green: Math.round(bucket.green / bucket.count),
      blue: Math.round(bucket.blue / bucket.count),
    }))
    .sort((left, right) => right.count - left.count);

  const selected = [];
  for (const candidate of candidates) {
    if (selected.length >= maxColors) break;
    if (isDominantWhiteBackground(candidate)) continue;
    if (selected.some((color) => colorDistance(color, candidate) < 42)) continue;
    selected.push(candidate);
  }

  return selected.map(({ red, green, blue }) => rgbToHex(red, green, blue));
}

function loadImageForPalette(src) {
  return new Promise((resolveLoad, rejectLoad) => {
    const image = new Image();
    image.onload = () => resolveLoad(image);
    image.onerror = () => rejectLoad(new Error("Cannot read image colors"));
    image.src = src;
  });
}

function isDominantWhiteBackground(color) {
  return color.share > 0.25 && color.red > 244 && color.green > 244 && color.blue > 244;
}

function colorDistance(left, right) {
  return Math.hypot(left.red - right.red, left.green - right.green, left.blue - right.blue);
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function readWilcomOptions({ ignoreSelectedProvider = false } = {}) {
  if (!ignoreSelectedProvider && state.provider !== "wilcom") return undefined;

  return stripEmpty({
    inputKind: els.wilcomInputKind.value,
    useSourceDpi: els.wilcomUseSourceDpi.checked,
    dpi: els.dpi.value,
    designVersion:
      state.mode === "design" && els.designFormat.value === "emb"
        ? els.wilcomDesignVersion.value
        : undefined,
    colorSource: els.wilcomColorSource.value,
    threads: els.wilcomColorSource.value === "palette" ? parseThreadInput() : undefined,
    threadChart: els.wilcomColorSource.value === "threadChart" ? state.wilcomThreadChart : undefined,
    removeBackground: els.removeBackground.checked,
  });
}

function readPulseOptions({ ignoreSelectedProvider = false } = {}) {
  if (!ignoreSelectedProvider && state.provider !== "pulse") return undefined;

  return stripEmpty({
    runType: els.pulseRunType.value,
    timeoutSeconds: els.pulseTimeoutSeconds.value,
    threadType: els.pulseThreadType.value,
    threadThickness: els.pulseThreadThickness.value,
    ignoreSmallAreas: els.pulseIgnoreSmallAreas.checked,
    createSatinAndSteil: els.pulseCreateSatin.checked,
    addSteilBorders: els.pulseAddSteilBorders.checked,
    generateBackground: els.pulseGenerateBackground.checked,
    sequenceType: els.pulseSequenceType.value,
    trimType: els.pulseTrimType.value,
    lockType: els.pulseLockType.value,
    trimThreshold: els.pulseTrimThreshold.value,
    maximumRunWidth: els.pulseMaximumRunWidth.value,
    maximumSatinWidth: els.pulseMaximumSatinWidth.value,
    maximumSteilWidth: els.pulseMaximumSteilWidth.value,
    numColors: els.pulseNumColors.value,
    renderWidth: els.pulseRenderWidth.value,
    renderHeight: els.pulseRenderHeight.value,
    renderPadding: els.pulseRenderPadding.value,
    recipe: els.pulseRecipe.value,
    proportionalResize: els.pulseProportionalResize.checked,
    lightenShadows: els.pulseLightenShadows.checked,
    transparentPreview: els.pulseTransparentPreview.checked,
    useImageDimensions: els.pulseUseImageDimensions.checked,
  });
}

function readMelcoOptions({ ignoreSelectedProvider = false } = {}) {
  if (!ignoreSelectedProvider && state.provider !== "melco") return undefined;

  return stripEmpty({
    useDefaultSize: els.melcoUseDefaultSize.checked,
  });
}

function readZskOptions({ ignoreSelectedProvider = false } = {}) {
  if (!ignoreSelectedProvider && state.provider !== "zsk") return undefined;

  return {
    ace: {
      optimize: stripEmpty({
        imageType: els.zskImageType.value,
        tolerance: els.zskOptimizeTolerance.value,
        removeArea: els.zskRemoveArea.value,
        maxColors: els.zskMaxColors.value,
      }),
      vector: stripEmpty({
        tolerance: els.zskVectorTolerance.value,
        smoothing: els.zskSmoothing.value,
        determineBackgroundColor: els.zskDetermineBackground.checked,
        backgroundColor: els.zskBackgroundColor.value,
        backgroundFill: els.zskBackgroundFill.checked,
      }),
      punch: stripEmpty({
        lineWidth: els.zskLineWidth.value,
        satinStitchWidth: els.zskSatinStitchWidth.value,
        overlap: els.zskOverlap.value,
        minimumAreaSize: els.zskMinimumAreaSize.value,
        minimumHoleSize: els.zskMinimumHoleSize.value,
        minimumLineLength: els.zskMinimumLineLength.value,
        threadCones: els.zskThreadCones.value,
      }),
    },
  };
}

function readSourcePreprocessingOptions() {
  return stripEmpty({
    maxSourceSidePx: els.sourceMaxSide.value,
    minSourceSidePx: els.sourceMinSide.value,
  });
}

function readCompareSourcePreprocessingOptions() {
  return stripEmpty({
    maxSourceSidePx: els.compareSourceMaxSide.value,
    minSourceSidePx: els.compareSourceMinSide.value,
  });
}

function stripEmpty(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== "" && item !== undefined && item !== null)
  );
}

async function preserveScroll(action) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const sampleGridScrollTop = els.sampleGrid.scrollTop;
  const compareSampleGridScrollTop = els.compareSampleGrid?.scrollTop ?? 0;
  await action();
  restoreScrollPosition(scrollX, scrollY, sampleGridScrollTop, compareSampleGridScrollTop);
}

function restoreScrollPosition(scrollX, scrollY, sampleGridScrollTop, compareSampleGridScrollTop) {
  const restore = () => {
    window.scrollTo(scrollX, scrollY);
    els.sampleGrid.scrollTop = sampleGridScrollTop;
    if (els.compareSampleGrid) els.compareSampleGrid.scrollTop = compareSampleGridScrollTop;
  };

  restore();
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
}

function preventPointerFocusScroll(event) {
  event.preventDefault();
}

function waitForImageLoad(image) {
  return new Promise((resolveLoad) => {
    const timeout = window.setTimeout(done, 1500);
    function done() {
      window.clearTimeout(timeout);
      image.removeEventListener("load", done);
      image.removeEventListener("error", done);
      resolveLoad();
    }

    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
  });
}

function readAsDataUrl(file) {
  return new Promise((resolveRead, rejectRead) => {
    const reader = new FileReader();
    reader.onload = () => resolveRead(String(reader.result));
    reader.onerror = () => rejectRead(reader.error);
    reader.readAsDataURL(file);
  });
}

async function updateWilcomThreadChartName() {
  const [file] = els.wilcomThreadChart.files ?? [];
  if (!file) {
    state.wilcomThreadChart = undefined;
    els.wilcomThreadChartName.textContent = "No chart selected";
    updateRunState();
    return;
  }

  state.wilcomThreadChart = await fileToImage(file);
  els.wilcomThreadChartName.textContent = file.name;
  updateRunState();
}

async function updateCompareWilcomThreadChartName() {
  const [file] = els.compareWilcomThreadChart.files ?? [];
  if (!file) {
    state.comparison.wilcomThreadChart = undefined;
    els.compareWilcomThreadChartName.textContent = "No chart selected";
    return;
  }

  state.comparison.wilcomThreadChart = await fileToImage(file);
  els.compareWilcomThreadChartName.textContent = file.name;
}

function isImageDataUrl(value) {
  return /^data:image\//i.test(String(value || ""));
}

function formatDimension(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  if (unit) return `${number} ${unit}`;
  return `${number.toFixed(1)} mm`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function providerLabel(providerId) {
  return state.providers.find((provider) => provider.id === providerId)?.name ?? providerId;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

