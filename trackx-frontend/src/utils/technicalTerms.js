export function normalizeTechnicalTerm(entry) {
  if (!entry) {
    return null;
  }

  if (typeof entry === "string") {
    const term = entry.trim();
    if (!term) {
      return null;
    }
    return {
      termId: term.toLowerCase(),
      term,
      full: "",
      description: "",
      category: "",
      usageScore: 0,
    };
  }

  if (typeof entry === "object") {
    const term = (entry.term || entry.name || "").toString().trim();
    if (!term) {
      return null;
    }

    const normalized = {
      termId:
        entry.termId ||
        entry.id ||
        entry.termLower ||
        term.toLowerCase(),
      term,
      full: (entry.full || entry.fullName || "").toString().trim(),
      description: (entry.description || entry.detail || "").toString().trim(),
      category: (entry.category || entry.group || "").toString().trim(),
      usageScore: typeof entry.usageScore === "number"
        ? entry.usageScore
        : typeof entry.usageScofe === "number"
        ? entry.usageScofe
        : 0,
    };

    return normalized;
  }

  return null;
}

export function normalizeTechnicalTermList(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  const seen = new Set();
  const results = [];
  list.forEach((entry) => {
    const normalized = normalizeTechnicalTerm(entry);
    if (!normalized) {
      return;
    }
    const key = normalized.termId || normalized.term.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    results.push(normalized);
  });
  return results;
}

export function formatTechnicalTerm(entry) {
  const normalized = normalizeTechnicalTerm(entry);
  if (!normalized) {
    return "";
  }
  const parts = [];
  const primary = normalized.full
    ? `${normalized.term} (${normalized.full})`
    : normalized.term;
  parts.push(primary);
  if (normalized.description) {
    parts.push(normalized.description);
  }
  return parts.join(" - ");
}
