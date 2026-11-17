import { useId } from 'react';
import { cn } from '@app/lib/cn';

export interface Choice<V extends string> {
  value: V;
  label: string;
  description?: string;
}

interface ChoiceGroupProps<V extends string> {
  legend: string;
  description?: string;
  name: string;
  value: V;
  options: readonly Choice<V>[];
  onChange: (value: V) => void;
  disabled?: boolean;
}

/**
 * Accessible single-choice control built on native radio inputs
 * (arrow keys move between options; the fieldset legend names the group).
 */
export function ChoiceGroup<V extends string>({
  legend,
  description,
  name,
  value,
  options,
  onChange,
  disabled = false,
}: ChoiceGroupProps<V>) {
  const descriptionId = useId();
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={description === undefined ? undefined : descriptionId}
    >
      <legend className="text-sm font-semibold text-fg">{legend}</legend>
      {description !== undefined && (
        <p id={descriptionId} className="mt-1 text-sm text-muted">
          {description}
        </p>
      )}
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'relative flex cursor-pointer flex-col rounded-xl border px-3 py-2.5 text-sm transition-colors',
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                checked
                  ? 'border-primary bg-primary-soft text-fg'
                  : 'border-border bg-surface text-fg hover:bg-surface-2',
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => {
                  onChange(option.value);
                }}
              />
              <span className="font-medium">{option.label}</span>
              {option.description !== undefined && (
                <span className="mt-0.5 text-xs text-muted">{option.description}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
