"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from "lucide-react";

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

/* ─────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────── */
const typeConfig: Record<
  ToastType,
  { icon: typeof CheckCircle2; bg: string; border: string; text: string; iconColor: string }
> = {
  success: {
    icon: CheckCircle2,
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-800",
    iconColor: "text-green-500",
  },
  error: {
    icon: AlertCircle,
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    iconColor: "text-red-500",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    iconColor: "text-amber-500",
  },
  info: {
    icon: Info,
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    iconColor: "text-blue-500",
  },
};

const DEFAULT_DURATION = 4000;

/* ─────────────────────────────────────────────
   CONTEXT
───────────────────────────────────────────── */
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* ─────────────────────────────────────────────
   SINGLE TOAST ITEM
───────────────────────────────────────────── */
function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = typeConfig[toast.type];
  const Icon = config.icon;

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true));

    // Auto-dismiss
    timerRef.current = setTimeout(dismiss, toast.duration ?? DEFAULT_DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dismiss, toast.duration]);

  return (
    <div
      role="alert"
      className={[
        "flex items-start gap-3 w-full max-w-sm px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm",
        config.bg,
        config.border,
        "transition-all duration-300 ease-out",
        visible && !exiting
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-2",
      ].join(" ")}
    >
      <Icon
        size={18}
        className={`flex-shrink-0 mt-0.5 ${config.iconColor}`}
        strokeWidth={2}
      />
      <p className={`flex-1 text-sm font-medium leading-snug ${config.text}`}>
        {toast.message}
      </p>
      <button
        onClick={dismiss}
        className="flex-shrink-0 rounded-md p-0.5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        aria-label="Dismiss"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PROVIDER
───────────────────────────────────────────── */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback(
    (type: ToastType, message: string, duration?: number) => {
      const id = `toast-${++counterRef.current}-${Date.now()}`;
      setToasts((prev) => [...prev, { id, type, message, duration }]);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    toast: addToast,
    success: (msg, dur) => addToast("success", msg, dur),
    error: (msg, dur) => addToast("error", msg, dur),
    warning: (msg, dur) => addToast("warning", msg, dur),
    info: (msg, dur) => addToast("info", msg, dur),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast container — top-center on mobile, top-right on desktop */}
      <div
        aria-live="polite"
        className="fixed z-[9999] top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-4 flex flex-col items-center sm:items-end gap-2 w-[calc(100%-2rem)] sm:w-auto pointer-events-none"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto w-full sm:w-auto">
            <ToastItem toast={t} onDismiss={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
