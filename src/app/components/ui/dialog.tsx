import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

/**
 * Modal dialog on the native <dialog> element: the browser provides focus
 * containment, Escape to close, inert background and focus restoration.
 */
export function Dialog({ open, onOpenChange, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        onOpenChange(false);
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-fg shadow-xl backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
