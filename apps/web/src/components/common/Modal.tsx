import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 transition-all animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-dark-surface w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dark-border">
          <h2 className="text-xl font-bold text-text-main dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-dark-border transition-colors text-slate-400"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 dark:border-dark-border bg-slate-50/50 dark:bg-dark-bg/50">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
