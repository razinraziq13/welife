import type { Effect, EventDefinition } from '../../events/schema';
import {
  ageYears,
  all,
  any,
  auto,
  cmp,
  decide,
  define,
  employed,
  family,
  flag,
  isIn,
  money,
  need,
  not,
  schedule,
  skill,
  stat,
} from './dsl';

/**
 * Milestone 6 content: law, health, moving abroad, religion, military service, politics and
 * royal duties. Written neutrally and non-graphically (decisions D6, D9): legal events are
 * abstract risks and consequences with no how-to detail, and religious events treat every
 * faith (and none) the same way.
 */

const legal = (
  caseKind: Extract<Effect, { kind: 'legalCase' }>['caseKind'],
  strength: number,
  role: 'defendant' | 'claimant' = 'defendant',
): Effect => ({
  kind: 'legalCase',
  caseKind,
  strength,
  role,
});
const condition = (kind: Extract<Effect, { kind: 'condition' }>['condition']): Effect => ({
  kind: 'condition',
  condition: kind,
});
const policy = (policyId: string, approval: number, cycle = 0, inflationBp = 0): Effect => ({
  kind: 'policy',
  policyId,
  approval,
  cycle,
  inflationBp,
});
const duty = (delta: number): Effect => ({ kind: 'dutyApproval', delta });

const adult = ageYears(18);
const newcomer = cmp('civic.newcomer', 'eq', true);
const believer = cmp('civic.religion', 'ne', 'none');
const serving = cmp('civic.serving', 'eq', true);
const inOffice = cmp('civic.office', 'ne', 'none');
const royal = cmp('civic.duty', 'eq', 'royal');
const titled = isIn('civic.duty', ['royal', 'noble']);
const free = cmp('civic.custody', 'eq', false);

const LAW: EventDefinition[] = [
  define({
    id: 'speeding-ticket',
    category: 'civic',
    when: all(adult, free, employed),
    chancePpm: 4_000,
    cooldownMonths: 36,
    text: decide(
      'A speeding ticket',
      'A notice arrives: a camera recorded your car above the limit.',
      [
        ['pay', 'Pay the fine', 'You paid, and that was the end of it.'],
        ['contest', 'Contest it in court', 'A court date has been set.'],
      ],
    ),
    choices: [
      { id: 'pay', requires: null, effects: [money(-8, 'fines'), stat('stress', 10)] },
      { id: 'contest', requires: null, effects: [legal('traffic', 550)] },
    ],
  }),
  define({
    id: 'neighbour-dispute',
    category: 'civic',
    when: all(adult, free, cmp('home.own', 'eq', true)),
    chancePpm: 2_500,
    cooldownMonths: 60,
    text: decide(
      'A dispute next door',
      'Your neighbour claims your renovation damaged their wall and threatens to sue.',
      [
        ['settle', 'Offer to pay for repairs', 'They accepted, and relations thawed.'],
        ['fight', 'Deny it and let them sue', 'Their lawyer filed a claim against you.'],
      ],
    ),
    choices: [
      { id: 'settle', requires: null, effects: [money(-25, 'legal')] },
      { id: 'fight', requires: null, effects: [legal('civilClaim', 450), stat('stress', 20)] },
    ],
  }),
  define({
    id: 'tax-audit',
    category: 'civic',
    when: all(adult, free, any(employed, cmp('business.count', 'gte', 1))),
    chancePpm: 1_500,
    cooldownMonths: 60,
    effects: [legal('taxAudit', 420), stat('stress', 30)],
    text: auto(
      'A letter from the tax office',
      'The tax authority has selected your returns for a detailed audit.',
      'An auditor will review your affairs over the next few months.',
    ),
  }),
  define({
    id: 'contractor-dispute',
    category: 'civic',
    when: all(adult, free, cmp('property.count', 'gte', 1)),
    chancePpm: 2_000,
    cooldownMonths: 48,
    text: decide(
      'Shoddy work',
      'A builder you paid left the job unfinished and stopped answering calls.',
      [
        ['sue', 'Take them to court', 'You filed a claim to recover your money.'],
        ['drop', 'Write it off', 'You let it go and found someone else.'],
      ],
    ),
    choices: [
      { id: 'sue', requires: null, effects: [legal('civilClaim', 620, 'claimant')] },
      { id: 'drop', requires: null, effects: [money(-15, 'repairs'), stat('stress', 15)] },
    ],
  }),
  define({
    id: 'shop-dare',
    category: 'teen',
    when: all(ageYears(13, 17), free),
    chancePpm: 3_000,
    maxOccurrences: 1,
    text: decide(
      'A dare',
      'Some older kids dare you to walk out of a shop without paying for something.',
      [
        ['refuse', 'Say no and walk away', 'They laughed, but you felt good about it.'],
        ['goAlong', 'Go along with it', 'Your heart was pounding the whole way home.'],
      ],
    ),
    choices: [
      { id: 'refuse', requires: null, effects: [stat('confidence', 25), stat('discipline', 15)] },
      {
        id: 'goAlong',
        requires: null,
        effects: [stat('stress', 30), flag('dare.accepted'), schedule('store-security', 1, 45)],
      },
    ],
  }),
  define({
    id: 'store-security',
    category: 'teen',
    scheduledOnly: true,
    when: ageYears(0),
    effects: [legal('minorOffence', 650), family('parents', -15), stat('reputation', -30)],
    text: auto(
      'Caught on camera',
      'The shop identified you from its cameras and reported it.',
      'Your parents were called, and the matter went to a youth court.',
    ),
  }),
  define({
    id: 'creative-accounting',
    category: 'civic',
    when: all(adult, free, cmp('business.count', 'gte', 1)),
    chancePpm: 2_000,
    maxOccurrences: 2,
    cooldownMonths: 36,
    text: decide(
      'A tempting suggestion',
      'Your bookkeeper hints that some figures could be "rearranged" to cut your tax bill.',
      [
        [
          'refuse',
          'Keep the books straight',
          'You told them firmly to keep everything above board.',
        ],
        ['agree', 'Let them do it', 'The tax bill was smaller this year.'],
      ],
    ),
    choices: [
      { id: 'refuse', requires: null, effects: [stat('discipline', 15)] },
      {
        id: 'agree',
        requires: null,
        effects: [money(20, 'other'), schedule('fraud-investigation', 12, 35)],
      },
    ],
  }),
  define({
    id: 'fraud-investigation',
    category: 'civic',
    scheduledOnly: true,
    when: ageYears(0),
    effects: [legal('fraud', 720), stat('stress', 80), stat('reputation', -60)],
    text: auto(
      'Investigators call',
      'Investigators have found irregularities in your company accounts.',
      'You have been charged, and a court date has been set.',
    ),
  }),
  define({
    id: 'jury-summons',
    category: 'civic',
    when: all(
      ageYears(18, 70),
      free,
      cmp('law.juries', 'eq', true),
      cmp('civic.citizen', 'eq', true),
    ),
    chancePpm: 2_500,
    cooldownMonths: 120,
    text: decide('A jury summons', 'You have been called to serve on a jury or as a lay judge.', [
      ['serve', 'Serve', 'You heard the case carefully and felt you had done your duty.'],
      ['excuse', 'Ask to be excused', 'Your request was accepted.'],
    ]),
    choices: [
      {
        id: 'serve',
        requires: null,
        effects: [stat('reputation', 10), skill('logic', 10), stat('stress', 10)],
      },
      { id: 'excuse', requires: null, effects: [] },
    ],
  }),
];

const HEALTH: EventDefinition[] = [
  define({
    id: 'blood-pressure-check',
    category: 'health',
    when: all(ageYears(40), cmp('stats.stress', 'gte', 500)),
    chancePpm: 2_000,
    maxOccurrences: 1,
    effects: [condition('hypertension')],
    text: auto(
      'A routine check',
      'At a pharmacy check, your blood pressure reading was high.',
      'Your doctor confirmed high blood pressure; treatment can keep it in check.',
    ),
  }),
  define({
    id: 'sports-injury',
    category: 'health',
    when: all(ageYears(12), cmp('habits.exercise', 'gte', 50)),
    chancePpm: 3_000,
    cooldownMonths: 24,
    effects: [condition('injury'), stat('happiness', -20)],
    text: auto(
      'An awkward landing',
      'You twisted your knee badly while exercising.',
      'A doctor says it needs treatment to heal properly.',
    ),
  }),
  define({
    id: 'running-on-empty',
    category: 'health',
    when: all(ageYears(16), cmp('stats.stress', 'gte', 750)),
    chancePpm: 15_000,
    cooldownMonths: 12,
    text: decide(
      'Running on empty',
      'You have felt exhausted and low for weeks, and small things feel overwhelming.',
      [
        ['help', 'Talk to someone', 'Talking it through helped more than you expected.'],
        ['push', 'Push through', 'You kept going, but the feeling lingered.'],
      ],
    ),
    choices: [
      { id: 'help', requires: null, effects: [stat('stress', -80), money(-5, 'medical')] },
      { id: 'push', requires: null, effects: [stat('stress', 20), schedule('low-mood', 2, 50)] },
    ],
  }),
  define({
    id: 'low-mood',
    category: 'health',
    scheduledOnly: true,
    when: ageYears(0),
    effects: [condition('depression')],
    text: auto(
      'A diagnosis',
      'A doctor told you that what you have been feeling is depression.',
      'It is common and treatable; support and treatment are available.',
    ),
  }),
];

const MIGRATION: EventDefinition[] = [
  define({
    id: 'culture-shock',
    category: 'civic',
    when: all(adult, newcomer),
    chancePpm: 60_000,
    maxOccurrences: 1,
    text: decide(
      'A new country',
      'Everything is different: the customs, the paperwork, even how people queue.',
      [
        ['join', 'Join a newcomers’ group', 'You met others finding their feet, and it helped.'],
        ['keep', 'Keep to yourself for now', 'It was lonely at times, but you managed.'],
      ],
    ),
    choices: [
      { id: 'join', requires: null, effects: [need('social', 150), stat('happiness', 30)] },
      { id: 'keep', requires: null, effects: [stat('happiness', -20), stat('stress', 20)] },
    ],
  }),
  define({
    id: 'homesick',
    category: 'civic',
    when: all(adult, newcomer),
    chancePpm: 40_000,
    cooldownMonths: 12,
    text: decide('Homesick', 'You miss home: the food, the language, your family.', [
      ['call', 'Call home', 'Hearing familiar voices lifted your spirits.'],
      ['visit', 'Book a trip home', 'The visit recharged you.'],
    ]),
    choices: [
      { id: 'call', requires: null, effects: [family('parents', 5), stat('happiness', 15)] },
      {
        id: 'visit',
        requires: null,
        effects: [family('parents', 15), stat('happiness', 40), money(-60, 'travel')],
      },
    ],
  }),
  define({
    id: 'language-classes',
    category: 'civic',
    when: all(adult, newcomer),
    chancePpm: 30_000,
    maxOccurrences: 1,
    text: decide('Language classes', 'A local college offers evening classes for newcomers.', [
      ['enrol', 'Enrol', 'Your confidence grew with every lesson.'],
      ['skip', 'Not now', 'Maybe another time.'],
    ]),
    choices: [
      {
        id: 'enrol',
        requires: null,
        effects: [money(-10, 'education'), stat('confidence', 30), skill('socializing', 20)],
      },
      { id: 'skip', requires: null, effects: [] },
    ],
  }),
];

const RELIGION: EventDefinition[] = [
  define({
    id: 'festival-celebration',
    category: 'civic',
    when: all(believer, isIn('civic.participation', ['regular', 'devout'])),
    chancePpm: 25_000,
    cooldownMonths: 12,
    effects: [need('social', 120), stat('happiness', 40)],
    text: auto(
      'A festival',
      'Your community gathered for one of the year’s major celebrations.',
      'Sharing it with others made it special.',
    ),
  }),
  define({
    id: 'questions-of-faith',
    category: 'civic',
    when: all(ageYears(15, 30), believer),
    chancePpm: 4_000,
    maxOccurrences: 1,
    text: decide(
      'Big questions',
      'You find yourself thinking hard about what you believe and why.',
      [
        [
          'explore',
          'Read and talk with others',
          'You came away with a clearer sense of your own views.',
        ],
        ['set', 'Set the questions aside', 'Life got busy and the questions faded for now.'],
      ],
    ),
    choices: [
      { id: 'explore', requires: null, effects: [skill('reading', 15), stat('confidence', 15)] },
      { id: 'set', requires: null, effects: [] },
    ],
  }),
  define({
    id: 'interfaith-invite',
    category: 'civic',
    when: all(adult, cmp('social.friends', 'gte', 2)),
    chancePpm: 4_000,
    cooldownMonths: 60,
    text: decide(
      'An invitation',
      'A friend invites you to a celebration in their faith community.',
      [
        ['go', 'Go along', 'You were warmly welcomed and learned a lot.'],
        ['decline', 'Politely decline', 'Your friend understood.'],
      ],
    ),
    choices: [
      { id: 'go', requires: null, effects: [need('social', 100), stat('happiness', 20)] },
      { id: 'decline', requires: null, effects: [] },
    ],
  }),
];

const MILITARY: EventDefinition[] = [
  define({
    id: 'basic-training',
    category: 'civic',
    when: serving,
    chancePpm: 200_000,
    maxOccurrences: 1,
    effects: [stat('discipline', 40), stat('stress', 40), skill('fitness', 40)],
    text: auto(
      'Basic training',
      'Early mornings, drills and long marches.',
      'You came out fitter and more disciplined.',
    ),
  }),
  define({
    id: 'unit-friendship',
    category: 'civic',
    when: serving,
    chancePpm: 30_000,
    cooldownMonths: 12,
    effects: [need('social', 150), stat('happiness', 25)],
    text: auto(
      'Comrades',
      'You and your unit have been through a lot together.',
      'You formed friendships that may last a lifetime.',
    ),
  }),
  define({
    id: 'field-exercise',
    category: 'civic',
    when: serving,
    chancePpm: 25_000,
    cooldownMonths: 12,
    text: decide('A field exercise', 'Your unit is sent on a long exercise in difficult terrain.', [
      ['lead', 'Volunteer to lead a team', 'Your officers took note of your leadership.'],
      ['follow', 'Keep your head down', 'You got through it without fuss.'],
    ]),
    choices: [
      { id: 'lead', requires: null, effects: [skill('leadership', 40), stat('stress', 30)] },
      { id: 'follow', requires: null, effects: [skill('fitness', 15)] },
    ],
  }),
];

const POLITICS: EventDefinition[] = [
  define({
    id: 'election-day',
    category: 'civic',
    when: all(cmp('civic.voter', 'eq', true), free),
    chancePpm: 12_000,
    cooldownMonths: 30,
    text: decide('Election day', 'Polling stations are open today.', [
      ['vote', 'Go and vote', 'You cast your ballot.'],
      ['skip', 'Stay home', 'You sat this one out.'],
    ]),
    choices: [
      { id: 'vote', requires: null, effects: [flag('voted'), stat('reputation', 2)] },
      { id: 'skip', requires: null, effects: [] },
    ],
  }),
  define({
    id: 'local-campaign',
    category: 'civic',
    when: all(adult, free),
    chancePpm: 3_000,
    cooldownMonths: 60,
    text: decide('A local issue', 'The council plans to close a well-loved local park.', [
      ['organise', 'Organise a petition', 'Hundreds signed, and the council paused its plans.'],
      ['ignore', 'Leave it to others', 'The park closed a few months later.'],
    ]),
    choices: [
      {
        id: 'organise',
        requires: null,
        effects: [stat('reputation', 30), skill('leadership', 20), flag('activist')],
      },
      { id: 'ignore', requires: null, effects: [] },
    ],
  }),
  define({
    id: 'budget-vote',
    category: 'civic',
    when: all(inOffice, not(cmp('civic.office', 'eq', 'local'))),
    chancePpm: 60_000,
    cooldownMonths: 9,
    text: decide(
      'The budget',
      'A difficult budget is coming. You must decide what you will support.',
      [
        ['spend', 'Invest in public services', 'Popular now, though economists warn about prices.'],
        ['cut', 'Cut spending to balance the books', 'Markets approved; many voters did not.'],
        ['balance', 'Push for a compromise', 'Nobody got everything, but the budget passed.'],
      ],
    ),
    choices: [
      { id: 'spend', requires: null, effects: [policy('budget', 40, 15, 25)] },
      { id: 'cut', requires: null, effects: [policy('budget', -40, -15, -20)] },
      { id: 'balance', requires: null, effects: [policy('budget', 10)] },
    ],
  }),
  define({
    id: 'town-hall',
    category: 'civic',
    when: cmp('civic.office', 'eq', 'local'),
    chancePpm: 60_000,
    cooldownMonths: 6,
    text: decide('A town hall meeting', 'Residents are angry about potholes and late buses.', [
      ['listen', 'Listen and promise action', 'People appreciated being heard.'],
      ['defend', 'Defend the council’s record', 'The meeting turned frosty.'],
    ]),
    choices: [
      { id: 'listen', requires: null, effects: [policy('localServices', 30), stat('stress', 15)] },
      { id: 'defend', requires: null, effects: [policy('localServices', -25)] },
    ],
  }),
  define({
    id: 'colleague-scandal',
    category: 'civic',
    when: inOffice,
    chancePpm: 20_000,
    cooldownMonths: 24,
    text: decide('A scandal', 'A close political colleague is accused of misusing public money.', [
      ['distance', 'Call for an inquiry', 'Voters saw you as principled.'],
      ['defend', 'Defend them', 'Your loyalty was noticed, not always kindly.'],
    ]),
    choices: [
      { id: 'distance', requires: null, effects: [policy('integrity', 30)] },
      { id: 'defend', requires: null, effects: [policy('integrity', -50), stat('stress', 20)] },
    ],
  }),
  define({
    id: 'campaign-interview',
    category: 'civic',
    when: cmp('civic.candidate', 'eq', true),
    chancePpm: 80_000,
    cooldownMonths: 4,
    text: decide(
      'A tough interview',
      'A well-known journalist presses you hard on live television.',
      [
        ['calm', 'Stay calm and stick to facts', 'Viewers found you steady and credible.'],
        ['attack', 'Turn it back on the journalist', 'The clip went viral, for better and worse.'],
      ],
    ),
    choices: [
      { id: 'calm', requires: null, effects: [stat('reputation', 20), stat('confidence', 15)] },
      { id: 'attack', requires: null, effects: [stat('reputation', -10), stat('confidence', 25)] },
    ],
  }),
];

const ROYAL: EventDefinition[] = [
  define({
    id: 'state-banquet',
    category: 'civic',
    when: royal,
    chancePpm: 40_000,
    cooldownMonths: 12,
    text: decide('A state banquet', 'A visiting head of state is guest of honour at a banquet.', [
      ['attend', 'Attend', 'You represented the family with grace.'],
      ['decline', 'Send apologies', 'Your absence was noticed by the press.'],
    ]),
    choices: [
      { id: 'attend', requires: null, effects: [duty(30), stat('stress', 15)] },
      { id: 'decline', requires: null, effects: [duty(-40)] },
    ],
  }),
  define({
    id: 'charity-gala',
    category: 'civic',
    when: titled,
    chancePpm: 30_000,
    cooldownMonths: 12,
    text: decide('A charity gala', 'A charity asks you to host its annual fundraising gala.', [
      ['host', 'Host it', 'The evening raised a record sum.'],
      ['decline', 'Decline', 'They found another host.'],
    ]),
    choices: [
      { id: 'host', requires: null, effects: [duty(25), need('social', 80)] },
      { id: 'decline', requires: null, effects: [duty(-10)] },
    ],
  }),
  define({
    id: 'press-intrusion',
    category: 'civic',
    when: royal,
    chancePpm: 20_000,
    cooldownMonths: 24,
    text: decide('Unwanted attention', 'Photographers followed you on a private holiday.', [
      ['statement', 'Issue a calm statement', 'Public sympathy was on your side.'],
      ['ignore', 'Say nothing', 'The story ran for a week and faded.'],
    ]),
    choices: [
      { id: 'statement', requires: null, effects: [duty(10), stat('stress', 20)] },
      { id: 'ignore', requires: null, effects: [stat('stress', 30)] },
    ],
  }),
];

export const CIVIC_EVENTS: EventDefinition[] = [
  ...LAW,
  ...HEALTH,
  ...MIGRATION,
  ...RELIGION,
  ...MILITARY,
  ...POLITICS,
  ...ROYAL,
];
