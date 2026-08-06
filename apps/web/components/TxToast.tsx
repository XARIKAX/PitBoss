'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { explorerTx } from '@/config/chains';

type ToastKind = 'pending' | 'success' | 'error';

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  chainId?: number;
  hash?: string;
};

type ToastContextValue = {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Minimal transaction toast system. `push` returns an id so callers can update
 * the same toast from pending -> success/error as a tx resolves. Toasts with a
 * chainId + hash render an explorer link.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...t, id }]);
    if (t.kind !== 'pending') {
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6000);
    }
    return id;
  }, []);

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-16 right-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto rounded-xl border border-line bg-ink/95 p-4 shadow-lg backdrop-blur"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span
                    className={
                      t.kind === 'success'
                        ? 'inline-block h-2 w-2 rounded-full bg-lime'
                        : t.kind === 'error'
                          ? 'inline-block h-2 w-2 rounded-full bg-red-400'
                          : 'inline-block h-2 w-2 animate-pulse rounded-full bg-paper'
                    }
                  />
                  {t.title}
                </p>
                {t.message ? <p className="mt-1 text-xs text-mute">{t.message}</p> : null}
                {t.chainId != null && t.hash ? (
                  <a
                    href={explorerTx(t.chainId, t.hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="data mt-2 inline-block text-xs text-lime underline underline-offset-2"
                  >
                    View on explorer ↗
                  </a>
                ) : null}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-mute transition-colors hover:text-paper"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
