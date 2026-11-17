import type { Effect, EventDefinition, Predicate } from '../../events/schema';

/**
 * Built-in event content, "core" pack. Childhood and early-life events for Milestones 1-2,
 * plus a few adult events so long simulations stay eventful. More arrive in later milestones
 * (target: 400+ events, decision D8).
 *
 * Writing rules: non-graphic, no instructions for harmful acts, neutral tone.
 */

type EventInput = Partial<EventDefinition> &
  Pick<EventDefinition, 'id' | 'category' | 'when' | 'text'>;

function define(input: EventInput): EventDefinition {
  return {
    version: 1,
    scheduledOnly: false,
    chancePpm: 0,
    multipliers: [],
    cooldownMonths: 0,
    maxOccurrences: null,
    exclusiveGroup: null,
    effects: [],
    choices: [],
    ...input,
  };
}

const cmp = (
  fact: string,
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte',
  value: string | number | boolean,
): Predicate => ({ kind: 'cmp', fact, op, value });
const all = (...of: Predicate[]): Predicate => ({ kind: 'all', of });
const any = (...of: Predicate[]): Predicate => ({ kind: 'any', of });
const ageYears = (min: number, max?: number): Predicate =>
  max === undefined
    ? cmp('age.years', 'gte', min)
    : all(cmp('age.years', 'gte', min), cmp('age.years', 'lte', max));
const ageMonths = (min: number, max: number): Predicate =>
  all(cmp('age.totalMonths', 'gte', min), cmp('age.totalMonths', 'lte', max));

const stat = (key: Extract<Effect, { kind: 'stat' }>['key'], delta: number): Effect => ({
  kind: 'stat',
  key,
  delta,
});
const need = (key: Extract<Effect, { kind: 'need' }>['key'], delta: number): Effect => ({
  kind: 'need',
  key,
  delta,
});
const skill = (key: Extract<Effect, { kind: 'skill' }>['key'], delta: number): Effect => ({
  kind: 'skill',
  key,
  delta,
});
const habit = (key: Extract<Effect, { kind: 'habit' }>['key'], delta: number): Effect => ({
  kind: 'habit',
  key,
  delta,
});
const parents = (closeness: number): Effect => ({
  kind: 'relationship',
  with: 'parents',
  closeness,
});
const flag = (name: string): Effect => ({ kind: 'flag', flag: name, value: true });
const schedule = (eventId: string, inMonths: number, chancePercent = 100): Effect => ({
  kind: 'schedule',
  eventId,
  inMonths,
  chancePercent,
});

export const CORE_EVENTS: EventDefinition[] = [
  define({
    id: 'first-words',
    category: 'childhood',
    when: ageMonths(9, 20),
    chancePpm: 200_000,
    maxOccurrences: 1,
    exclusiveGroup: 'baby-milestone',
    effects: [stat('confidence', 20), stat('happiness', 20)],
    text: {
      en: {
        title: 'First words',
        body: 'Your family had been waiting for this. Today you said your first word, and now everyone wants to hear it again.',
        choices: {},
        outcomes: { default: 'You said your first word.' },
      },
    },
  }),
  define({
    id: 'first-steps',
    category: 'childhood',
    when: ageMonths(10, 18),
    chancePpm: 250_000,
    maxOccurrences: 1,
    exclusiveGroup: 'baby-milestone',
    effects: [stat('confidence', 30), stat('health', 10)],
    text: {
      en: {
        title: 'First steps',
        body: 'You let go of the sofa and took three wobbly steps across the room before sitting down with a surprised look.',
        choices: {},
        outcomes: { default: 'You took your first steps.' },
      },
    },
  }),
  define({
    id: 'childhood-cold',
    category: 'health',
    when: ageYears(1, 12),
    chancePpm: 15_000,
    cooldownMonths: 12,
    effects: [stat('health', -40), stat('stress', 20), need('rest', -100)],
    text: {
      en: {
        title: 'A winter cold',
        body: 'A cold went around and found you. A few days of soup, blankets and early nights, and you were on the mend.',
        choices: {},
        outcomes: { default: 'You caught a cold and recovered.' },
      },
    },
  }),
  define({
    id: 'birthday-gifts',
    category: 'family',
    when: all(cmp('isBirthMonth', 'eq', true), ageYears(2, 12)),
    chancePpm: 400_000,
    multipliers: [
      {
        when: { kind: 'in', fact: 'wealth', values: ['wealthy', 'very-wealthy', 'royal'] },
        percent: 180,
      },
    ],
    cooldownMonths: 11,
    effects: [stat('happiness', 40), parents(2)],
    text: {
      en: {
        title: 'Birthday surprises',
        body: 'Relatives sent small presents and cards for your birthday. You insisted on opening every single one yourself.',
        choices: {},
        outcomes: { default: 'Relatives sent birthday presents.' },
      },
    },
  }),
  define({
    id: 'bedtime-story',
    category: 'childhood',
    when: ageYears(3, 6),
    chancePpm: 40_000,
    cooldownMonths: 18,
    choices: [
      {
        id: 'story',
        requires: null,
        effects: [stat('intelligence', 20), skill('reading', 30), parents(4)],
      },
      { id: 'cartoons', requires: null, effects: [stat('happiness', 30), need('leisure', 100)] },
    ],
    text: {
      en: {
        title: 'Story or cartoons?',
        body: 'It is almost bedtime. Your parent offers to read a story together, or you could watch one more cartoon.',
        choices: { story: 'Read a story together', cartoons: 'One more cartoon' },
        outcomes: {
          story: 'You read a story together and asked a dozen questions about it.',
          cartoons: 'You watched one more cartoon and fell asleep happy.',
        },
      },
    },
  }),
  define({
    id: 'playground-dispute',
    category: 'childhood',
    when: ageYears(4, 9),
    chancePpm: 30_000,
    cooldownMonths: 24,
    exclusiveGroup: 'peer-conflict',
    choices: [
      { id: 'share', requires: null, effects: [stat('socialSkill', 30), stat('happiness', -10)] },
      {
        id: 'stand-firm',
        requires: null,
        effects: [stat('confidence', 30), stat('socialSkill', -10)],
      },
      {
        id: 'ask-adult',
        requires: null,
        effects: [stat('discipline', 20), stat('confidence', -10)],
      },
    ],
    text: {
      en: {
        title: 'Trouble at the playground',
        body: 'Another child grabbed the toy you were playing with and will not give it back.',
        choices: {
          share: 'Suggest taking turns',
          'stand-firm': 'Insist it is your turn',
          'ask-adult': 'Ask a grown-up to help',
        },
        outcomes: {
          share: 'You took turns. It was fair, if a little frustrating.',
          'stand-firm': 'You stood your ground and got the toy back.',
          'ask-adult': 'A grown-up helped you both sort it out.',
        },
      },
    },
  }),
  define({
    id: 'curious-question',
    category: 'childhood',
    when: ageYears(5, 12),
    chancePpm: 25_000,
    cooldownMonths: 24,
    choices: [
      { id: 'books', requires: null, effects: [stat('intelligence', 25), skill('reading', 20)] },
      { id: 'tinker', requires: null, effects: [skill('logic', 40), stat('creativity', 15)] },
      { id: 'forget', requires: null, effects: [stat('happiness', 10)] },
    ],
    text: {
      en: {
        title: 'How does it work?',
        body: 'You cannot stop wondering how the old radio in the cupboard makes sound.',
        choices: {
          books: 'Look it up in a book',
          tinker: 'Open it up (with permission) and look inside',
          forget: 'Go and play instead',
        },
        outcomes: {
          books: 'You found a book about sound and read it twice.',
          tinker: 'You carefully took it apart and learned how the pieces fit.',
          forget: 'You went to play. The radio could wait.',
        },
      },
    },
  }),
  define({
    id: 'hobby-spark',
    category: 'personal',
    when: ageYears(6, 16),
    chancePpm: 20_000,
    cooldownMonths: 36,
    maxOccurrences: 2,
    choices: [
      {
        id: 'music',
        requires: null,
        effects: [skill('music', 60), habit('creativePractice', 10), flag('hobby.music')],
      },
      {
        id: 'art',
        requires: null,
        effects: [skill('art', 60), habit('creativePractice', 10), flag('hobby.art')],
      },
      {
        id: 'sport',
        requires: null,
        effects: [skill('fitness', 60), habit('exercise', 10), flag('hobby.sport')],
      },
    ],
    text: {
      en: {
        title: 'Something new to try',
        body: 'A community centre nearby is running free taster sessions this month. You can only fit one in.',
        choices: { music: 'Music', art: 'Art and drawing', sport: 'Sport' },
        outcomes: {
          music: 'You loved the music session and want to keep going.',
          art: 'You spent the art session lost in your drawing.',
          sport: 'You came home tired, muddy and happy from sport.',
        },
      },
    },
  }),
  define({
    id: 'neighbour-invite',
    category: 'childhood',
    when: ageYears(5, 13),
    chancePpm: 25_000,
    cooldownMonths: 18,
    choices: [
      {
        id: 'accept',
        requires: null,
        effects: [need('social', 150), stat('socialSkill', 30), flag('friend.neighbour')],
      },
      { id: 'decline', requires: null, effects: [need('leisure', 50), stat('happiness', -5)] },
    ],
    text: {
      en: {
        title: 'An invitation',
        body: 'A kid from down the street knocks and asks if you want to come and play.',
        choices: { accept: 'Go and play', decline: 'Stay home today' },
        outcomes: {
          accept: 'You spent the afternoon playing and made a new friend.',
          decline: 'You stayed home and had a quiet afternoon.',
        },
      },
    },
  }),
  define({
    id: 'lost-wallet',
    category: 'personal',
    when: ageYears(8, 17),
    chancePpm: 8_000,
    maxOccurrences: 1,
    choices: [
      {
        id: 'return',
        requires: null,
        effects: [stat('reputation', 40), stat('happiness', 20), schedule('wallet-thanks', 2)],
      },
      {
        id: 'keep',
        requires: null,
        effects: [stat('discipline', -30), stat('stress', 40), schedule('wallet-guilt', 3, 60)],
      },
    ],
    text: {
      en: {
        title: 'A wallet on the pavement',
        body: 'You find a wallet on the way home. There is some cash inside and a card with a name and address.',
        choices: { return: 'Take it to the address on the card', keep: 'Keep it and say nothing' },
        outcomes: {
          return: 'You returned the wallet. The owner was very grateful.',
          keep: 'You kept the wallet. It does not feel as good as you expected.',
        },
      },
    },
  }),
  define({
    id: 'wallet-thanks',
    category: 'personal',
    scheduledOnly: true,
    when: { kind: 'all', of: [] },
    effects: [stat('confidence', 30), stat('reputation', 30)],
    text: {
      en: {
        title: 'A thank-you note',
        body: 'The owner of the wallet you returned sent a card thanking you. Your family put it on the fridge.',
        choices: {},
        outcomes: { default: 'The wallet owner thanked you.' },
      },
    },
  }),
  define({
    id: 'wallet-guilt',
    category: 'personal',
    scheduledOnly: true,
    when: { kind: 'all', of: [] },
    choices: [
      {
        id: 'confess',
        requires: null,
        effects: [stat('stress', -60), stat('reputation', -20), stat('discipline', 30)],
      },
      { id: 'stay-silent', requires: null, effects: [stat('stress', 50)] },
    ],
    text: {
      en: {
        title: 'It is still on your mind',
        body: 'You keep thinking about the wallet you kept. Someone at home asks why you have been so quiet.',
        choices: { confess: 'Tell them what happened', 'stay-silent': 'Say it is nothing' },
        outcomes: {
          confess: 'You told the truth. It was hard, but you feel lighter.',
          'stay-silent': 'You kept it to yourself, and the worry stayed too.',
        },
      },
    },
  }),
  define({
    id: 'late-night-screen',
    category: 'teen',
    when: ageYears(12, 17),
    chancePpm: 30_000,
    cooldownMonths: 12,
    choices: [
      {
        id: 'sleep',
        requires: null,
        effects: [need('rest', 150), stat('energy', 50), habit('sleepRoutine', 5)],
      },
      {
        id: 'stay-up',
        requires: null,
        effects: [
          stat('happiness', 20),
          need('rest', -150),
          stat('stress', 20),
          habit('sleepRoutine', -5),
        ],
      },
    ],
    text: {
      en: {
        title: 'Just one more episode',
        body: 'It is past midnight and the next episode is already loading.',
        choices: { sleep: 'Switch off and sleep', 'stay-up': 'Keep watching' },
        outcomes: {
          sleep: 'You went to sleep and woke up rested.',
          'stay-up': 'You finished the season. Morning came very early.',
        },
      },
    },
  }),
  define({
    id: 'peer-dare',
    category: 'teen',
    when: ageYears(13, 17),
    chancePpm: 15_000,
    cooldownMonths: 24,
    exclusiveGroup: 'peer-conflict',
    choices: [
      {
        id: 'go-along',
        requires: null,
        effects: [stat('confidence', 20), parents(-6), stat('reputation', -10)],
      },
      { id: 'refuse', requires: null, effects: [stat('discipline', 30), stat('confidence', 10)] },
    ],
    text: {
      en: {
        title: 'Skip the family dinner?',
        body: 'Your friends want you to skip a family dinner and hang out with them instead.',
        choices: { 'go-along': 'Go with your friends', refuse: 'Go to the family dinner' },
        outcomes: {
          'go-along': 'You had fun, but your family was hurt that you did not come.',
          refuse: 'You went to dinner. Your friends caught up with you later.',
        },
      },
    },
  }),
  define({
    id: 'parent-pride',
    category: 'family',
    when: all(
      ageYears(4, 17),
      any(
        cmp('skills.reading', 'gte', 250),
        cmp('skills.logic', 'gte', 250),
        cmp('skills.fitness', 'gte', 250),
        cmp('skills.music', 'gte', 250),
        cmp('skills.art', 'gte', 250),
      ),
    ),
    chancePpm: 30_000,
    cooldownMonths: 24,
    effects: [stat('confidence', 30), parents(5)],
    text: {
      en: {
        title: 'Proud parents',
        body: 'Your family noticed how much you have been practising and told you how proud they are.',
        choices: {},
        outcomes: { default: 'Your family told you they are proud of you.' },
      },
    },
  }),
  define({
    id: 'health-checkup',
    category: 'health',
    when: ageYears(25),
    chancePpm: 15_000,
    cooldownMonths: 24,
    choices: [
      { id: 'go', requires: null, effects: [stat('health', 30), stat('stress', -20)] },
      { id: 'skip', requires: null, effects: [schedule('health-scare', 6, 40)] },
    ],
    text: {
      en: {
        title: 'Time for a check-up',
        body: 'A reminder arrives: you are due for a routine health check-up.',
        choices: { go: 'Book the appointment', skip: 'Put it off' },
        outcomes: {
          go: 'The check-up went well, and you got some useful advice.',
          skip: 'You put it off for now.',
        },
      },
    },
  }),
  define({
    id: 'health-scare',
    category: 'health',
    scheduledOnly: true,
    when: { kind: 'all', of: [] },
    effects: [stat('health', -80), stat('stress', 80)],
    text: {
      en: {
        title: 'A health worry',
        body: 'A problem that a check-up might have caught early has caught up with you. Treatment and rest will help, but it is a worrying time.',
        choices: {},
        outcomes: { default: 'You had a health scare.' },
      },
    },
  }),
  define({
    id: 'burnout-warning',
    category: 'health',
    when: all(ageYears(16), cmp('stats.stress', 'gte', 700)),
    chancePpm: 150_000,
    cooldownMonths: 6,
    choices: [
      {
        id: 'rest',
        requires: null,
        effects: [stat('stress', -200), stat('happiness', 30), need('leisure', 200)],
      },
      {
        id: 'push',
        requires: null,
        effects: [stat('discipline', 30), stat('health', -40), stat('stress', 40)],
      },
    ],
    text: {
      en: {
        title: 'Running on empty',
        body: 'You have been under a lot of pressure and you can feel it: poor sleep, short temper, no energy.',
        choices: { rest: 'Take a proper break', push: 'Push through it' },
        outcomes: {
          rest: 'You took time off and came back feeling human again.',
          push: 'You kept going, but it is taking a toll.',
        },
      },
    },
  }),
  define({
    id: 'creative-spark',
    category: 'personal',
    when: all(ageYears(12), cmp('stats.creativity', 'gte', 600)),
    chancePpm: 20_000,
    cooldownMonths: 24,
    choices: [
      {
        id: 'start',
        requires: null,
        effects: [stat('creativity', 40), skill('art', 40), habit('creativePractice', 10)],
      },
      { id: 'let-pass', requires: null, effects: [] },
    ],
    text: {
      en: {
        title: 'An idea that will not leave you alone',
        body: 'An idea for a creative project keeps coming back to you, day after day.',
        choices: { start: 'Start the project', 'let-pass': 'Let the idea go' },
        outcomes: {
          start: 'You started the project and lost track of time.',
          'let-pass': 'You let the idea go. Maybe another time.',
        },
      },
    },
  }),
  define({
    id: 'old-friend-call',
    category: 'personal',
    when: ageYears(25),
    chancePpm: 10_000,
    cooldownMonths: 24,
    effects: [stat('happiness', 40), need('social', 150)],
    text: {
      en: {
        title: 'A call from an old friend',
        body: 'An old friend called out of the blue. You talked for two hours as if no time had passed.',
        choices: {},
        outcomes: { default: 'An old friend called to catch up.' },
      },
    },
  }),
  define({
    id: 'quiet-reflection',
    category: 'personal',
    when: ageYears(18),
    chancePpm: 10_000,
    cooldownMonths: 36,
    choices: [
      { id: 'journal', requires: null, effects: [stat('discipline', 20), stat('stress', -30)] },
      { id: 'walk', requires: null, effects: [stat('health', 20), stat('stress', -20)] },
    ],
    text: {
      en: {
        title: 'A quiet evening',
        body: 'For once you have an evening with nothing planned.',
        choices: { journal: 'Write in a journal', walk: 'Go for a long walk' },
        outcomes: {
          journal: 'You wrote down what has been on your mind and felt clearer.',
          walk: 'You walked until the streetlights came on.',
        },
      },
    },
  }),
];
