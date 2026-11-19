import { useState } from 'react';
import type { GameView } from '@engine/view';
import { Avatar } from '@app/components/avatar/Avatar';
import { HAIR_COLORS, HAIR_COLOR_NAMES, HAIR_STYLE_NAMES } from '@app/components/avatar/palette';
import { Money } from '@app/components/Money';
import { Button } from '@app/components/ui/button';
import { Dialog } from '@app/components/ui/dialog';
import { SwatchGroup } from '@app/components/ui/swatch-group';
import { cn } from '@app/lib/cn';
import { useGameStore } from '@app/stores/gameStore';

/**
 * The barber or salon: pick a new hairstyle (and, from 14, a colour) with a live preview of
 * your character, then pay for it. Mounted only while open, so it starts from the current look.
 * Choosing the look you already have is not allowed.
 */
export function SalonDialog({
  view,
  open,
  onOpenChange,
  cutMinor,
  colourMinor,
}: {
  view: GameView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Price of a cut and of colouring on top (minor units). */
  cutMinor: bigint;
  colourMinor: bigint;
}) {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const c = view.character;
  const [style, setStyle] = useState(c.appearance.hairStyle);
  const [colour, setColour] = useState(c.appearance.hairColor);
  const canColour = c.age.years >= 14;
  const recolour = canColour && colour !== c.appearance.hairColor;
  const unchanged = style === c.appearance.hairStyle && !recolour;
  const total = cutMinor + (recolour ? colourMinor : 0n);
  const preview = {
    ...c.appearance,
    hairStyle: style,
    hairColor: canColour ? colour : c.appearance.hairColor,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Barber or salon">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar
            appearance={preview}
            stage={c.stage}
            ageYears={c.age.years}
            className="size-28 shrink-0 rounded-full bg-surface-2"
            label={`Preview of ${c.displayName} with the new look`}
          />
          <p className="text-sm text-muted">
            Pick a new style{canColour ? ' or colour' : ''}. The preview shows how you will look.
          </p>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-fg">Hairstyle</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {HAIR_STYLE_NAMES.map((name, i) => (
              <label
                key={name}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm',
                  style === i
                    ? 'border-primary bg-primary-soft font-semibold text-fg'
                    : 'border-border text-fg hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  name="salon-style"
                  className="sr-only"
                  checked={style === i}
                  onChange={() => {
                    setStyle(i);
                  }}
                />
                {name}
                {i === c.appearance.hairStyle && <span className="sr-only"> (current)</span>}
              </label>
            ))}
          </div>
        </fieldset>
        {canColour ? (
          <SwatchGroup
            legend="Hair colour"
            name="salon-colour"
            colors={HAIR_COLORS}
            labels={HAIR_COLOR_NAMES}
            value={colour}
            onChange={setColour}
          />
        ) : (
          <p className="text-xs text-muted">Hair colouring is for ages 14 and up.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-sm text-fg">
            Price: <Money minor={total} currency={view.country.currency} />
            {recolour && <span className="text-muted"> (cut and colour)</span>}
            <span className="block text-xs text-muted">2 hours of free time.</span>
          </p>
          <Button
            disabled={busy || unchanged}
            onClick={() => {
              void send({
                type: 'visitSalon',
                hairStyle: style,
                hairColor: recolour ? colour : null,
              }).then(() => {
                onOpenChange(false);
              });
            }}
          >
            {unchanged ? 'Choose a new look' : 'Get this look'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
