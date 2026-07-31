// Responsabilidade: aplica, descreve e habilita opcoes de analise estatica.
function setStaticAnalysisFromSettings(value) {
  setStaticAnalysisFields({
    enabled: value?.staticAnalysisEnabled !== false,
    quick: value?.staticAnalysisQuick !== false,
    architectural: value?.staticAnalysisArchitectural !== false,
    refactoring: value?.staticAnalysisRefactoring !== false,
    diagnostics: value?.staticAnalysisDiagnostics === true,
    relations: value?.staticAnalysisRelations === true,
  });
}

function setStaticAnalysisFromProfile(profile) {
  setStaticAnalysisFields({
    enabled: profile?.staticAnalysis?.enabled === true,
    quick: profile?.staticAnalysis?.quick === true,
    architectural: profile?.staticAnalysis?.architectural === true,
    refactoring: profile?.staticAnalysis?.refactoring === true,
    diagnostics: profile?.staticAnalysis?.diagnostics === true,
    relations: profile?.staticAnalysis?.relations === true,
  });
}

function setStaticAnalysisFields(settings) {
  setChecked(staticAnalysisEnabled, settings.enabled);
  setChecked(staticAnalysisQuick, settings.quick);
  setChecked(staticAnalysisArchitectural, settings.architectural);
  setChecked(staticAnalysisRefactoring, settings.refactoring);
  setChecked(staticAnalysisDiagnostics, settings.diagnostics);
  setChecked(staticAnalysisRelations, settings.relations);
}

function getStaticAnalysisPayload() {
  return {
    staticAnalysisEnabled: staticAnalysisEnabled?.checked === true,
    staticAnalysisQuick: staticAnalysisQuick?.checked === true,
    staticAnalysisArchitectural: staticAnalysisArchitectural?.checked === true,
    staticAnalysisRefactoring: staticAnalysisRefactoring?.checked === true,
    staticAnalysisDiagnostics: staticAnalysisDiagnostics?.checked === true,
    staticAnalysisRelations: staticAnalysisRelations?.checked === true,
  };
}

function updateStaticAnalysisAvailability() {
  const enabled = staticAnalysisEnabled?.checked === true;
  const refactoringAvailable = enabled && refactoringEnabled?.checked !== false;

  setInputsDisabled(staticAnalysisOptionInputs, !enabled);

  if (staticAnalysisRefactoring) {
    staticAnalysisRefactoring.disabled = !refactoringAvailable;
  }

  document.querySelectorAll(".static-analysis-dependent").forEach((option) => {
    option.classList.toggle("is-disabled", !enabled);
  });

  staticAnalysisRefactoring
    ?.closest(".static-analysis-dependent")
    ?.classList.toggle("is-disabled", !refactoringAvailable);
}

function describeStaticAnalysis(value) {
  if (value?.staticAnalysisEnabled === false) {
    return "desativada";
  }

  if (
    value?.staticAnalysisDiagnostics === true ||
    value?.staticAnalysisRelations === true
  ) {
    return "completa";
  }

  return "básica";
}

function describePresetStaticAnalysis(preset) {
  if (
    preset.includeStaticAnalysis === false ||
    preset.staticAnalysis?.enabled !== true
  ) {
    return "desativada";
  }

  if (
    preset.staticAnalysis?.diagnostics === true ||
    preset.staticAnalysis?.relations === true
  ) {
    return "completa";
  }

  return "básica";
}
