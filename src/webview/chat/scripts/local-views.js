// Responsabilidade: renderiza configuracoes e o painel de saude do ambiente local.
function renderConfigView() {
  currentView = "config";
  notifyCurrentView();
  contentContainer.innerHTML = `
    <div id="settings-view">
      <button id="atlas-btn" class="settings-option">Configurações Gerais</button>
      <button id="keys-btn" class="settings-option">Provedores em Nuvem</button>
      <button id="rag-btn" class="settings-option">RAG</button>
    </div>
  `;
  document.getElementById("keys-btn")?.addEventListener("click", () => {
    vscode.postMessage({ type: "abrirPainelConfig", selectedView: "config" });
  });
  document.getElementById("atlas-btn")?.addEventListener("click", () => {
    vscode.postMessage({ type: "abrirPainelConfig", selectedView: "atlas" });
  });
  document.getElementById("rag-btn")?.addEventListener("click", () => {
    vscode.postMessage({ type: "abrirPainelConfig", selectedView: "rag" });
  });
}

function renderLibraryView() {
  currentView = "library";
  notifyCurrentView();
  contentContainer.innerHTML = `
    <section class="local-health-view local-health-loading-active" aria-busy="true">
      <div class="local-health-header">
        <div class="local-health-icon" aria-hidden="true">
          <i class="codicon codicon-pulse"></i>
        </div>
        <div>
          <h2>Ambiente Local</h2>
          <p>Saúde da execução dos modelos locais</p>
        </div>
      </div>

      <div
        id="local-health-loading"
        class="local-health-loading"
        role="status"
        aria-live="polite"
        aria-label="Carregando ambiente local"
      >
        <span class="spinner" aria-hidden="true"></span>
      </div>

      <div id="local-health-content" class="local-health-content" aria-hidden="true">
        <div class="local-health-status">
          <span class="local-health-dot"></span>
          <span id="local-health-engine">Engine: -</span>
        </div>

        <div class="local-engine-selection">
          <label for="local-engine-select">Engine de execução</label>
          <select
            id="local-engine-select"
            aria-describedby="local-engine-select-description local-engine-selection-status"
          >
            <option value="" disabled>Carregando engines instaladas...</option>
          </select>
          <small id="local-engine-select-description">
            Apenas engines instaladas são exibidas. Gerencie outras em
            Configurações Gerais; trocar a opção encerra a engine ativa.
          </small>
          <small
            id="local-engine-selection-status"
            class="local-engine-selection-status"
            role="status"
            aria-live="polite"
          ></small>
        </div>

        <button class="local-engine-toggle-button" id="local-engine-toggle">
          <i class="codicon codicon-debug-start"></i>
          <span>Iniciar engine</span>
        </button>

        <div class="local-health-meter">
          <div class="local-health-meter-top">
            <span>VRAM</span>
            <strong id="local-health-vram-summary">-</strong>
          </div>
          <div class="local-health-bar" aria-hidden="true">
            <span id="local-health-vram-bar"></span>
          </div>
          <div class="local-health-meter-meta">
            <span id="local-health-vram-used">Usada: -</span>
            <span id="local-health-vram-free">Livre: -</span>
          </div>
        </div>

        <div class="local-health-list">
          <div class="local-health-item">
            <span>Modelos instalados</span>
            <strong id="local-health-model-count">0</strong>
          </div>
          <div class="local-health-item">
            <span>Espaço ocupado</span>
            <strong id="local-health-model-size">-</strong>
          </div>
          <div class="local-health-item local-health-folder">
            <span>Pasta dos modelos</span>
            <strong id="local-health-model-folder">-</strong>
          </div>
        </div>

        <button class="local-health-folder-button" id="local-health-open-folder">
          <i class="codicon codicon-folder-opened"></i>
          <span>Abrir pasta</span>
        </button>
      </div>
    </section>
  `;
  bindLocalHealthEvents();
  vscode.postMessage({ type: "abrirPainelConfig", selectedView: "library" });
  requestLocalHealthModels();
}

function requestLocalHealthModels() {
  localHealthLoadError = null;
  setLocalHealthLoading(true);
  window.clearTimeout(localHealthLoadingTimeout);
  localHealthLoadingTimeout = window.setTimeout(() => {
    if (!isLocalHealthLoading) {
      return;
    }

    localHealthLoadError =
      "O ambiente local demorou mais que o esperado para responder.";
    setLocalHealthLoading(false);
    renderLocalHealthPanel();
  }, 10000);

  vscode.postMessage({ type: "requestModels" });
}

function setLocalHealthLoading(loading) {
  isLocalHealthLoading = loading;

  const view = document.querySelector(".local-health-view");
  const loadingElement = document.getElementById("local-health-loading");
  const content = document.getElementById("local-health-content");

  view?.classList.toggle("local-health-loading-active", loading);
  view?.setAttribute("aria-busy", loading ? "true" : "false");

  if (loadingElement) {
    loadingElement.hidden = !loading;
  }

  if (content) {
    content.setAttribute("aria-hidden", loading ? "true" : "false");
  }
}

function releaseLocalHealthLoading() {
  window.clearTimeout(localHealthLoadingTimeout);
  setLocalHealthLoading(false);
}

function bindLocalHealthEvents() {
  document
    .getElementById("local-health-open-folder")
    ?.addEventListener("click", () => {
      vscode.postMessage({ type: "openLocalModelsFolder" });
    });

  document
    .getElementById("local-engine-toggle")
    ?.addEventListener("click", () => {
      if (isLocalEngineActionRunning || isLocalEngineSelectionRunning) {
        return;
      }

      const isRunning = libraryHealth?.engineRunning === true;
      isLocalEngineActionRunning = true;
      renderLocalEngineToggle();
      vscode.postMessage({
        type: isRunning ? "stopLocalEngineRequest" : "startLocalEngineRequest",
      });
    });

  document
    .getElementById("local-engine-select")
    ?.addEventListener("change", (event) => {
      if (isLocalEngineActionRunning || isLocalEngineSelectionRunning) {
        renderLocalEngineSelector();
        return;
      }

      const engineType = normalizeLocalEngineType(event.target?.value);
      const currentEngineType = normalizeLocalEngineType(
        libraryHealth?.engineType,
      );

      if (engineType === currentEngineType) {
        return;
      }

      pendingLocalEngineType = engineType;
      isLocalEngineSelectionRunning = true;
      localEngineSelectionError = false;
      localEngineSelectionMessage = `Selecionando ${formatLocalEngineType(engineType)}...`;
      renderLocalEngineSelector();
      renderLocalEngineToggle();

      vscode.postMessage({
        type: "selecionarEngineLocal",
        engineType,
      });
    });
}

function renderLocalHealthPanel() {
  const health = libraryHealth || {};
  const gpuMemory = health.gpuMemory || null;
  const usedBytes = Number(gpuMemory?.usedBytes) || 0;
  const totalBytes = Number(gpuMemory?.totalBytes) || 0;
  const freeBytes =
    Number(gpuMemory?.freeBytes) || Math.max(0, totalBytes - usedBytes);
  const usedPercent =
    totalBytes > 0
      ? Math.max(0, Math.min(100, (usedBytes / totalBytes) * 100))
      : 0;

  if (localHealthLoadError) {
    setLocalHealthText("local-health-engine", localHealthLoadError);
    setLocalHealthText("local-health-vram-summary", "-");
    setLocalHealthText("local-health-vram-used", "Usada: -");
    setLocalHealthText("local-health-vram-free", "Livre: -");
    setLocalHealthText("local-health-model-count", "-");
    setLocalHealthText("local-health-model-size", "-");
    setLocalHealthText("local-health-model-folder", "-");

    const bar = document.getElementById("local-health-vram-bar");
    if (bar) {
      bar.style.width = "0%";
    }

    renderLocalEngineSelector();
    renderLocalEngineToggle();
    return;
  }

  setLocalHealthText(
    "local-health-engine",
    `Engine: ${String(health.engineType || "cpu").toUpperCase()} · ${
      health.engineRunning ? "ativa" : "parada"
    }`,
  );
  setLocalHealthText(
    "local-health-vram-summary",
    gpuMemory?.totalLabel || gpuMemory?.label || "Não detectada",
  );
  setLocalHealthText(
    "local-health-vram-used",
    totalBytes > 0
      ? `Usada: ${gpuMemory.usedLabel || formatLocalHealthBytes(usedBytes)}`
      : "Usada: -",
  );
  setLocalHealthText(
    "local-health-vram-free",
    totalBytes > 0
      ? `Livre: ${gpuMemory.freeLabel || formatLocalHealthBytes(freeBytes)}`
      : "Livre: -",
  );
  setLocalHealthText(
    "local-health-model-count",
    String(health.modelsCount ?? libraryModels.length),
  );
  setLocalHealthText(
    "local-health-model-size",
    health.totalSizeLabel || formatLocalHealthBytes(sumLocalModelBytes()),
  );
  setLocalHealthText("local-health-model-folder", health.modelsDir || "-");

  const bar = document.getElementById("local-health-vram-bar");
  if (bar) {
    bar.style.width = `${usedPercent}%`;
  }

  renderLocalEngineSelector();
  renderLocalEngineToggle();
}

function renderLocalEngineSelector() {
  const select = document.getElementById("local-engine-select");
  const status = document.getElementById("local-engine-selection-status");
  const availableEngineTypes = getAvailableLocalEngineTypes();
  const engineType = normalizeLocalEngineType(
    pendingLocalEngineType || libraryHealth?.engineType,
  );

  if (select) {
    renderLocalEngineOptions(select, availableEngineTypes, engineType);
    select.disabled =
      availableEngineTypes.length === 0 ||
      isLocalEngineActionRunning ||
      isLocalEngineSelectionRunning;
    select.setAttribute(
      "aria-busy",
      isLocalEngineSelectionRunning ? "true" : "false",
    );
  }

  if (status) {
    status.textContent = localEngineSelectionMessage;
    status.classList.toggle("is-error", localEngineSelectionError);
  }
}

function renderLocalEngineOptions(select, availableEngineTypes, engineType) {
  const hasSelectedEngine = availableEngineTypes.includes(engineType);
  const options = [];

  if (availableEngineTypes.length === 0) {
    options.push(
      '<option value="" disabled>Nenhuma engine instalada</option>',
    );
  } else if (!hasSelectedEngine) {
    options.push(
      '<option value="" disabled>Selecione uma engine instalada</option>',
    );
  }

  availableEngineTypes.forEach((availableEngineType) => {
    options.push(
      `<option value="${availableEngineType}">${formatLocalEngineType(availableEngineType)}</option>`,
    );
  });

  select.innerHTML = options.join("");
  select.value = hasSelectedEngine ? engineType : "";
}

function getAvailableLocalEngineTypes() {
  if (
    localHealthLoadError ||
    !Array.isArray(libraryHealth?.availableEngineTypes)
  ) {
    return [];
  }

  return ["cpu", "cuda", "vulkan"].filter((engineType) =>
    libraryHealth.availableEngineTypes.includes(engineType),
  );
}

function renderLocalEngineToggle() {
  const button = document.getElementById("local-engine-toggle");
  if (!button) {
    return;
  }

  const isRunning = libraryHealth?.engineRunning === true;
  const icon = isLocalEngineActionRunning
    ? "loading"
    : isRunning
      ? "debug-stop"
      : "debug-start";
  const label = isLocalEngineActionRunning
    ? isRunning
      ? "Parando..."
      : "Iniciando..."
    : isRunning
      ? "Parar engine"
      : "Iniciar engine";

  button.disabled =
    isLocalEngineActionRunning || isLocalEngineSelectionRunning;
  button.classList.toggle("running", isRunning);
  button.innerHTML = `
    <i class="codicon codicon-${icon}"></i>
    <span>${label}</span>
  `;
}

function normalizeLocalEngineType(engineType) {
  return engineType === "cuda" || engineType === "vulkan"
    ? engineType
    : "cpu";
}

function formatLocalEngineType(engineType) {
  if (engineType === "cuda") {
    return "GPU NVIDIA CUDA";
  }

  if (engineType === "vulkan") {
    return "GPU Vulkan";
  }

  return "CPU";
}

function setLocalHealthText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value ?? "";
  }
}

function sumLocalModelBytes() {
  return libraryModels.reduce(
    (sum, model) => sum + (Number(model.sizeBytes) || 0),
    0,
  );
}

function formatLocalHealthBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// ── Navbar wiring ─────────────────────────────────────────────────────────────
