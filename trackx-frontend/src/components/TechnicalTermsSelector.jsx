import React, { useEffect, useMemo, useState } from "react";
import { Search, Plus, X, Loader2 } from "lucide-react";
import {
  addTechnicalTerm,
  fetchTechnicalTerms,
  incrementTechnicalTermUsage,
} from "../services/firebaseServices";
import {
  formatTechnicalTerm,
  normalizeTechnicalTerm,
  normalizeTechnicalTermList,
} from "../utils/technicalTerms";

const getKey = (term) => {
  const normalized = normalizeTechnicalTerm(term);
  if (!normalized) {
    return null;
  }
  return normalized.termId || normalized.term.toLowerCase();
};

function TechnicalTermsSelector({
  value = [],
  onChange,
  disabled = false,
  title = "Technical Terms",
  allowCreate = true,
}) {
  const selectedTerms = useMemo(() => normalizeTechnicalTermList(value), [value]);
  const selectedKeys = useMemo(() => {
    const map = new Set();
    selectedTerms.forEach((entry) => {
      const key = getKey(entry);
      if (key) {
        map.add(key);
      }
    });
    return map;
  }, [selectedTerms]);

  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formValues, setFormValues] = useState({ term: "", full: "", description: "", category: "" });
  const [formError, setFormError] = useState("");
  const [savingTerm, setSavingTerm] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const fetched = await fetchTechnicalTerms(200);
        if (!active) {
          return;
        }

        const normalized = normalizeTechnicalTermList(fetched).sort((a, b) => {
          const usageA = typeof a.usageScore === "number" ? a.usageScore : 0;
          const usageB = typeof b.usageScore === "number" ? b.usageScore : 0;
          if (usageA !== usageB) {
            return usageB - usageA;
          }
          return a.term.localeCompare(b.term);
        });

        setTerms(normalized);
      } catch (err) {
        if (!active) {
          return;
        }
        console.error("Failed to load technical terms:", err);
        setError(err?.message || "Failed to load technical terms");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const filteredTerms = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return terms.filter((entry) => {
      const key = getKey(entry);
      if (key && selectedKeys.has(key)) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const haystack = [entry.term, entry.full, entry.description]
        .filter(Boolean)
        .map((part) => part.toLowerCase());
      return haystack.some((part) => part.includes(needle));
    });
  }, [terms, search, selectedKeys]);

  const emitChange = (items) => {
    const normalized = normalizeTechnicalTermList(items);
    onChange?.(normalized);
  };

  const handleSelect = (term) => {
    if (disabled) {
      return;
    }
    const normalized = normalizeTechnicalTerm(term);
    if (!normalized) {
      return;
    }
    const key = getKey(normalized);
    if (key && selectedKeys.has(key)) {
      return;
    }
    const updated = [...selectedTerms, normalized];
    emitChange(updated);
    incrementTechnicalTermUsage(normalized.termId || normalized.term.toLowerCase()).catch(() => {});
  };

  const handleRemove = (term) => {
    if (disabled) {
      return;
    }
    const key = getKey(term);
    const updated = selectedTerms.filter((entry) => getKey(entry) !== key);
    emitChange(updated);
  };

  const resetForm = () => {
    setFormValues({ term: "", full: "", description: "", category: "" });
    setFormError("");
    setSavingTerm(false);
  };

  const handleAddTerm = async (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (disabled || savingTerm) {
      return;
    }

    const { term, full, description, category } = formValues;
    if (!term.trim()) {
      setFormError("Please provide a term");
      return;
    }
    if (!description.trim()) {
      setFormError("Please provide a description");
      return;
    }

    try {
      setSavingTerm(true);
      setFormError("");

      const created = await addTechnicalTerm({ term, full, description, category });
      const normalized = normalizeTechnicalTerm(created);
      if (!normalized) {
        throw new Error("Technical term could not be saved");
      }

      setTerms((prev) => {
        const existing = prev.filter((entry) => getKey(entry) !== getKey(normalized));
        const next = normalizeTechnicalTermList([normalized, ...existing]);
        return next.sort((a, b) => {
          const usageA = typeof a.usageScore === "number" ? a.usageScore : 0;
          const usageB = typeof b.usageScore === "number" ? b.usageScore : 0;
          if (usageA !== usageB) {
            return usageB - usageA;
          }
          return a.term.localeCompare(b.term);
        });
      });

      emitChange([...selectedTerms, normalized]);
      setShowForm(false);
      resetForm();
      setSearch("");
    } catch (err) {
      console.error("Unable to add technical term:", err);
      setFormError(err?.message || "Failed to add technical term");
    } finally {
      setSavingTerm(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-gray-400">
            Select glossary items to surface in the case briefing and reports.
          </p>
        </div>
        {allowCreate && (
          <button
            type="button"
            onClick={() => {
              if (disabled) {
                return;
              }
              setShowForm((prev) => !prev);
              resetForm();
            }}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              showForm ? "bg-gray-700 text-white" : "bg-blue-700 text-white hover:bg-blue-600"
            } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
            disabled={disabled}
          >
            <Plus className="w-3 h-3" />
            {showForm ? "Cancel" : "New Term"}
          </button>
        )}
      </div>

      {showForm && allowCreate && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-gray-800/60 border border-gray-700 rounded-lg p-4">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-gray-400 mb-1">Term *</label>
            <input
              type="text"
              value={formValues.term}
              onChange={(e) => setFormValues((prev) => ({ ...prev, term: e.target.value }))}
              className="w-full rounded bg-gray-900 border border-gray-700 text-white px-3 py-2 text-sm"
              required
              disabled={savingTerm}
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-gray-400 mb-1">Full Name / Expansion</label>
            <input
              type="text"
              value={formValues.full}
              onChange={(e) => setFormValues((prev) => ({ ...prev, full: e.target.value }))}
              className="w-full rounded bg-gray-900 border border-gray-700 text-white px-3 py-2 text-sm"
              disabled={savingTerm}
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
            <input
              type="text"
              value={formValues.category}
              onChange={(e) => setFormValues((prev) => ({ ...prev, category: e.target.value }))}
              className="w-full rounded bg-gray-900 border border-gray-700 text-white px-3 py-2 text-sm"
              disabled={savingTerm}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-400 mb-1">Description *</label>
            <textarea
              value={formValues.description}
              onChange={(e) => setFormValues((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded bg-gray-900 border border-gray-700 text-white px-3 py-2 text-sm h-20"
              required
              disabled={savingTerm}
            />
          </div>
          {formError && (<p className="md:col-span-2 text-xs text-red-400">{formError}</p>)}
          <div className="md:col-span-2 flex justify-end gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded-full text-xs text-gray-300 hover:text-white"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              disabled={savingTerm}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddTerm}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium ${
                savingTerm ? "bg-blue-900 text-blue-200" : "bg-green-600 text-white hover:bg-green-500"
              }`}
              disabled={savingTerm}
            >
              {savingTerm ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving
                </>
              ) : (
                "Save Term"
              )}
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Search glossary</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded bg-gray-900 border border-gray-700 text-white pl-9 pr-3 py-2 text-sm"
            placeholder="Find a technical term"
            disabled={disabled}
          />
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-400 mb-1">Selected ({selectedTerms.length})</p>
        {selectedTerms.length === 0 ? (
          <p className="text-xs text-gray-500">No technical terms selected yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedTerms.map((entry) => {
              const key = getKey(entry);
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-2 bg-white/10 border border-white/10 rounded-full px-3 py-1 text-xs text-white"
                >
                  <span>{formatTechnicalTerm(entry)}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => handleRemove(entry)}
                      className="text-gray-300 hover:text-red-300"
                      aria-label="Remove technical term"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-gray-400 mb-1">Suggestions</p>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading terms...
          </div>
        ) : error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : filteredTerms.length === 0 ? (
          <p className="text-xs text-gray-500">No matching terms found.</p>
        ) : (
          <ul className="max-h-48 overflow-y-auto space-y-2 pr-1">
            {filteredTerms.map((entry) => {
              const key = getKey(entry);
              const usage = typeof entry.usageScore === "number" ? entry.usageScore : 0;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => handleSelect(entry)}
                    className={`w-full text-left bg-gray-800/60 hover:bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 transition-colors ${
                      disabled ? "opacity-60 cursor-not-allowed" : ""
                    }`}
                    disabled={disabled}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-white font-medium">
                          {entry.term}
                          {entry.full ? <span className="text-gray-400"> ({entry.full})</span> : null}
                        </p>
                        {entry.description && (
                          <p className="text-xs text-gray-400 mt-1">{entry.description}</p>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-gray-500">uses: {usage}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default TechnicalTermsSelector;
