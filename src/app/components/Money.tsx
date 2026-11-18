import { useId, useState } from 'react';
import { formatMoney, formatSignedMoney, toMinorString, type CurrencyLike } from '@app/i18n/format';
import { cn } from '@app/lib/cn';
import { Button } from './ui/button';

/** A money amount (minor units) in the life's currency. */
export function Money({
  minor,
  currency,
  signed = false,
  className,
}: {
  minor: bigint;
  currency: CurrencyLike;
  signed?: boolean;
  className?: string;
}) {
  const negative = minor < 0n;
  return (
    <span
      className={cn(
        'tabular-nums',
        signed && (negative ? 'text-danger' : 'text-success'),
        className,
      )}
    >
      {signed ? formatSignedMoney(minor, currency) : formatMoney(minor, currency)}
    </span>
  );
}

/**
 * Amount entry in major units (e.g. dollars), converted to minor units for the command.
 * Invalid amounts are explained inline rather than sent.
 */
export function AmountForm({
  label,
  currency,
  submitLabel,
  disabled = false,
  disabledReason,
  onSubmit,
}: {
  label: string;
  currency: CurrencyLike & { symbol: string };
  submitLabel: string;
  disabled?: boolean;
  disabledReason?: string | null;
  onSubmit: (minor: string) => Promise<unknown>;
}) {
  const id = useId();
  const errorId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const minor = toMinorString(value, currency);
        if (!minor) {
          setError(
            `Enter an amount greater than zero${currency.exponent > 0 ? ` (up to ${String(currency.exponent)} decimal places)` : ''}.`,
          );
          return;
        }
        setError(null);
        void onSubmit(minor).then(() => {
          setValue('');
        });
      }}
    >
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label} ({currency.symbol})
        </label>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          disabled={disabled}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
        />
      </div>
      <Button type="submit" variant="secondary" disabled={disabled}>
        {submitLabel}
      </Button>
      {error && (
        <p id={errorId} role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
      {disabled && disabledReason && <p className="w-full text-xs text-muted">{disabledReason}</p>}
    </form>
  );
}
