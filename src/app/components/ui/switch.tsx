import { useId } from 'react';

interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** On/off toggle using a native checkbox exposed with the ARIA switch role. */
export function Switch({ label, description, checked, onChange, disabled = false }: SwitchProps) {
  const id = useId();
  const descriptionId = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-semibold text-fg">
          {label}
        </label>
        {description !== undefined && (
          <p id={descriptionId} className="mt-1 text-sm text-muted">
            {description}
          </p>
        )}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        aria-describedby={description === undefined ? undefined : descriptionId}
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="relative mt-0.5 h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full border border-border bg-surface-2 transition-colors before:absolute before:top-0.5 before:left-0.5 before:size-[1.375rem] before:rounded-full before:bg-fg-soft before:transition-transform checked:border-primary checked:bg-primary checked:before:translate-x-5 checked:before:bg-primary-fg disabled:opacity-50"
      />
    </div>
  );
}
