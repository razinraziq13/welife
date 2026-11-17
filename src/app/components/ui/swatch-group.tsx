import { cn } from '@app/lib/cn';

interface SwatchGroupProps {
  legend: string;
  name: string;
  colors: readonly string[];
  /** Accessible names for each colour. */
  labels: readonly string[];
  value: number;
  onChange: (index: number) => void;
}

/** Colour picker built on native radios: arrow keys move between colours. */
export function SwatchGroup({ legend, name, colors, labels, value, onChange }: SwatchGroupProps) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-fg">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {colors.map((color, index) => (
          <label
            key={color}
            className={cn(
              'relative grid size-9 cursor-pointer place-items-center rounded-full border-2',
              'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
              index === value ? 'border-fg' : 'border-transparent',
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={index === value}
              onChange={() => {
                onChange(index);
              }}
            />
            <span className="sr-only">{labels[index] ?? `Option ${String(index + 1)}`}</span>
            <span
              aria-hidden="true"
              className="size-7 rounded-full border border-black/15"
              style={{ backgroundColor: color }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
