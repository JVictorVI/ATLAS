(() => {
  const app = window.atlasLibrary;

  function getById(id) {
    return document.getElementById(id);
  }

  function getInputValue(id) {
    const element = getById(id);
    return typeof element?.value === "string" ? element.value : "";
  }

  function getNumberValue(id, parser = Number, fallback = 0) {
    const value = parser(getInputValue(id));
    return Number.isFinite(value) ? value : fallback;
  }

  function getChecked(id) {
    return getById(id)?.checked === true;
  }

  function setText(id, value) {
    const element = getById(id);

    if (element) {
      element.textContent = value ?? "";
    }
  }

  function setValue(id, value) {
    const element = getById(id);

    if (element) {
      element.value = value ?? "";
    }
  }

  function setChecked(id, value) {
    const element = getById(id);

    if (element) {
      element.checked = value;
    }
  }

  function setDisabled(id, value) {
    const element = getById(id);

    if (element) {
      element.disabled = value;
    }
  }

  function toggleClass(id, className, force) {
    getById(id)?.classList.toggle(className, force);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showButtonFeedback(buttonId, temporaryText) {
    const button = getById(buttonId);

    if (!button) {
      return;
    }

    const originalText = button.textContent;
    button.textContent = temporaryText;

    window.setTimeout(() => {
      button.textContent = originalText;
    }, 1500);
  }

  app.ui = {
    escapeHtml,
    getById,
    getChecked,
    getInputValue,
    getIntegerValue: (id, fallback = 0) =>
      getNumberValue(id, (value) => parseInt(value, 10), fallback),
    getNumberValue,
    setChecked,
    setDisabled,
    setText,
    setValue,
    showButtonFeedback,
    toggleClass,
  };
})();
