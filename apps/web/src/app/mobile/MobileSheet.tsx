import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

/**
 * Bottom-sheet modal used for mobile secondary navigation, filters, confirmations.
 * Drag handle + tap-outside-to-dismiss.
 */
export function MobileSheet({
  open, onClose, title, children,
}: { open: boolean; onClose?: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onClose?.()}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed z-50 bottom-0 inset-x-0 bg-bg-elevated border-t border-white/10 rounded-t-3xl max-h-[85vh] flex flex-col pb-[var(--sab)]"
          >
            <div className="flex justify-center pt-2 pb-1">
              <span className="h-1 w-10 rounded-full bg-white/20" />
            </div>
            {(title || onClose) && (
              <div className="flex items-center justify-between px-5 pb-2">
                {title && <h3 className="text-base font-semibold text-text-bright">{title}</h3>}
                <div className="flex-1" />
                {onClose && (
                  <button
                    onClick={onClose}
                    className="h-9 w-9 grid place-items-center rounded-full hover:bg-white/10 text-text-muted"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            )}
            <div className="overflow-y-auto overscroll-contain px-2 pb-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
