import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
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
  if (!normalized) return null;
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
      if (key) map.add(key);
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
        if (!active) return;
        const normalized = normalizeTechnicalTermList(fetched).sort((a, b) => {
          const usageA = typeof a.usageScore === "number" ? a.usageScore : 0;
          const usageB = typeof b.usageScore === "number" ? b.usageScore : 0;
          if (usageA !== usageB) return usageB - usageA;
          return a.term.localeCompare(b.term);
        });
        setTerms(normalized);
      } catch (err) {
        if (!active) return;
        console.error("Failed to load technical terms:", err);
        setError(err?.message || "Failed to load technical terms");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const filteredTerms = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return terms.filter((entry) => {
      const key = getKey(entry);
      if (key && selectedKeys.has(key)) return false;
      if (!needle) return true;
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
    if (disabled) return;
    const normalized = normalizeTechnicalTerm(term);
    if (!normalized) return;
    const key = getKey(normalized);
    if (key && selectedKeys.has(key)) return;
    const updated = [...selectedTerms, normalized];
    emitChange(updated);
    incrementTechnicalTermUsage(normalized.termId || normalized.term.toLowerCase()).catch(() => {});
  };

  const handleRemove = (term) => {
    if (disabled) return;
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
    if (disabled || savingTerm) return;

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
      if (!normalized) throw new Error("Technical term could not be saved");

      setTerms((prev) => {
        const existing = prev.filter((entry) => getKey(entry) !== getKey(normalized));
        const next = normalizeTechnicalTermList([normalized, ...existing]);
        return next.sort((a, b) => {
          const usageA = typeof a.usageScore === "number" ? a.usageScore : 0;
          const usageB = typeof b.usageScore === "number" ? b.usageScore : 0;
          if (usageA !== usageB) return usageB - usageA;
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
    <section className="relative z-10 mt-2 space-y-6 rounded-2xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute -top-10 right-6 h-24 w-24 rounded-full bg-blue-900/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 left-6 h-20 w-20 rounded-full bg-purple-900/20 blur-2xl" />

      {/* Header (chip removed) */}
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-xs text-gray-400">
            Select glossary items to surface in the case briefing and reports.
          </p>
        </div>

        {allowCreate && (
          <button
            type="button"
            onClick={() => {
              if (disabled) return;
              setShowForm((prev) => !prev);
              resetForm();
            }}
            className={`inline-flex h-9 items-center gap-2 rounded-full border border-white/10 px-4 text-sm font-medium transition
              ${showForm
                ? "bg-white/[0.06] text-white hover:bg-white/10"
                : "bg-gradient-to-r from-emerald-800 to-teal-700 text-white shadow-[0_12px_30px_rgba(15,23,42,0.45)] hover:-translate-y-0.5"} 
              ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
            disabled={disabled}
            aria-expanded={showForm}
          >
            <Plus className="w-4 h-4" />
            {showForm ? "Cancel" : "New Term"}
          </button>
        )}
      </div>

      {showForm && allowCreate && (
        <div className="relative z-10 grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Term *</label>
            <input
              type="text"
              value={formValues.term}
              onChange={(e) => setFormValues((p) => ({ ...p, term: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
              required
              disabled={savingTerm}
              placeholder="e.g., IMEI"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Full Name / Expansion</label>
            <input
              type="text"
              value={formValues.full}
              onChange={(e) => setFormValues((p) => ({ ...p, full: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
              disabled={savingTerm}
              placeholder="International Mobile Equipment Identity"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Category</label>
            <input
              type="text"
              value={formValues.category}
              onChange={(e) => setFormValues((p) => ({ ...p, category: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
              disabled={savingTerm}
              placeholder="e.g., Devices"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-400">Description *</label>
            <textarea
              value={formValues.description}
              onChange={(e) => setFormValues((p) => ({ ...p, description: e.target.value }))}
              className="h-24 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
              required
              disabled={savingTerm}
              placeholder="Concise definition used in reports…"
            />
          </div>

          {formError && <p className="md:col-span-2 text-xs text-rose-400">{formError}</p>}

          <div className="md:col-span-2 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-full px-4 py-1.5 text-xs text-gray-300 transition hover:text-white"
              onClick={() => { resetForm(); setShowForm(false); }}
              disabled={savingTerm}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddTerm}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-1.5 text-xs font-semibold transition
                ${savingTerm ? "bg-blue-900 text-blue-200" : "bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-900 text-white shadow-[0_15px_35px_rgba(15,23,42,0.55)] hover:-translate-y-0.5"}`}
              disabled={savingTerm}
            >
              {savingTerm ? (<><Loader2 className="h-3 w-3 animate-spin" /> Saving</>) : "Save Term"}
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <label className="mb-1 block text-xs font-medium text-gray-400">Search glossary</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.02] pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
            placeholder="Find a technical term"
            disabled={disabled}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-gray-400">Selected ({selectedTerms.length})</p>
        </div>

        {selectedTerms.length === 0 ? (
          <p className="text-xs text-gray-500">No technical terms selected yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedTerms.map((entry) => {
              const key = getKey(entry);
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs text-white shadow-inner shadow-white/5"
                >
                  <span>{formatTechnicalTerm(entry)}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => handleRemove(entry)}
                      className="text-gray-300 transition hover:text-rose-300"
                      aria-label="Remove technical term"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs text-gray-400">Suggestions</p>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading terms...
          </div>
        ) : error ? (
          <p className="text-xs text-rose-400">{error}</p>
        ) : filteredTerms.length === 0 ? (
          <p className="text-xs text-gray-500">No matching terms found.</p>
        ) : (
          <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {filteredTerms.map((entry) => {
              const key = getKey(entry);
              const usage = typeof entry.usageScore === "number" ? entry.usageScore : 0;
              return (
                <li key={key}>
                  <motion.button
                    type="button"
                    onClick={() => handleSelect(entry)}
                    whileHover={{ y: -1 }}
                    className={`w-full rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left shadow-[0_12px_30px_rgba(15,23,42,0.45)] transition hover:bg-white/10
                      ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                    disabled={disabled}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {entry.term}
                          {entry.full ? <span className="text-gray-400"> ({entry.full})</span> : null}
                        </p>
                        {entry.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-gray-400">{entry.description}</p>
                        )}
                        {entry.category && (
                          <span className="mt-2 inline-flex items-center rounded-full border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-300">
                            {entry.category}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                        uses: {usage}
                      </span>
                    </div>
                  </motion.button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export default TechnicalTermsSelector;
