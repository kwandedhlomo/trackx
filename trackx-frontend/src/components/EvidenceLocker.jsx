// src/components/EvidenceLocker.jsx
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Plus, Trash2 } from "lucide-react";

/**
 * EvidenceLocker
 *
 * Reusable evidence list editor/viewer with glassmorphism styling.
 *
 * Props:
 * - evidenceItems: Array<{ id: string, description: string, dateAdded: string, caseNumber?: string }>
 * - onChange: (nextItems: Array) => void           // Called whenever items change
 * - readOnly?: boolean                              // Render read-only view (no add/remove/edit)
 * - allowAddRemove?: boolean                        // Defaults to !readOnly
 * - caseNumber?: string                             // Used when generating new IDs
 * - title?: string                                  // Header title (default: "Evidence Locker")
 * - subtitle?: string                               // Header subtitle line
 * - className?: string                              // Extra container classes
 * - maxHeight?: string                              // e.g. "max-h-[28rem]" (default)
 */
export default function EvidenceLocker({
  evidenceItems = [],
  onChange = () => {},
  readOnly = false,
  allowAddRemove,
  caseNumber,
  title = "Evidence Locker",
  subtitle = "Manage evidence items for this case",
  className = "",
  maxHeight = "max-h-96",
}) {
  const canMutate = useMemo(
    () => (typeof allowAddRemove === "boolean" ? allowAddRemove : !readOnly),
    [allowAddRemove, readOnly]
  );

  const [items, setItems] = useState(() => normalizeEvidence(evidenceItems));

  // keep local state in sync if parent changes
  useEffect(() => {
    setItems(normalizeEvidence(evidenceItems));
  }, [evidenceItems]);

  // helpers
  const generateEvidenceId = () => {
    const ts = Date.now();
    const rand = Math.floor(Math.random() * 1000);
    const prefix = (caseNumber || "CASE").toString().replace(/\s+/g, "");
    return `${prefix}-EV-${ts}-${rand}`;
  };

  const handleAdd = () => {
    if (!canMutate) return;
    const next = [
      ...items,
      {
        id: generateEvidenceId(),
        description: "",
        dateAdded: new Date().toISOString(),
        caseNumber: caseNumber || "Pending",
      },
    ];
    setItems(next);
    onChange(next);
  };

  const handleRemove = (id) => {
    if (!canMutate) return;
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    onChange(next);
  };

  const handleEdit = (id, description) => {
    if (!canMutate) return;
    const next = items.map((it) => (it.id === id ? { ...it, description } : it));
    setItems(next);
    onChange(next);
  };

  const total = items.length;

  return (
    <section
      className={[
        "rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-6",
        "shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl",
        className,
      ].join(" ")}
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center">
            <FileText className="mr-2 h-5 w-5 text-blue-400" />
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
          ) : null}
        </div>

        {canMutate && (
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-gradient-to-r from-blue-900/85 to-indigo-900/85 px-4 py-2 text-sm font-semibold text-white shadow-[0_15px_35px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" />
            Add Evidence
          </button>
        )}
      </div>

      {/* Body */}
      {total === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-gray-400">
          <FileText className="mx-auto mb-3 h-10 w-10 text-white/30" />
          <p className="text-white/80">No evidence items yet</p>
          {canMutate && (
            <p className="mt-1 text-xs text-gray-400">Click "Add Evidence" to create an entry.</p>
          )}
        </div>
      ) : (
        <div className={`space-y-3 overflow-y-auto pr-1 ${maxHeight}`}>
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-inner shadow-white/5"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded border border-blue-400/30 bg-blue-900/30 px-2 py-1 font-mono text-[11px] leading-none text-blue-200">
                    {item.id}
                  </span>
                  <span className="text-xs text-gray-400">
                    Added: {formatDateTime(item.dateAdded)}
                  </span>
                  {item.caseNumber ? (
                    <span className="text-xs text-gray-500">• Case: {item.caseNumber}</span>
                  ) : null}
                </div>

                <div className="relative">
                  <textarea
                    disabled={readOnly}
                    value={item.description || ""}
                    onChange={(e) => handleEdit(item.id, e.target.value)}
                    placeholder="Enter evidence description..."
                    className={[
                      "h-28 w-full resize-none rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-sm text-white placeholder-gray-500",
                      "focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30",
                      readOnly ? "opacity-80 cursor-default" : "",
                    ].join(" ")}
                  />
                  {canMutate && (
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      className="absolute right-2 top-2 rounded-md border border-white/10 bg-white/5 p-1.5 text-white/80 opacity-0 shadow-inner shadow-white/5 transition hover:text-white group-hover:opacity-100"
                      title="Remove evidence"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Footer summary */}
      {total > 0 && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-gray-300 shadow-inner shadow-white/5">
          <span className="text-white font-medium">Total Evidence Items:</span>{" "}
          {total}
          {!readOnly && (
            <span className="ml-2 text-xs text-gray-400">
              Changes are stored in page state and should be saved by the parent.
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------- helpers ------------------------- */

function normalizeEvidence(list) {
  if (!Array.isArray(list)) return [];
  return list.map((it) => ({
    id: String(it?.id || "").trim() || fallbackId(),
    description: typeof it?.description === "string" ? it.description : "",
    dateAdded: it?.dateAdded || new Date().toISOString(),
    caseNumber: it?.caseNumber || it?.case_number || undefined,
  }));
}

function fallbackId() {
  return `EV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function formatDateTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso || "");
    return d.toLocaleString();
  } catch {
    return String(iso || "");
  }
}