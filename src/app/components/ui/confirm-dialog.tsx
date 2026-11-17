import { useId, useState, type ReactNode } from 'react';
import { Button } from './button';
import { Dialog } from './dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => Promise<void> | void;
}

/** Confirmation for consequential actions (delete, rewind). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  tone = 'primary',
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="text-sm text-fg">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void Promise.resolve(onConfirm()).finally(() => {
              setBusy(false);
              onOpenChange(false);
            });
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initialValue: string;
  maxLength: number;
  confirmLabel: string;
  onConfirm: (value: string) => Promise<void> | void;
}

/** Single text-field dialog (rename). */
export function PromptDialog(props: PromptDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} title={props.title}>
      {/* Remounting the form whenever the dialog opens resets the field to the initial value. */}
      {props.open && <PromptForm key={props.initialValue} {...props} />}
    </Dialog>
  );
}

function PromptForm({
  onOpenChange,
  label,
  initialValue,
  maxLength,
  confirmLabel,
  onConfirm,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const id = useId();
  const trimmed = value.trim();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed.length === 0) return;
        void Promise.resolve(onConfirm(trimmed)).finally(() => {
          onOpenChange(false);
        });
      }}
    >
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-fg"
      />
      <div className="mt-5 flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={trimmed.length === 0}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
