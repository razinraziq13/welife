import { memo } from 'react';
import type { LifeStage } from '@engine/characters/stats';
import type { Appearance } from '@engine/state/schema';
import { cn } from '@app/lib/cn';
import { EYE_COLORS, HAIR_COLORS, SHIRT_COLORS, SKIN_TONES, greyHair, shade } from './palette';

/**
 * Layered, illustrated 2D portrait (spec §1: "layered 2D illustrated avatars with age
 * progression"; no image service). Layers, back to front: background, back hair, body,
 * neck, ears, head, cheeks/freckles, wrinkles, eyes, brows, nose, mouth, front hair,
 * glasses. Proportions change with the life stage; hair greys with age.
 * Appearance is purely cosmetic and never affects gameplay.
 */

interface StageGeometry {
  headR: number;
  cy: number;
  shoulder: number;
}

const STAGE: Record<LifeStage, StageGeometry> = {
  baby: { headR: 25, cy: 47, shoulder: 21 },
  toddler: { headR: 23.5, cy: 45, shoulder: 23 },
  child: { headR: 22, cy: 43, shoulder: 26 },
  teen: { headR: 20.5, cy: 41, shoulder: 30 },
  youngAdult: { headR: 19.5, cy: 40, shoulder: 33 },
  adult: { headR: 19.5, cy: 40, shoulder: 34 },
  middleAge: { headR: 19.5, cy: 40, shoulder: 34 },
  senior: { headR: 19.5, cy: 41, shoulder: 33 },
};

const FACE_RATIO = [0.9, 1.0, 0.84] as const;
const YOUNG: readonly LifeStage[] = ['baby', 'toddler', 'child'];

export interface AvatarProps {
  appearance: Appearance;
  stage: LifeStage;
  ageYears: number;
  /** Accessible description; omit when the portrait is decorative next to a visible name. */
  label?: string;
  className?: string;
  /** Show a soft circular background. */
  framed?: boolean;
}

function hairPaths(
  style: number,
  stage: LifeStage,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) {
  const top = cy - ry;
  const cap = `M ${cx - rx - 1} ${cy - 1} A ${rx + 1} ${ry + 1} 0 0 1 ${cx + rx + 1} ${cy - 1}`;
  if (stage === 'baby') {
    return {
      back: null,
      front: `M ${cx - 4} ${top + 3} q 4 -9 9 -4 q -4 -1 -5 3 q 3 -3 6 0`,
      frontStroke: true,
    };
  }
  switch (style) {
    case 0: // short crop
      return {
        back: null,
        front: `${cap} Q ${cx + rx * 0.5} ${cy - ry * 0.5} ${cx} ${cy - ry * 0.55} Q ${cx - rx * 0.5} ${cy - ry * 0.5} ${cx - rx - 1} ${cy - 1} Z`,
        frontStroke: false,
      };
    case 1: // side part
      return {
        back: null,
        front: `${cap} Q ${cx + rx * 0.7} ${cy - ry * 0.25} ${cx + rx * 0.15} ${cy - ry * 0.6} Q ${cx - rx * 0.5} ${cy - ry * 0.75} ${cx - rx - 1} ${cy + 2} Z`,
        frontStroke: false,
      };
    case 2: // short curls
      return {
        back: `M ${cx - rx * 1.12} ${cy + 2} A ${rx * 1.12} ${ry * 1.08} 0 0 1 ${cx + rx * 1.12} ${cy + 2} Z`,
        front: `${cap} Q ${cx + rx * 0.6} ${cy - ry * 0.35} ${cx + rx * 0.25} ${cy - ry * 0.55} Q ${cx} ${cy - ry * 0.4} ${cx - rx * 0.25} ${cy - ry * 0.55} Q ${cx - rx * 0.6} ${cy - ry * 0.35} ${cx - rx - 1} ${cy - 1} Z`,
        frontStroke: false,
      };
    case 3: // long straight
      return {
        back: `M ${cx - rx * 1.12} ${cy - ry * 0.2} A ${rx * 1.12} ${ry * 1.1} 0 0 1 ${cx + rx * 1.12} ${cy - ry * 0.2} L ${cx + rx * 1.2} ${cy + ry * 1.7} Q ${cx} ${cy + ry * 1.9} ${cx - rx * 1.2} ${cy + ry * 1.7} Z`,
        front: `${cap} Q ${cx + rx * 0.9} ${cy - ry * 0.1} ${cx + rx * 0.2} ${cy - ry * 0.62} Q ${cx - rx * 0.8} ${cy - ry * 0.2} ${cx - rx - 1} ${cy + ry * 0.4} Z`,
        frontStroke: false,
      };
    case 4: // bob with fringe
      return {
        back: `M ${cx - rx * 1.15} ${cy - ry * 0.1} A ${rx * 1.15} ${ry * 1.12} 0 0 1 ${cx + rx * 1.15} ${cy - ry * 0.1} L ${cx + rx * 1.15} ${cy + ry * 0.75} L ${cx - rx * 1.15} ${cy + ry * 0.75} Z`,
        front: `${cap} L ${cx + rx + 1} ${cy - ry * 0.3} L ${cx - rx - 1} ${cy - ry * 0.3} Z`,
        frontStroke: false,
      };
    case 5: // ponytail
      return {
        back: `M ${cx + rx * 0.7} ${cy - ry * 0.6} q ${rx * 0.9} ${ry * 0.2} ${rx * 0.75} ${ry * 1.3} q -${rx * 0.25} -${ry * 0.6} -${rx * 0.75} -${ry * 0.9} Z`,
        front: `${cap} Q ${cx + rx * 0.6} ${cy - ry * 0.45} ${cx} ${cy - ry * 0.55} Q ${cx - rx * 0.6} ${cy - ry * 0.45} ${cx - rx - 1} ${cy - 1} Z`,
        frontStroke: false,
      };
    case 6: // volume / afro
      return {
        back: `M ${cx} ${cy - ry * 0.25} m -${rx * 1.45} 0 a ${rx * 1.45} ${ry * 1.35} 0 1 0 ${rx * 2.9} 0 a ${rx * 1.45} ${ry * 1.35} 0 1 0 -${rx * 2.9} 0`,
        front: `${cap} Q ${cx} ${cy - ry * 0.5} ${cx - rx - 1} ${cy - 1} Z`,
        frontStroke: false,
      };
    default: // 7: close buzz (bald on seniors)
      return stage === 'senior'
        ? {
            back: null,
            front: `M ${cx - rx} ${cy - 2} q 2 -7 6 -9 M ${cx + rx} ${cy - 2} q -2 -7 -6 -9`,
            frontStroke: true,
          }
        : {
            back: null,
            front: `${cap} Q ${cx} ${cy - ry * 0.7} ${cx - rx - 1} ${cy - 1} Z`,
            frontStroke: false,
          };
  }
}

function AvatarImpl({ appearance, stage, ageYears, label, className, framed = true }: AvatarProps) {
  const g = STAGE[stage];
  const ratio = FACE_RATIO[appearance.faceShape] ?? 1;
  const rx = g.headR * ratio;
  const ry = g.headR * (appearance.faceShape === 2 ? 1.14 : 1.06);
  const cx = 50;
  const cy = g.cy;
  const skin = SKIN_TONES[appearance.skinTone] ?? SKIN_TONES[3];
  const skinShadow = shade(skin, -18);
  const hair = greyHair(HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[0], ageYears);
  const eye = EYE_COLORS[appearance.eyeColor] ?? EYE_COLORS[0];
  const shirt =
    stage === 'baby'
      ? '#a9d5f5'
      : (SHIRT_COLORS[(appearance.hairStyle * 3 + appearance.faceShape) % SHIRT_COLORS.length] ??
        '#5b7fb8');
  const young = YOUNG.includes(stage);
  const shoulderTop = cy + ry + (young ? 1 : 4);
  const sw = g.shoulder;
  const eyeY = cy + ry * 0.08;
  const eyeDx = rx * 0.4;
  const eyeR = young ? 3.6 : 3.1;
  const hairShape = hairPaths(appearance.hairStyle, stage, cx, cy, rx, ry);
  const glasses = stage === 'senior' && appearance.hairStyle % 2 === 0;

  return (
    <svg
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('size-16 shrink-0', className)}
      data-stage={stage}
    >
      {framed && <circle cx="50" cy="50" r="50" className="fill-primary-soft" />}
      {/* Back hair */}
      {hairShape.back && <path d={hairShape.back} fill={hair} />}
      {/* Body and neck */}
      <path
        d={`M ${cx - sw} 101 L ${cx - sw} ${shoulderTop + 12} Q ${cx - sw} ${shoulderTop} ${cx - sw + 12} ${shoulderTop} L ${cx + sw - 12} ${shoulderTop} Q ${cx + sw} ${shoulderTop} ${cx + sw} ${shoulderTop + 12} L ${cx + sw} 101 Z`}
        fill={shirt}
      />
      <rect
        x={cx - 5.5}
        y={cy + ry * 0.6}
        width="11"
        height={shoulderTop - (cy + ry * 0.6) + 3}
        rx="4"
        fill={skinShadow}
      />
      {/* Ears and head */}
      <circle cx={cx - rx} cy={cy + 3} r="4" fill={skinShadow} />
      <circle cx={cx + rx} cy={cy + 3} r="4" fill={skinShadow} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={skin} />
      {/* Cheeks and freckles */}
      {young && (
        <>
          <circle cx={cx - eyeDx - 2} cy={eyeY + 7} r="3.2" fill="#f28b82" opacity="0.35" />
          <circle cx={cx + eyeDx + 2} cy={eyeY + 7} r="3.2" fill="#f28b82" opacity="0.35" />
        </>
      )}
      {appearance.freckles &&
        [-1, 1].flatMap((side) =>
          [0, 1, 2].map((i) => (
            <circle
              key={`${String(side)}-${String(i)}`}
              cx={cx + side * (eyeDx - 2 + i * 2.2)}
              cy={eyeY + 5.5 + (i % 2)}
              r="0.7"
              fill={shade(skin, -45)}
            />
          )),
        )}
      {/* Age lines */}
      {(stage === 'middleAge' || stage === 'senior') && (
        <g
          stroke={shade(skin, -35)}
          strokeWidth="0.7"
          fill="none"
          strokeLinecap="round"
          opacity="0.8"
        >
          <path d={`M ${cx - 6} ${cy - ry * 0.45} q 6 -1.5 12 0`} />
          {stage === 'senior' && (
            <>
              <path d={`M ${cx - 7} ${cy - ry * 0.55} q 7 -1.5 14 0`} />
              <path
                d={`M ${cx - eyeDx - 5} ${eyeY - 1} l -2 -1 M ${cx - eyeDx - 5} ${eyeY + 1} l -2 1`}
              />
              <path
                d={`M ${cx + eyeDx + 5} ${eyeY - 1} l 2 -1 M ${cx + eyeDx + 5} ${eyeY + 1} l 2 1`}
              />
              <path d={`M ${cx - 6} ${eyeY + 9} q -1 3 0 5 M ${cx + 6} ${eyeY + 9} q 1 3 0 5`} />
            </>
          )}
        </g>
      )}
      {/* Eyes */}
      {[-1, 1].map((side) => (
        <g key={side}>
          <ellipse
            cx={cx + side * eyeDx}
            cy={eyeY}
            rx={eyeR}
            ry={eyeR * (stage === 'senior' ? 0.7 : 0.82)}
            fill="#fff"
          />
          <circle cx={cx + side * eyeDx} cy={eyeY + 0.2} r={eyeR * 0.62} fill={eye} />
          <circle cx={cx + side * eyeDx} cy={eyeY + 0.2} r={eyeR * 0.3} fill="#141414" />
          <circle cx={cx + side * eyeDx + 0.8} cy={eyeY - 0.7} r={eyeR * 0.15} fill="#fff" />
        </g>
      ))}
      {/* Brows */}
      {stage !== 'baby' &&
        [-1, 1].map((side) => (
          <path
            key={side}
            d={`M ${cx + side * (eyeDx - 3.5)} ${eyeY - 5.5} q ${side * 3.5} -1.8 ${side * 7} 0`}
            stroke={shade(hair, -10)}
            strokeWidth={young ? 1.1 : 1.5}
            fill="none"
            strokeLinecap="round"
          />
        ))}
      {/* Nose and mouth */}
      <path
        d={`M ${cx} ${eyeY + 3} q -1.6 3.4 0.4 4.2`}
        stroke={shade(skin, -30)}
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - 4.5} ${eyeY + 10} q 4.5 ${young ? 4 : 3} 9 0`}
        stroke="#8a3b2e"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
      {/* Front hair */}
      {hairShape.frontStroke ? (
        <path
          d={hairShape.front}
          stroke={hair}
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
      ) : (
        <path d={hairShape.front} fill={hair} opacity={appearance.hairStyle === 7 ? 0.75 : 1} />
      )}
      {/* Glasses */}
      {glasses && (
        <g stroke="#3b3b3b" strokeWidth="1" fill="none">
          <circle cx={cx - eyeDx} cy={eyeY} r={eyeR + 1.8} />
          <circle cx={cx + eyeDx} cy={eyeY} r={eyeR + 1.8} />
          <path d={`M ${cx - eyeDx + eyeR + 1.8} ${eyeY} L ${cx + eyeDx - eyeR - 1.8} ${eyeY}`} />
        </g>
      )}
    </svg>
  );
}

export const Avatar = memo(AvatarImpl);
