(() => {
  const app = window.atlasLibrary;
  const { refs, state, ui } = app;
  const byteUnits = ["B", "KB", "MB", "GB", "TB"];
  const sizeUnitIndexes = new Map(
    byteUnits.map((unit, index) => [unit.toLowerCase(), index]),
  );
  const sizePattern = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)$/i;

  function setupGpuSlider() {
    refs.gpuSlider?.addEventListener("input", () => {
      if (state.currentGpuSliderModel?.params) {
        state.currentGpuSliderModel.params.gpu =
          Number(refs.gpuSlider.value) || 0;
      }

      updateGpuSliderLabels(state.currentGpuSliderModel);
    });
  }

  function configureGpuSlider(model) {
    state.currentGpuSliderModel = model;

    if (!refs.gpuSlider) {
      return;
    }

    const totalLayers = getModelLayerCount(model);
    const recommendation = calculateGpuLayerRecommendation(model, totalLayers);
    const savedLayers = Number(model.params?.gpu);

    refs.gpuSlider.min = "0";
    refs.gpuSlider.max = String(totalLayers);
    refs.gpuSlider.step = "1";
    refs.gpuSlider.value = String(
      clamp(
        Number.isFinite(savedLayers) ? savedLayers : recommendation.performance,
        0,
        totalLayers,
      ),
    );

    updateGpuSliderLabels(model);
  }

  function updateGpuSliderLabels(model) {
    if (!refs.gpuSlider || !model) {
      return;
    }

    const totalLayers = getModelLayerCount(model);
    const value = Number(refs.gpuSlider.value) || 0;
    const layerBytes = getEstimatedLayerBytes(model, totalLayers);
    const hardware = model.hardware?.gpuMemory;
    const recommendation = calculateGpuLayerRecommendation(model, totalLayers);

    ui.setText(
      "gpu-layer-value",
      value === 0
        ? `Automático (0 de ${totalLayers})`
        : `${value} de ${totalLayers} camadas na GPU`,
    );
    ui.setText(
      "gpu-layer-recommendation",
      hardware
        ? `Seguro: ${recommendation.safe} · Alto desempenho: ${recommendation.performance}`
        : "VRAM não detectada",
    );
    ui.setText(
      "gpu-layer-size",
      value === 0
        ? "0 usa ajuste automático da engine"
        : layerBytes > 0
          ? `Camada estimada: ${formatBytes(layerBytes)}`
          : "Camada: -",
    );
    ui.setText(
      "gpu-vram-total",
      hardware?.label ? `VRAM total: ${hardware.label}` : "VRAM total: -",
    );
  }

  function calculateGpuLayerRecommendation(model, totalLayers) {
    const hardware = model.hardware?.gpuMemory;
    const layerBytes = getEstimatedLayerBytes(model, totalLayers);

    if (!hardware?.totalBytes || !layerBytes) {
      const fallback = Number(model.params?.gpu) || 0;

      return {
        safe: fallback,
        performance: fallback,
      };
    }

    const safeReserveBytes = Math.max(
      512 * 1024 ** 2,
      hardware.totalBytes * 0.14,
    );
    const safeUsableBytes = Math.max(
      0,
      hardware.totalBytes * 0.86 - safeReserveBytes,
    );
    const performanceUsableBytes = Math.max(
      0,
      hardware.totalBytes * 0.94 - 384 * 1024 ** 2,
    );

    return {
      safe: clamp(Math.floor(safeUsableBytes / layerBytes), 0, totalLayers),
      performance: clamp(
        Math.floor(performanceUsableBytes / layerBytes),
        0,
        totalLayers,
      ),
    };
  }

  function getEstimatedLayerBytes(model, totalLayers) {
    const sizeBytes = Number(model.sizeBytes) || parseSizeToBytes(model.size);

    if (!sizeBytes || !totalLayers) {
      return 0;
    }

    return sizeBytes / totalLayers;
  }

  function getModelLayerCount(model) {
    const detected = Number(model.layerInfo?.totalLayers);

    if (Number.isFinite(detected) && detected > 0) {
      return detected;
    }

    const label = `${model.name || ""} ${model.tag || ""}`.toLowerCase();
    const match = label.match(/(\d+(?:\.\d+)?)\s*b/);
    const params = match ? Number(match[1]) : 8;

    if (params >= 65) {
      return 80;
    }

    if (params >= 30) {
      return 64;
    }

    if (params >= 13) {
      return 40;
    }

    return 32;
  }

  function parseSizeToBytes(value) {
    const match = String(value || "")
      .trim()
      .replace(",", ".")
      .match(sizePattern);

    if (!match) {
      return 0;
    }

    return (
      Number(match[1]) * 1024 ** sizeUnitIndexes.get(match[2].toLowerCase())
    );
  }

  function formatBytes(bytes) {
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < byteUnits.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${byteUnits[unitIndex]}`;
  }

  function clamp(value, min, max) {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      return min;
    }

    return Math.max(min, Math.min(max, numberValue));
  }

  app.gpu = {
    configureGpuSlider,
    setupGpuSlider,
    updateGpuSliderLabels,
  };
})();
