import { Dialog } from '@app/components/ui/dialog';
import { SHORTCUTS } from './shortcuts';

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts">
      <dl className="divide-y divide-border">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.keys.join(' ')} className="flex items-center justify-between py-2.5">
            <dt className="text-sm">{shortcut.description}</dt>
            <dd className="flex gap-1">
              {shortcut.keys.map((key, index) => (
                <kbd
                  // Static list that never reorders; index keeps repeated keys unique.
                  key={index}
                  className="min-w-7 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-center font-mono text-sm"
                >
                  {key}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted">
        Press the keys one after another. Shortcuts can be turned off in Settings.
      </p>
    </Dialog>
  );
}
