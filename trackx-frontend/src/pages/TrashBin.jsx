import { useState, useEffect } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FaTrashRestore, FaTrashAlt } from "react-icons/fa";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";

function TrashBinPage() {
  const [cases, setCases] = useState([]);
  const { modalState, openModal, closeModal } = useNotificationModal();
  const [emptying, setEmptying] = useState(false);

  useEffect(() => {
    fetchTrashedCases();
  }, []);

  const fetchTrashedCases = async () => {
    try {
      const res = await axios.get("http://localhost:8000/cases/trashed");
      setCases(res.data.cases || []);
    } catch (err) {
      console.error("Failed to fetch trashed cases:", err);
    }
  };

  const handleRestore = async (id) => {
    try {
      await axios.put(`http://localhost:8000/cases/restore/${id}`);
      openModal({
        variant: "success",
        title: "Case Restored",
        description: "The case has been successfully restored.",
      });
      fetchTrashedCases();
    } catch (err) {
      openModal({
        variant: "error",
        title: "Restore Failed",
        description: "Could not restore this case.",
      });
    }
  };

  const handlePermanentDelete = async (id) => {
    try {
      await axios.delete(`http://localhost:8000/cases/delete/${id}`);
      openModal({
        variant: "success",
        title: "Case Permanently Deleted",
        description: "The case has been permanently removed.",
      });
      fetchTrashedCases();
    } catch (err) {
      openModal({
        variant: "error",
        title: "Deletion Failed",
        description: "Could not delete this case permanently.",
      });
    }
  };

  const handleEmptyTrash = () => {
    if (!cases || cases.length === 0) return;
    const count = cases.length;
    openModal({
      variant: "warning",
      title: "Empty Trash?",
      description: `This will permanently delete ${count} case${count === 1 ? '' : 's'}. This action cannot be undone.`,
      primaryAction: {
        label: "Delete all",
        closeOnClick: false,
        onClick: async () => {
          setEmptying(true);
          try {
            const ids = cases.map(c => c.doc_id).filter(Boolean);
            const results = await Promise.allSettled(
              ids.map(id => axios.delete(`http://localhost:8000/cases/delete/${id}`))
            );
            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.length - succeeded;
            openModal({
              variant: failed ? 'warning' : 'success',
              title: failed ? 'Trash partially emptied' : 'Trash emptied',
              description: failed
                ? `Deleted ${succeeded} case(s). ${failed} failed. Try again for remaining.`
                : `Deleted ${succeeded} case(s) successfully.`,
            });
            await fetchTrashedCases();
          } catch (e) {
            openModal({
              variant: 'error',
              title: 'Failed to empty trash',
              description: 'An unexpected error occurred while deleting. Please try again.',
            });
          } finally {
            setEmptying(false);
          }
        }
      },
      secondaryAction: { label: 'Cancel' },
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="relative min-h-screen overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black text-white"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.14),transparent_55%)]" />

      <div className="mx-auto mt-10 w-full max-w-5xl px-6">
        <div className="rounded-3xl border border-white/10 bg-white/[0.018] p-8 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
          <h1 className="text-2xl font-semibold text-white">Trash Bin</h1>
          <p className="text-xs text-gray-400 mt-2">
            Restore or permanently remove deleted cases.
          </p>

          {cases.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={emptying}
                onClick={handleEmptyTrash}
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold shadow-lg transition ${emptying ? "opacity-60 cursor-not-allowed" : "hover:from-rose-500 hover:to-orange-400"} bg-gradient-to-r from-rose-600 to-orange-500 text-white`}
                aria-disabled={emptying}
              >
                {emptying ? "Deleting…" : "Empty Trash"}
              </button>
            </div>
          )}
          <div className="mt-6 space-y-4">
            {cases.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/12 bg-black/30 px-6 py-10 text-center text-sm text-gray-400">
                No cases in the Trash Bin.
              </div>
            ) : (
              cases.map((caseItem) => (
                <div
                  key={caseItem.doc_id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm text-gray-200 shadow-[0_18px_40px_rgba(15,23,42,0.45)]"
                >
                  <div>
                    <p className="text-base font-semibold text-white">
                      {caseItem.caseTitle || "Untitled case"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">#{caseItem.caseNumber}</p>
                  </div>
                  <div className="flex gap-3 mt-3 sm:mt-0">
                    <button
                      onClick={() => handleRestore(caseItem.doc_id)}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:from-emerald-500 hover:to-teal-500"
                    >
                      <FaTrashRestore /> Restore
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(caseItem.doc_id)}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:from-rose-500 hover:to-orange-400"
                    >
                      <FaTrashAlt /> Delete Permanently
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <Link
              to="/manage-cases"
              className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2 text-sm font-medium text-gray-300 transition hover:border-white/30 hover:text-white"
            >
              Back to Manage Cases
            </Link>
          </div>
        </div>
      </div>

      <NotificationModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        description={modalState.description}
        variant={modalState.variant}
        onClose={closeModal}
        primaryAction={modalState.primaryAction}
        secondaryAction={modalState.secondaryAction}
      />
    </motion.div>
  );
}

export default TrashBinPage;
