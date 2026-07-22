// Compatibility diagnostics kept out of the active repository UI until the
// dynamic model repository has a final placement for this block.
(function () {
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

  function getCompatibilityTone(level) {
    if (level === "good") {
      return {
        className: "compatibility-good",
        label: "Roda bem",
        message:
          "Boa compatibilidade para uso local. A máquina parece suficiente para testar este modelo com segurança.",
      };
    }

    if (level === "warning") {
      return {
        className: "compatibility-warning",
        label: "Pesado, mas viavel",
        message:
          "O modelo deve funcionar, mas pode exigir contexto menor, menos camadas em GPU ou respostas mais lentas.",
      };
    }

    return {
      className: "compatibility-danger",
      label: "Não recomendado",
      message:
        "Modelo pesado para esta máquina. Baixe apenas se aceitar uso lento ou se pretende ajustar os parâmetros manualmente.",
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

  function classifyCompatibility(model, selectedFile, hardware) {
    const fileSizeBytes = getModelFileSizeBytes(model, selectedFile);
    const ramBytes = Number(hardware?.ramBytes) || 0;
    const gpuVramBytes = Number(hardware?.gpuVramBytes) || 0;
    const storageFreeBytes = Number(hardware?.storageFreeBytes) || 0;

    if (!fileSizeBytes || !ramBytes) {
      return "warning";
    }

    const recommendedRam = fileSizeBytes * 2.2;
    const minimumRam = fileSizeBytes * 1.35;
    const storageNeeded = fileSizeBytes * 1.15;

    if (storageFreeBytes > 0 && storageFreeBytes < storageNeeded) {
      return "danger";
    }

    if (ramBytes < minimumRam) {
      return "danger";
    }

    if (ramBytes < recommendedRam || gpuVramBytes < fileSizeBytes * 0.35) {
      return "warning";
    }

    return "good";
  }

  function formatRecommendedStorage(selectedFile) {
    return selectedFile?.size
      ? `${selectedFile.size} livres, com margem para extração`
      : "Espaço livre suficiente para o arquivo e margem de extração";
  }

  function renderCompatibilityDiagnosticsCard(model, selectedFile, hardware) {
    const level = classifyCompatibility(model, selectedFile, hardware);
    const tone = getCompatibilityTone(level);

    return `
      <section class="compatibility-card ${tone.className}">
        <div class="compatibility-header">
          <div>
            <h2>
              <i class="codicon codicon-dashboard"></i>
              Diagnóstico rápido de compatibilidade
            </h2>
            <p>${escapeHtml(tone.message)}</p>
          </div>
          <span class="compatibility-badge">${escapeHtml(tone.label)}</span>
        </div>

        <div class="compatibility-grid">
          <div class="compatibility-block">
            <h3>Sua máquina</h3>
            ${renderCompatibilityItem("Memória RAM", hardware?.ram)}
            ${renderCompatibilityItem("Processador", hardware?.cpu)}
            ${renderCompatibilityItem("GPU", hardware?.gpu)}
            ${renderCompatibilityItem("Armazenamento", hardware?.storage)}
          </div>

          <div class="compatibility-block">
            <h3>Recomendado para este modelo</h3>
            ${renderCompatibilityItem("Memória RAM", "Pelo menos 1,35x o tamanho do arquivo")}
            ${renderCompatibilityItem("VRAM", "Opcional, mas recomendada para offload parcial")}
            ${renderCompatibilityItem("Armazenamento", formatRecommendedStorage(selectedFile))}
            ${renderCompatibilityItem("Contexto sugerido", "Comece em 4096 tokens e ajuste depois")}
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
