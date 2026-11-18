import type { Effect, EventDefinition } from '../../events/schema';
import { ageYears, all, auto, cmp, decide, define, schedule, stat } from './dsl';

/**
 * Milestone 5 content: running companies and owning property. Each event is about one of
 * the player's companies ({business}) or properties ({property}), picked by the runtime.
 */

const cash = (percent: number): Effect => ({ kind: 'businessCash', percent });
const quality = (delta: number): Effect => ({ kind: 'businessQuality', delta });
const brand = (delta: number): Effect => ({ kind: 'businessBrand', delta });
const condition = (delta: number): Effect => ({ kind: 'propertyCondition', delta });
const repair = (valueBp: number): Effect => ({ kind: 'propertyCost', valueBp });

const owner = cmp('business.count', 'gte', 1);
const landlord = cmp('property.rentals', 'gte', 1);
const propertyOwner = cmp('property.count', 'gte', 1);

const BUSINESS: EventDefinition[] = [
  define({
    id: 'glowing-review',
    category: 'business',
    asset: 'business',
    when: owner,
    chancePpm: 25_000,
    cooldownMonths: 12,
    effects: [brand(6), stat('happiness', 30)],
    text: auto(
      'A glowing review',
      'A well-known local reviewer visited {business}.',
      'The review was glowing, and new customers started arriving.',
    ),
  }),
  define({
    id: 'bad-review',
    category: 'business',
    asset: 'business',
    when: owner,
    chancePpm: 15_000,
    cooldownMonths: 12,
    text: decide(
      'A harsh review',
      'An angry online review of {business} is getting a lot of attention.',
      [
        [
          'respond',
          'Reply politely and make it right',
          'Your reply was well received, and the damage was limited.',
        ],
        ['ignore', 'Ignore it', 'The review kept circulating for weeks.'],
        ['argue', 'Argue back publicly', 'The argument went viral, and not in a good way.'],
      ],
    ),
    choices: [
      { id: 'respond', requires: null, effects: [brand(-1), cash(-5)] },
      { id: 'ignore', requires: null, effects: [brand(-5)] },
      { id: 'argue', requires: null, effects: [brand(-10), stat('stress', 30)] },
    ],
  }),
  define({
    id: 'key-staff-quits',
    category: 'business',
    asset: 'business',
    when: owner,
    chancePpm: 15_000,
    cooldownMonths: 18,
    text: decide(
      'A key employee resigns',
      'Your most experienced employee at {business} has been offered a job elsewhere.',
      [
        [
          'counter',
          'Offer them a raise to stay',
          'They stayed, and the team noticed you value good work.',
        ],
        [
          'letGo',
          'Wish them well',
          'They left, and quality slipped while their replacement learned the ropes.',
        ],
      ],
    ),
    choices: [
      { id: 'counter', requires: null, effects: [cash(-30), quality(2)] },
      { id: 'letGo', requires: null, effects: [quality(-6)] },
    ],
  }),
  define({
    id: 'big-order',
    category: 'business',
    asset: 'business',
    when: owner,
    chancePpm: 15_000,
    cooldownMonths: 12,
    effects: [cash(120), stat('happiness', 40)],
    text: auto(
      'A big order',
      'A large customer placed a one-off order with {business}.',
      'The order was delivered on time and paid in full.',
    ),
  }),
  define({
    id: 'price-war',
    category: 'business',
    asset: 'business',
    when: all(owner, cmp('economy.cycle', 'lt', 10)),
    chancePpm: 10_000,
    cooldownMonths: 24,
    text: decide('Price war', 'A competitor of {business} has slashed prices to win customers.', [
      ['match', 'Run a matching promotion', 'You kept your customers, at a cost.'],
      ['quality', 'Compete on quality instead', 'Some customers left; the loyal ones stayed.'],
    ]),
    choices: [
      { id: 'match', requires: null, effects: [cash(-60), brand(2)] },
      { id: 'quality', requires: null, effects: [brand(-3), quality(3)] },
    ],
  }),
  define({
    id: 'inspection',
    category: 'business',
    asset: 'business',
    when: owner,
    chancePpm: 12_000,
    cooldownMonths: 24,
    text: decide(
      'Inspection',
      'An inspector is due at {business} next week to check safety and standards.',
      [
        ['prepare', 'Spend time and money preparing', 'You passed with top marks.'],
        ['wing', 'Carry on as normal', 'You passed, but with a list of things to fix and a fine.'],
      ],
    ),
    choices: [
      { id: 'prepare', requires: null, effects: [cash(-15), quality(2), stat('stress', 15)] },
      { id: 'wing', requires: null, effects: [cash(-40), brand(-2)] },
    ],
  }),
  define({
    id: 'equipment-breakdown',
    category: 'business',
    asset: 'business',
    when: owner,
    chancePpm: 12_000,
    cooldownMonths: 18,
    effects: [cash(-50), quality(-2), stat('stress', 20)],
    text: auto(
      'Breakdown',
      'Essential equipment at {business} broke down.',
      'Repairs were costly and work was disrupted for a week.',
    ),
  }),
  define({
    id: 'partnership-offer',
    category: 'business',
    asset: 'business',
    when: owner,
    chancePpm: 8_000,
    cooldownMonths: 24,
    text: decide(
      'Joint promotion',
      'A popular local brand wants to run a joint promotion with {business}.',
      [
        ['accept', 'Accept', 'The promotion brought in plenty of new customers.'],
        ['decline', 'Decline', 'You kept your brand to yourself.'],
      ],
    ),
    choices: [
      { id: 'accept', requires: null, effects: [cash(-20), brand(8)] },
      { id: 'decline', requires: null, effects: [] },
    ],
  }),
  define({
    id: 'staff-idea',
    category: 'business',
    asset: 'business',
    when: owner,
    chancePpm: 12_000,
    cooldownMonths: 18,
    text: decide(
      'An idea from the team',
      'A member of staff at {business} suggests a new way of working.',
      [
        ['try', 'Try it out', 'It worked: things run more smoothly now.'],
        ['no', 'Stick with what works', 'Nothing changed, and the team was a little deflated.'],
      ],
    ),
    choices: [
      { id: 'try', requires: null, effects: [quality(4), stat('happiness', 20)] },
      { id: 'no', requires: null, effects: [quality(-1)] },
    ],
  }),
  define({
    id: 'supplier-delay',
    category: 'business',
    asset: 'business',
    when: owner,
    chancePpm: 12_000,
    cooldownMonths: 18,
    text: decide(
      'Supplier problems',
      'A supplier of {business} is delayed and offers a pricier alternative.',
      [
        ['pay', 'Pay for the alternative', 'Customers never noticed a thing.'],
        ['wait', 'Wait it out', 'Some customers went away disappointed.'],
      ],
    ),
    choices: [
      { id: 'pay', requires: null, effects: [cash(-25)] },
      { id: 'wait', requires: null, effects: [brand(-3), schedule('supplier-apology', 2, 50)] },
    ],
  }),
  define({
    id: 'supplier-apology',
    category: 'business',
    asset: 'business',
    scheduledOnly: true,
    when: ageYears(0),
    effects: [cash(15)],
    text: auto(
      'An apology',
      'The supplier who let {business} down got in touch.',
      'They sent a refund and a discount on the next order.',
    ),
  }),
  define({
    id: 'business-award',
    category: 'business',
    asset: 'business',
    when: owner,
    chancePpm: 6_000,
    cooldownMonths: 36,
    effects: [brand(10), stat('confidence', 50), stat('reputation', 40)],
    text: auto(
      'Business award',
      '{business} was shortlisted for a local business award.',
      'It won. The award now hangs proudly on the wall.',
    ),
  }),
];

const PROPERTY: EventDefinition[] = [
  define({
    id: 'boiler-breaks',
    category: 'property',
    asset: 'property',
    when: propertyOwner,
    chancePpm: 10_000,
    cooldownMonths: 18,
    text: decide(
      'Repairs needed',
      'The heating at your property in {property} has stopped working.',
      [
        ['fix', 'Call a professional', 'It was fixed properly the same week.'],
        ['patch', 'Patch it up cheaply', 'It works for now, though it may not last.'],
      ],
    ),
    choices: [
      { id: 'fix', requires: null, effects: [repair(50), condition(30)] },
      { id: 'patch', requires: null, effects: [repair(10), schedule('boiler-again', 4, 50)] },
    ],
  }),
  define({
    id: 'boiler-again',
    category: 'property',
    asset: 'property',
    scheduledOnly: true,
    when: ageYears(0),
    effects: [repair(70), condition(-40), stat('stress', 20)],
    text: auto(
      'It broke again',
      'The patched-up heating at {property} failed again.',
      'This time the repair was bigger and dearer.',
    ),
  }),
  define({
    id: 'leaky-roof',
    category: 'property',
    asset: 'property',
    when: propertyOwner,
    chancePpm: 6_000,
    cooldownMonths: 36,
    effects: [repair(120), condition(-30)],
    text: auto(
      'A leaking roof',
      'Heavy rain revealed a leak at your property in {property}.',
      'The roof was repaired before the damage spread.',
    ),
  }),
  define({
    id: 'great-tenant',
    category: 'property',
    asset: 'rentalProperty',
    when: landlord,
    chancePpm: 10_000,
    cooldownMonths: 24,
    effects: [condition(20), stat('happiness', 20)],
    text: auto(
      'A model tenant',
      'Your tenant in {property} has been looking after the place.',
      'They even fixed a few small things themselves.',
    ),
  }),
  define({
    id: 'tenant-complaint',
    category: 'property',
    asset: 'rentalProperty',
    when: landlord,
    chancePpm: 12_000,
    cooldownMonths: 12,
    text: decide(
      'A complaint',
      'Your tenant in {property} complains about mould in the bathroom.',
      [
        [
          'fix',
          'Fix it straight away',
          'The tenant was grateful and the property is in better shape.',
        ],
        ['delay', 'Put it off', 'The problem grew, and so did the tenant’s frustration.'],
      ],
    ),
    choices: [
      { id: 'fix', requires: null, effects: [repair(40), condition(30)] },
      { id: 'delay', requires: null, effects: [condition(-60), stat('stress', 20)] },
    ],
  }),
  define({
    id: 'neighbourhood-boom',
    category: 'property',
    asset: 'property',
    when: propertyOwner,
    chancePpm: 4_000,
    cooldownMonths: 60,
    effects: [condition(10), stat('happiness', 20)],
    text: auto(
      'A neighbourhood on the up',
      'New cafés and a park are opening near your property in {property}.',
      'The area feels livelier, and the property looks better for it.',
    ),
  }),
  define({
    id: 'storm-damage',
    category: 'property',
    asset: 'property',
    when: propertyOwner,
    chancePpm: 4_000,
    cooldownMonths: 48,
    effects: [repair(80), condition(-50), stat('stress', 30)],
    text: auto(
      'Storm damage',
      'A storm damaged your property in {property}.',
      'Repairs took a few weeks and some savings.',
    ),
  }),
  define({
    id: 'first-home-pride',
    category: 'property',
    asset: 'property',
    when: all(propertyOwner, cmp('home.own', 'eq', true)),
    chancePpm: 200_000,
    maxOccurrences: 1,
    effects: [stat('happiness', 80), stat('confidence', 30)],
    text: auto(
      'Keys in hand',
      'You hold the keys to a property of your own in {property}.',
      'It took a lot to get here, and it feels wonderful.',
    ),
  }),
];

export const ENTERPRISE_EVENTS: EventDefinition[] = [...BUSINESS, ...PROPERTY];
