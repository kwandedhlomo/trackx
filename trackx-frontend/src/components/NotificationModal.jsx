import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

const VARIANT_CONFIG = {
  success: {
    icon: CheckCircle,
    accent: "text-green-400",
    glow: "from-green-500/40 via-green-500/10 to-transparent",
  },
  error: {
    icon: AlertCircle,
    accent: "text-red-400",
    glow: "from-red-500/40 via-red-500/10 to-transparent",
  },
  warning: {
    icon: AlertTriangle,
    accent: "text-yellow-400",
    glow: "from-yellow-500/40 via-yellow-500/10 to-transparent",
  },
  info: {
    icon: Info,
    accent: "text-blue-400",
    glow: "from-blue-500/40 via-blue-500/10 to-transparent",
  },
};

const noop = () => {};

function NotificationModal({
  isOpen,
  title,
  description,
  variant = "info",
  onClose = noop,
  primaryAction,
  secondaryAction,
}) {
  const config = VARIANT_CONFIG[variant] || VARIANT_CONFIG.info;
  const Icon = config.icon;

  const handlePrimary = () => {
    if (primaryAction?.onClick) {
      primaryAction.onClick();
    }
    if (primaryAction?.closeOnClick !== false) {
      onClose();
    }
  };

  const handleSecondary = () => {
    if (secondaryAction?.onClick) {
      secondaryAction.onClick();
    }
    if (secondaryAction?.closeOnClick !== false) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 sm:px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-gray-900/95 shadow-2xl"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className={`absolute -inset-x-6 -top-32 h-48 bg-gradient-to-b ${config.glow} pointer-events-none`} />

            <div className="relative p-6 sm:p-8">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-black/40 ${config.accent}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h2 id="modal-title" className="text-lg font-semibold text-white">
                    {title}
                  </h2>
                </div>

                <button
                  onClick={onClose}
                  className="rounded-full p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {description && (
                <p className="mt-3 text-sm text-gray-300 leading-relaxed">{description}</p>
              )}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-4">
                {secondaryAction && (
                  <button
                    type="button"
                    onClick={handleSecondary}
                    className="rounded-full border border-gray-600 px-5 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-400 hover:text-white"
                  >
                    {secondaryAction.label || "Cancel"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePrimary}
                  className={`inline-flex items-center justify-center rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/20 ${config.accent}`}
                >
                  {(primaryAction && primaryAction.label) || "OK"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default NotificationModal;
