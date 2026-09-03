// Responsabilidade: avalia a compatibilidade local entre hardware e variante do modelo.
(function () {
  const MINIMUM_COMFORTABLE_VRAM_RATIO = 0.55;
  const VRAM_CAPACITY_WARNING_MARGIN_RATIO = 0.125;
  const MINIMUM_RECOMMENDED_VRAM_GIB = 4;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderCompatibilityItem(label, value) {
    return `
      <div class="compatibility-item">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || "Desconhecido")}</strong>
      </div>
    `;
  }

  function formatMemoryBytes(bytes) {
    const value = Number(bytes) || 0;

    if (value <= 0) {
      return "Não detectada";
    }

    const gibibytes = value / 1024 ** 3;

    if (gibibytes >= 1) {
      const precision = gibibytes >= 10 || Number.isInteger(gibibytes) ? 0 : 1;
      return `${gibibytes.toFixed(precision).replace(".", ",")} GB`;
    }

    return `${Math.round(value / 1024 ** 2)} MB`;
  }

  function getCompatibilityTone(level, isVramCapacityWarning) {
    if (level === "good") {
      return {
        className: "compatibility-good",
        icon: "pass",
        label: "Compatível",
        message:
          "A variante parece adequada para execução local com RAM e VRAM confortáveis.",
      };
    }

    if (level === "warning") {
      return {
        className: "compatibility-warning",
        icon: "warning",
        label: "Com ressalvas",
        message: isVramCapacityWarning
          ? "Esta variante está no limite da memória de vídeo disponível. Durante a execução, parte dos dados pode precisar ser transferida para a RAM, reduzindo consideravelmente a velocidade de resposta. Considere uma variante menor para obter melhor desempenho."
          : "A variante pode funcionar, mas algum recurso local está abaixo da faixa ideal.",
      };
    }

    return {
      className: "compatibility-danger",
      icon: "error",
      label: "Não recomendado",
      message:
        "A variante parece pesada para os recursos locais disponíveis. Considere uma opção menor.",
    };
  }

  function getQuantizationText(selectedFile) {
    const source = `${selectedFile?.quantization || ""} ${selectedFile?.name || ""}`;
    return source.toUpperCase();
  }

  function getQuantizationBase(selectedFile) {
    const quantization = getQuantizationText(selectedFile);

    if (/\b(F32|FLOAT32)\b/.test(quantization)) {
      return "F32";
    }

    if (/\b(F16|BF16|FLOAT16)\b/.test(quantization)) {
      return "F16";
    }

    const match = quantization.match(/\b(I?Q[1-8])(?:[_-][A-Z0-9]+)*\b/);
    return match?.[1] || "";
  }

  function getQuantizationProfile(model, selectedFile) {
    const quantizationBase = getQuantizationBase(selectedFile);

    if (quantizationBase === "F32") {
      return {
        label: "F32",
        description: "Precisão integral, muito pesada",
        bytesPerParameter: 4,
        minimumRamMultiplier: 1.75,
        recommendedRamMultiplier: 2.8,
        minimumVramRatio: 0.45,
        recommendedVramRatio: 0.85,
        minimumCpuCores: 8,
      };
    }

    if (quantizationBase === "F16") {
      return {
        label: "F16/BF16",
        description: "Alta precisão, exige bastante memória",
        bytesPerParameter: 2,
        minimumRamMultiplier: 1.55,
        recommendedRamMultiplier: 2.45,
        minimumVramRatio: 0.38,
        recommendedVramRatio: 0.75,
        minimumCpuCores: 6,
      };
    }

    if (quantizationBase === "Q8") {
      return {
        label: "Q8",
        description: "Quantização alta",
        bytesPerParameter: 1,
        minimumRamMultiplier: 1.45,
        recommendedRamMultiplier: 2.25,
        minimumVramRatio: 0.32,
        recommendedVramRatio: 0.68,
        minimumCpuCores: 6,
      };
    }

    if (quantizationBase === "Q6") {
      return {
        label: "Q6",
        description: "Qualidade alta com consumo moderado-alto",
        bytesPerParameter: 0.78,
        minimumRamMultiplier: 1.38,
        recommendedRamMultiplier: 2.1,
        minimumVramRatio: 0.28,
        recommendedVramRatio: 0.62,
        minimumCpuCores: 4,
      };
    }

    if (quantizationBase === "Q5" || quantizationBase === "IQ5") {
      return {
        label: "Q5",
        description: "Equilibrada, boa qualidade com consumo moderado",
        bytesPerParameter: 0.68,
        minimumRamMultiplier: 1.32,
        recommendedRamMultiplier: 1.95,
        minimumVramRatio: 0.24,
        recommendedVramRatio: 0.55,
        minimumCpuCores: 4,
      };
    }

    if (quantizationBase === "Q4") {
      return {
        label: "Q4",
        description: "Recomendada para uso local geral",
        bytesPerParameter: 0.56,
        minimumRamMultiplier: 1.25,
        recommendedRamMultiplier: 1.75,
        minimumVramRatio: 0.2,
        recommendedVramRatio: 0.5,
        minimumCpuCores: 4,
      };
    }

    if (quantizationBase === "IQ4") {
      return {
        label: "IQ4",
        description: "Quantização inteligente leve",
        bytesPerParameter: 0.5,
        minimumRamMultiplier: 1.2,
        recommendedRamMultiplier: 1.6,
        minimumVramRatio: 0.18,
        recommendedVramRatio: 0.45,
        minimumCpuCores: 2,
      };
    }

    if (quantizationBase === "IQ3" || quantizationBase === "Q3") {
      return {
        label: "Q3/IQ",
        description: "Leve, com perda maior de qualidade",
        bytesPerParameter: 0.45,
        minimumRamMultiplier: 1.18,
        recommendedRamMultiplier: 1.55,
        minimumVramRatio: 0.16,
        recommendedVramRatio: 0.42,
        minimumCpuCores: 2,
      };
    }

    if (quantizationBase === "IQ2" || quantizationBase === "Q2") {
      return {
        label: "Q2/IQ2",
        description: "Muito leve, indicada para hardware limitado",
        bytesPerParameter: 0.35,
        minimumRamMultiplier: 1.12,
        recommendedRamMultiplier: 1.4,
        minimumVramRatio: 0.12,
        recommendedVramRatio: 0.35,
        minimumCpuCores: 2,
      };
    }

    if (quantizationBase === "IQ1" || quantizationBase === "Q1") {
      return {
        label: "Q1/IQ1",
        description: "Extremamente leve, com perda significativa de qualidade",
        bytesPerParameter: 0.22,
        minimumRamMultiplier: 1.08,
        recommendedRamMultiplier: 1.28,
        minimumVramRatio: 0.08,
        recommendedVramRatio: 0.25,
        minimumCpuCores: 2,
      };
    }

    return {
      label: selectedFile?.quantization || "Não informada",
      description: "Quantização não identificada; usando margem conservadora",
      bytesPerParameter: 0.75,
      minimumRamMultiplier: 1.35,
      recommendedRamMultiplier: 2.1,
      minimumVramRatio: 0.25,
      recommendedVramRatio: 0.58,
      minimumCpuCores: 4,
    };
  }

  function getModelFileSizeBytes(model, selectedFile) {
    return (
      Number(selectedFile?.sizeBytes) ||
      Number(model?.sizeBytes) ||
      Number(model?.modelSizeBytes) ||
      0
    );
  }

  function parseParameterValue(value, unit) {
    const amount = Number(String(value).replace(",", "."));

    if (!Number.isFinite(amount) || amount <= 0) {
      return 0;
    }

    return unit.toUpperCase() === "B" ? amount * 1e9 : amount * 1e6;
  }

  function getModelIdentityText(model, selectedFile) {
    return [
      model?.id,
      model?.name,
      selectedFile?.name,
      selectedFile?.quantization,
      ...(Array.isArray(model?.tags) ? model.tags : []),
    ]
      .filter(Boolean)
      .join(" ");
  }

  function getDeclaredParameterCount(model, selectedFile) {
    const direct = Number(model?.parameterCount);

    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    const identity = getModelIdentityText(model, selectedFile);
    const mixture = identity.match(
      /(?:^|[^a-z0-9])(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*b(?:[^a-z0-9]|$)/i,
    );

    if (mixture) {
      return Number(mixture[1]) * parseParameterValue(mixture[2], "B");
    }

    const matches = Array.from(
      identity.matchAll(
        /(?:^|[^a-z0-9])(\d+(?:[.,]\d+)?)\s*([bm])(?:[^a-z0-9]|$)/gi,
      ),
    );

    return matches.reduce(
      (largest, match) =>
        Math.max(largest, parseParameterValue(match[1], match[2])),
      0,
    );
  }

  function getEstimatedWeightsBytes(model, selectedFile) {
    const fileSizeBytes = getModelFileSizeBytes(model, selectedFile);
    const parameterCount = getDeclaredParameterCount(model, selectedFile);
    const quantization = getQuantizationProfile(model, selectedFile);
    const parameterSizeBytes =
      parameterCount > 0 ? parameterCount * quantization.bytesPerParameter : 0;

    return fileSizeBytes || parameterSizeBytes;
  }

  function getRangeScore(availableBytes, minimumBytes, recommendedBytes) {
    if (recommendedBytes <= 0) {
      return 1;
    }

    if (availableBytes <= 0) {
      return 0.25;
    }

    if (minimumBytes > 0 && availableBytes < minimumBytes) {
      return Math.max(0.1, (availableBytes / minimumBytes) * 0.4);
    }

    if (availableBytes < recommendedBytes) {
      const range = Math.max(recommendedBytes - minimumBytes, 1);
      const position = Math.max(0, availableBytes - minimumBytes) / range;
      return 0.55 + Math.min(position, 1) * 0.3;
    }

    return 1;
  }

  function getCpuScore(cpuCores, minimumCpuCores) {
    if (minimumCpuCores <= 0 || cpuCores >= minimumCpuCores) {
      return 1;
    }

    if (cpuCores <= 0) {
      return 0.6;
    }

    return Math.max(0.25, (cpuCores / minimumCpuCores) * 0.65);
  }

  function isWithinVramCapacityWarningMargin(weightsBytes, gpuVramBytes) {
    if (weightsBytes <= 0 || gpuVramBytes <= 0) {
      return false;
    }

    const vramCapacityDifference = weightsBytes - gpuVramBytes;
    const vramCapacityWarningMargin =
      gpuVramBytes * VRAM_CAPACITY_WARNING_MARGIN_RATIO;

    return Math.abs(vramCapacityDifference) <= vramCapacityWarningMargin;
  }

  function getRecommendedVramBytes(weightsBytes, quantization) {
    if (!Number.isFinite(weightsBytes) || weightsBytes <= 0) {
      return 0;
    }

    const recommendedOffloadVram =
      weightsBytes *
      Math.max(
        quantization.recommendedVramRatio,
        MINIMUM_COMFORTABLE_VRAM_RATIO,
      );
    const vramWithCapacityHeadroom =
      weightsBytes / (1 - VRAM_CAPACITY_WARNING_MARGIN_RATIO);
    const estimatedRecommendedVram = Math.max(
      recommendedOffloadVram,
      vramWithCapacityHeadroom,
    );
    const gibibyte = 1024 ** 3;
    let conventionalVramBytes = MINIMUM_RECOMMENDED_VRAM_GIB * gibibyte;

    while (conventionalVramBytes < estimatedRecommendedVram) {
      conventionalVramBytes *= 2;
    }

    return conventionalVramBytes;
  }

  function classifyCompatibility(model, selectedFile, hardware) {
    const weightsBytes = getEstimatedWeightsBytes(model, selectedFile);
    const ramBytes = Number(hardware?.ramBytes) || 0;
    const gpuVramBytes = Number(hardware?.gpuVramBytes) || 0;
    const cpuCores = Number(hardware?.cpuCores) || 0;
    const quantization = getQuantizationProfile(model, selectedFile);

    if (!weightsBytes || !ramBytes) {
      return "warning";
    }

    const minimumRam = weightsBytes * quantization.minimumRamMultiplier;
    const recommendedRam = weightsBytes * quantization.recommendedRamMultiplier;
    const minimumVram = weightsBytes * quantization.minimumVramRatio;
    const recommendedVram = getRecommendedVramBytes(
      weightsBytes,
      quantization,
    );

    if (ramBytes < minimumRam) {
      return "danger";
    }

    if (gpuVramBytes > 0) {
      const vramCapacityDifference = weightsBytes - gpuVramBytes;

      if (
        isWithinVramCapacityWarningMargin(weightsBytes, gpuVramBytes)
      ) {
        return "warning";
      }

      if (vramCapacityDifference > 0) {
        return "danger";
      }
    }

    const ramScore = getRangeScore(ramBytes, minimumRam, recommendedRam);
    const vramScore = getRangeScore(
      gpuVramBytes,
      minimumVram,
      recommendedVram,
    );
    const cpuScore = getCpuScore(cpuCores, quantization.minimumCpuCores);
    const resourceScore =
      vramScore * 0.8 + ramScore * 0.1 + cpuScore * 0.1;
    const hasRecommendedRam = ramBytes >= recommendedRam;
    const hasRecommendedVram =
      recommendedVram <= 0 || gpuVramBytes >= recommendedVram;
    const hasMinimumCpu =
      cpuCores <= 0 || cpuCores >= quantization.minimumCpuCores;

    if (hasRecommendedRam && hasRecommendedVram && hasMinimumCpu) {
      return "good";
    }

    if (resourceScore < 0.5 && !hasRecommendedRam) {
      return "danger";
    }

    return "warning";
  }

  function formatParameterCount(model, selectedFile) {
    const parameterCount = getDeclaredParameterCount(model, selectedFile);

    if (!parameterCount) {
      return "Não identificado";
    }

    if (parameterCount >= 1e9) {
      return `${(parameterCount / 1e9).toFixed(parameterCount >= 10e9 ? 0 : 1)}B`;
    }

    return `${Math.round(parameterCount / 1e6)}M`;
  }

  function renderHardwarePendingCard(loading, error) {
    const message = loading
      ? "Verificando compatibilidade local para a variante selecionada."
      : error || "Não foi possível carregar o diagnóstico de hardware.";

    return `
      <section class="compatibility-card compatibility-warning">
        <div class="compatibility-header">
          <div>
            <h2>
              <i class="codicon codicon-dashboard"></i>
              Compatibilidade local
            </h2>
            <p>${escapeHtml(message)}</p>
          </div>
          <span class="compatibility-badge">${loading ? "Verificando" : "Indisponível"}</span>
        </div>
      </section>
    `;
  }

  function renderCompatibilityDiagnosticsCard(model, selectedFile, context) {
    if (model?.format === "ONNX") {
      return "";
    }

    const hardware = context?.hardware;

    if (!hardware) {
      return renderHardwarePendingCard(context?.loading, context?.error);
    }

    const level = classifyCompatibility(model, selectedFile, hardware);
    const weightsBytes = getEstimatedWeightsBytes(model, selectedFile);
    const gpuVramBytes = Number(hardware.gpuVramBytes) || 0;
    const isVramCapacityWarning = isWithinVramCapacityWarningMargin(
      weightsBytes,
      gpuVramBytes,
    );
    const tone = getCompatibilityTone(level, isVramCapacityWarning);
    const quantization = getQuantizationProfile(model, selectedFile);
    const recommendedVramBytes = getRecommendedVramBytes(
      weightsBytes,
      quantization,
    );

    return `
      <section class="compatibility-card ${tone.className}">
        <div class="compatibility-header">
          <div>
            <h2>
              <i class="codicon codicon-${escapeHtml(tone.icon)}"></i>
              Compatibilidade local
            </h2>
            <p>${escapeHtml(tone.message)}</p>
          </div>
          <span class="compatibility-badge">${escapeHtml(tone.label)}</span>
        </div>

        <div class="compatibility-grid compatibility-grid-single">
          <div class="compatibility-block">
            <h3>Base da análise</h3>
            ${renderCompatibilityItem("Quantização", `${quantization.label} - ${quantization.description}`)}
            ${renderCompatibilityItem("Parâmetros", formatParameterCount(model, selectedFile))}
            ${renderCompatibilityItem("VRAM disponível", formatMemoryBytes(gpuVramBytes))}
            ${renderCompatibilityItem("VRAM recomendada", formatMemoryBytes(recommendedVramBytes))}
          </div>
        </div>
      </section>
    `;
  }

  window.AtlasCompatibilityDiagnostics = {
    renderCompatibilityDiagnosticsCard,
    classifyCompatibility,
  };
})();
