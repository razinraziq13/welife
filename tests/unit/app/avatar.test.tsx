import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Avatar } from '@app/components/avatar/Avatar';
import { greyHair, HAIR_COLORS } from '@app/components/avatar/palette';
import { LIFE_STAGES, lifeStage } from '@engine/characters/stats';
import type { Appearance } from '@engine/state/schema';

const look: Appearance = {
  skinTone: 4,
  hairColor: 1,
  hairStyle: 2,
  eyeColor: 3,
  faceShape: 0,
  freckles: true,
};
const AGE_FOR_STAGE = {
  baby: 0,
  toddler: 3,
  child: 7,
  teen: 15,
  youngAdult: 25,
  adult: 40,
  middleAge: 58,
  senior: 80,
};

describe('layered avatar (M2 exit: avatar ages appropriately)', () => {
  it('renders every life stage with stage-specific proportions', () => {
    const headRadii = new Set<string>();
    for (const stage of LIFE_STAGES) {
      const html = renderToStaticMarkup(
        <Avatar appearance={look} stage={stage} ageYears={AGE_FOR_STAGE[stage]} label="test" />,
      );
      expect(html).toContain(`data-stage="${stage}"`);
      expect(html).toContain('role="img"');
      const ellipse = /<ellipse cx="50" cy="[\d.]+" rx="([\d.]+)"/.exec(html);
      headRadii.add(ellipse?.[1] ?? '');
    }
    // Babies and children have proportionally larger heads than adults.
    expect(headRadii.size).toBeGreaterThanOrEqual(4);
  });

  it('adds age lines for older stages only and greys hair with age', () => {
    const young = renderToStaticMarkup(
      <Avatar appearance={look} stage="youngAdult" ageYears={25} />,
    );
    const senior = renderToStaticMarkup(<Avatar appearance={look} stage="senior" ageYears={80} />);
    expect(young).not.toContain('opacity="0.8"');
    expect(senior).toContain('opacity="0.8"');
    expect(greyHair(HAIR_COLORS[1], 25)).toBe(HAIR_COLORS[1]);
    expect(greyHair(HAIR_COLORS[1], 80)).not.toBe(HAIR_COLORS[1]);
  });

  it('is decorative (hidden from assistive tech) when no label is given', () => {
    expect(renderToStaticMarkup(<Avatar appearance={look} stage="child" ageYears={7} />)).toContain(
      'aria-hidden="true"',
    );
  });

  it('maps ages to stages consistently with the engine', () => {
    for (const [stage, age] of Object.entries(AGE_FOR_STAGE)) expect(lifeStage(age)).toBe(stage);
  });
});
