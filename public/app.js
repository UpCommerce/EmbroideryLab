const state = {
  providers: [],
  samples: [],
  selectedSampleName: "",
  provider: "wilcom",
  mode: "trueview",
  image: null,
};

const DEFAULT_SAMPLE_URL = "/samples/example.png";
const DEFAULT_SAMPLE_NAME = "example.png";

const providerFormats = {
  wilcom: ["emb", "dst", "pes", "exp", "jef"],
  pulse: ["dst", "pes", "pxf", "tcf", "z00", "pcf"],
};

const els = {
  providerStatus: document.querySelector("#provider-status"),
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
  widthMm: document.querySelector("#width-mm"),
  heightMm: document.querySelector("#height-mm"),
  designFormat: document.querySelector("#design-format"),
  dpi: document.querySelector("#dpi"),
  wilcomOptions: document.querySelector("#wilcom-options"),
  threadPaletteBlock: document.querySelector("#thread-palette-block"),
  threads: document.querySelector("#threads"),
  swatches: document.querySelector("#swatches"),
  removeBackgroundToggle: document.querySelector("#remove-background-toggle"),
  removeBackground: document.querySelector("#remove-background"),
  pulseOptions: document.querySelector("#pulse-options"),
  pulseThreadType: document.querySelector("#pulse-thread-type"),
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
};

await init();

async function init() {
  wireEvents();
  await loadProviders();
  await loadSamples();
  renderFormatOptions();
  renderSwatches();
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
  els.runButton.addEventListener("click", runConversion);
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
  els.sourceImage.src = dataUrl;
  els.sourceImage.hidden = false;
  els.sourceEmpty.hidden = true;
  clearResult();
  renderSamples();
  updateRunState();
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
    button.title = sample.name;
    button.innerHTML = `<img src="${sample.url}" alt=""><span>${escapeHtml(sample.name)}</span>`;
    button.addEventListener("click", () => loadSampleImage(sample));
    els.sampleGrid.append(button);
  }
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
      options: {
        mode: state.mode,
        widthMm: els.widthMm.value,
        heightMm: els.heightMm.value,
        designFormat: els.designFormat.value,
        dpi: els.dpi.value,
        threads: parseThreadInput(),
        removeBackground: els.removeBackground.checked,
        pulse: readPulseOptions(),
      },
    };

    const response = await fetch("/api/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Conversion failed");
    }

    renderResult(data);
    setStatus("Conversion complete", "ok");
  } catch (error) {
    setStatus(error.message || "Conversion failed", "error");
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
    els.resultEmpty.hidden = true;
  } else {
    els.resultImage.hidden = true;
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

function renderMetrics(info) {
  els.metrics.replaceChildren();
  if (!info) return;

  const items = [
    ["Stitches", info.num_stitches],
    ["Colors", info.num_colours],
    ["Trims", info.num_trims],
    ["Width", formatMm(info.width)],
    ["Height", formatMm(info.height)],
    ["Objects", info.num_objects],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");

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
  els.swatches.replaceChildren();
  for (const color of parseThreadInput()) {
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.background = color;
    swatch.title = color;
    els.swatches.append(swatch);
  }
}

function clearResult() {
  els.resultImage.removeAttribute("src");
  els.resultImage.hidden = true;
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
  els.runButton.disabled = !state.image || !current || current.status !== "ready";
  els.designFormat.disabled = state.mode !== "design";
  renderProviderOptions();
}

function renderProviderOptions() {
  els.wilcomOptions.hidden = state.provider !== "wilcom";
  els.pulseOptions.hidden = state.provider !== "pulse";
  els.removeBackgroundToggle.hidden = false;
  els.threadPaletteBlock.hidden = false;
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
  return els.threads.value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^#?[0-9a-fA-F]{6}$/.test(item))
    .map((item) => (item.startsWith("#") ? item : `#${item}`));
}

function readPulseOptions() {
  if (state.provider !== "pulse") return undefined;

  return stripEmpty({
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

function stripEmpty(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== "" && item !== undefined && item !== null)
  );
}

function readAsDataUrl(file) {
  return new Promise((resolveRead, rejectRead) => {
    const reader = new FileReader();
    reader.onload = () => resolveRead(String(reader.result));
    reader.onerror = () => rejectRead(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatMm(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)} mm` : value;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
