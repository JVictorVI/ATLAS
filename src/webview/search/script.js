const modelDetails = {
  "qwen3-coder-30b": {
    title: "Qwen3 Coder 30B",
    id: "qwen3-coder-30b",
    author: "Qwen",
    architecture: "qwen3moe",
    badge: "30B",
    size: "24.68 GB",
    quant: "Q4_K_M",
    updatedAt: "23/01/2025",
    downloads: "23.245",
    modelSize: "30B parametros",
    tags: ["Text Generation", "GGUF", "Conversational"],
    summary:
      "The Qwen3 Coder 30B is a coding-focused large language model designed for programming, software engineering and agentic reasoning workflows.",
    features: [
      "Strong code generation and refactoring support for day-to-day development.",
      "Good fit for autonomous coding agents, tool use and repository-level analysis.",
      "Balanced performance for debugging, implementation planning and code review.",
    ],
  },
  "phi-4-gguf": {
    title: "Phi 4 GGUF",
    id: "phi-4-gguf",
    author: "Microsoft",
    architecture: "phi",
    badge: "15B",
    size: "8.92 GB",
    quant: "Q4_K_M",
    updatedAt: "18/06/2024",
    downloads: "710.171",
    modelSize: "15B parametros",
    tags: ["Reasoning", "GGUF", "Local"],
    summary:
      "Phi 4 GGUF is a compact model aimed at local execution, useful when you want fast responses with a solid quality-to-resource ratio.",
    features: [
      "Runs well on local setups compared with larger models.",
      "Useful for concise technical explanations and lightweight coding tasks.",
      "Good default when latency and memory usage matter more than maximum scale.",
    ],
  },
  "gemma-3-27b-it": {
    title: "Gemma 3 27B IT",
    id: "gemma-3-27b-it",
    author: "Google",
    architecture: "gemma3",
    badge: "27B",
    size: "17.24 GB",
    quant: "Q4_K_M",
    updatedAt: "28/11/2024",
    downloads: "140.294",
    modelSize: "27B parametros",
    tags: ["Instruction", "Analysis", "Chat"],
    summary:
      "Gemma 3 27B IT is an instruction-tuned model for general chat, text analysis and technical assistance with clear prompting.",
    features: [
      "Instruction-tuned behavior for assistant-style conversations.",
      "Good at summarization, analysis and structured responses.",
      "A useful middle ground for quality without jumping to very large models.",
    ],
  },
  "gpt-oss-20b": {
    title: "GPT OSS 20B",
    id: "gpt-oss-20b",
    author: "OpenAI",
    architecture: "gpt-oss",
    badge: "20B",
    size: "12.80 GB",
    quant: "Q4_K_M",
    updatedAt: "28/11/2025",
    downloads: "1.147.142",
    modelSize: "20B parametros",
    tags: ["General", "Tool Use", "Chat"],
    summary:
      "GPT OSS 20B is positioned as a strong general-purpose open model for assistants, coding support and structured reasoning tasks.",
    features: [
      "Comfortable balance between broad language ability and local deployment size.",
      "Works well for product assistants, automation and technical workflows.",
      "Useful for teams that want a capable baseline model across many tasks.",
    ],
  },
  "ministral-3-14b-reasoning": {
    title: "Ministral 3 14B Reasoning",
    id: "ministral-3-14b-reasoning",
    author: "Mistral",
    architecture: "ministral",
    badge: "14B",
    size: "9.44 GB",
    quant: "Q4_K_M",
    updatedAt: "31/05/2025",
    downloads: "694.240",
    modelSize: "14B parametros",
    tags: ["Reasoning", "Planning", "Agent"],
    summary:
      "Ministral 3 14B Reasoning is tuned for planning, multi-step reasoning and assistant flows where compact deployment is still important.",
    features: [
      "Good for breaking down tasks and producing structured plans.",
      "Smaller footprint than large reasoning models.",
      "Useful for agents that need careful but responsive decisions.",
    ],
  },
  "deepseek-r1-0528-qwen3-8b": {
    title: "DeepSeek R1 0528 Qwen3 8B",
    id: "deepseek-r1-0528-qwen3-8b",
    author: "DeepSeek",
    architecture: "qwen3",
    badge: "8B",
    size: "5.31 GB",
    quant: "Q4_K_M",
    updatedAt: "19/10/2023",
    downloads: "5.583.787",
    modelSize: "8B parametros",
    tags: ["Reasoning", "Compact", "GGUF"],
    summary:
      "DeepSeek R1 0528 Qwen3 8B is a compact reasoning-oriented model suited to experiments, local assistants and quick iteration.",
    features: [
      "Light enough for broader local compatibility.",
      "Reasoning-style behavior for analysis and problem solving.",
      "A practical option for testing agent flows before moving to larger models.",
    ],
  },
  "gemma-3-4b-it": {
    title: "Gemma 3 4B IT",
    id: "gemma-3-4b-it",
    author: "Google",
    architecture: "gemma3",
    badge: "4B",
    size: "2.74 GB",
    quant: "Q4_K_M",
    updatedAt: "25/12/2024",
    downloads: "4.390.982",
    modelSize: "4B parametros",
    tags: ["Small", "Instruction", "Local"],
    summary:
      "Gemma 3 4B IT is a small instruction model for fast local chat, simple summarization and lightweight assistant tasks.",
    features: [
      "Very responsive on modest hardware.",
      "Good for simple prompts, drafts and quick text transformation.",
      "Best used when speed and low resource usage are the priority.",
    ],
  },
  "granite-4-h-tiny": {
    title: "Granite 4 H Tiny",
    id: "granite-4-h-tiny",
    author: "IBM",
    architecture: "granite",
    badge: "7B",
    size: "4.11 GB",
    quant: "Q4_K_M",
    updatedAt: "05/07/2025",
    downloads: "15.662",
    modelSize: "7B parametros",
    tags: ["Enterprise", "Small", "Assistant"],
    summary:
      "Granite 4 H Tiny is a compact assistant model aimed at efficient enterprise-style workflows and controlled local usage.",
    features: [
      "Compact enough for responsive local assistant experiences.",
      "Suited to structured business and productivity tasks.",
      "Useful as a lightweight model for side panels and always-on tooling.",
    ],
  },
};

function renderInfoItem(label, value) {
  return `
    <div class="info-item">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function renderModelDetails(modelId) {
  const detailView = document.getElementById("model-detail-view");
  const model = modelDetails[modelId] || modelDetails["qwen3-coder-30b"];

  detailView.innerHTML = `
    <section class="detail-header">
      <p class="detail-kicker">Pesquisa de Modelos</p>
      <h1>${model.title}</h1>
      <p class="detail-author">By ${model.author}</p>

      <div class="detail-actions">
        <button class="download-button" type="button">
          <i class="codicon codicon-arrow-down"></i>
          Baixar ${model.size}
        </button>
        <button class="quant-button" type="button">
          <span>${model.quant} - ${model.size}</span>
          <i class="codicon codicon-chevron-down"></i>
        </button>
        <button class="icon-button" type="button" title="Informacoes">
          <i class="codicon codicon-question"></i>
        </button>
      </div>
    </section>

    <section class="detail-section">
      <h2><i class="codicon codicon-info"></i> Informações do modelo</h2>
      <div class="info-panel">
        ${renderInfoItem("Modelo", model.id)}
        ${renderInfoItem("Arquitetura", model.architecture)}
        ${renderInfoItem("Tags", model.tags[0])}
        ${renderInfoItem("Atualização Recente", model.updatedAt)}
        ${renderInfoItem("Tamanho do Modelo", model.modelSize)}
        ${renderInfoItem("Formato", model.quant)}
      </div>
    </section>

    <section class="detail-section">
      <h2><i class="codicon codicon-note"></i> Descrição do modelo</h2>
      <article class="description-panel">
        <h3>${model.title}</h3>
        <p>${model.summary}</p>
        <h4>Key Features</h4>
        <ul>
          ${model.features.map((feature) => `<li>${feature}</li>`).join("")}
        </ul>
        <div class="tag-row">
          ${model.tags.map((tag) => `<span>${tag}</span>`).join("")}
        </div>
      </article>
    </section>
  `;
}

window.addEventListener("message", (event) => {
  if (event.data?.type === "mostrarDetalhesModelo") {
    renderModelDetails(event.data.modelId);
  }
});

renderModelDetails("qwen3-coder-30b");
