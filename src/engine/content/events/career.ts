import type { EventDefinition } from '../../events/schema';
import {
  all,
  bond,
  cmp,
  decide,
  define,
  employed,
  isIn,
  money,
  performance,
  skill,
  stat,
  subject,
  theyRemember,
  youRemember,
} from './dsl';

/**
 * Career decisions (gameplay expansion, feature 6): workplace conflicts, unexpected
 * opportunities and moments specific to teaching, medicine and performing. Fictional and
 * non-graphic; no claim to real-world professional accuracy.
 */
export const CAREER_EVENTS: readonly EventDefinition[] = [
  define({
    id: 'work-credit-taken',
    category: 'work',
    when: employed,
    subject: subject('colleague'),
    chancePpm: 8_000,
    cooldownMonths: 24,
    text: decide(
      'Who did the work?',
      'In a team meeting, {subject} presents your work as their own.',
      [
        [
          'confront',
          'Speak up, politely',
          'You set the record straight. {subject} was not pleased, but your manager noticed.',
        ],
        ['letGo', 'Let it go', 'You kept the peace, but it still stings.'],
        [
          'manager',
          'Tell your manager later',
          'Your manager thanked you for raising it and will keep an eye on things.',
        ],
      ],
    ),
    choices: [
      {
        id: 'confront',
        requires: null,
        effects: [performance(30), bond(-5, -5, 5, 15), stat('confidence', 30), stat('stress', 20)],
      },
      {
        id: 'letGo',
        requires: null,
        effects: [stat('stress', 40), youRemember('tookCredit', -40, 50)],
      },
      {
        id: 'manager',
        requires: null,
        effects: [performance(20), bond(-3, -5, 0, 10), theyRemember('reportedMe', -30, 40)],
      },
    ],
  }),
  define({
    id: 'work-lead-project',
    category: 'work',
    when: all(employed, cmp('job.performance', 'gte', 600)),
    chancePpm: 10_000,
    cooldownMonths: 18,
    text: decide(
      'A big opportunity',
      'Your manager asks whether you would like to lead an important new project.',
      [
        ['accept', 'Take it on', 'You led the project. It was hard work, and people noticed.'],
        ['decline', 'Not right now', 'You kept your current workload. Maybe next time.'],
      ],
    ),
    choices: [
      {
        id: 'accept',
        requires: null,
        effects: [
          performance(80),
          skill('leadership', 40),
          stat('stress', 60),
          stat('confidence', 30),
        ],
      },
      { id: 'decline', requires: null, effects: [stat('stress', -20)] },
    ],
  }),
  define({
    id: 'work-disagreement',
    category: 'work',
    when: employed,
    subject: subject('colleague'),
    chancePpm: 9_000,
    cooldownMonths: 18,
    text: decide(
      'A disagreement at work',
      'You and {subject} strongly disagree about how to do a task.',
      [
        ['compromise', 'Find a middle way', 'You met in the middle. The work got done.'],
        ['standFirm', 'Stand your ground', 'You got your way, but {subject} is annoyed with you.'],
        [
          'giveIn',
          'Do it their way',
          'You went along with {subject}. It worked out, more or less.',
        ],
      ],
    ),
    choices: [
      { id: 'compromise', requires: null, effects: [bond(3, 3, 3, -5), skill('socializing', 15)] },
      { id: 'standFirm', requires: null, effects: [performance(15), bond(-4, 0, 2, 20)] },
      { id: 'giveIn', requires: null, effects: [bond(2, 0, -2, -5), stat('confidence', -15)] },
    ],
  }),
  define({
    id: 'teaching-restless-class',
    category: 'work',
    when: all(employed, isIn('job.industry', ['education'])),
    chancePpm: 25_000,
    cooldownMonths: 9,
    text: decide(
      'A restless class',
      'One of your classes has been impossible to settle this week.',
      [
        [
          'creative',
          'Turn the lesson into a game',
          'The class loved it, and they learned more than you expected.',
        ],
        [
          'strict',
          'Set firm rules',
          'The room went quiet. Order restored, if not much enthusiasm.',
        ],
        [
          'talk',
          'Talk to the class about what is going on',
          'It turned out exams were worrying them. Things calmed down.',
        ],
      ],
    ),
    choices: [
      {
        id: 'creative',
        requires: null,
        effects: [performance(40), stat('creativity', 20), stat('energy', -60)],
      },
      { id: 'strict', requires: null, effects: [performance(20), stat('stress', 20)] },
      {
        id: 'talk',
        requires: null,
        effects: [performance(25), skill('care', 25), stat('happiness', 20)],
      },
    ],
  }),
  define({
    id: 'medicine-cover-night',
    category: 'work',
    when: all(employed, isIn('job.industry', ['healthcare'])),
    subject: subject('colleague'),
    chancePpm: 25_000,
    cooldownMonths: 6,
    text: decide(
      'Can you cover tonight?',
      '{subject} has a family emergency and asks you to cover their night shift.',
      [
        ['cover', 'Cover the shift', 'A long night, but {subject} is very grateful.'],
        ['decline', 'You need to rest', 'You said no. {subject} found someone else.'],
      ],
    ),
    choices: [
      {
        id: 'cover',
        requires: null,
        effects: [
          money(8, 'overtime'),
          performance(20),
          bond(8, 6, 4),
          theyRemember('coveredForMe', 50, 50),
          stat('energy', -150),
          stat('stress', 40),
        ],
      },
      { id: 'decline', requires: null, effects: [stat('energy', 50), bond(-2)] },
    ],
  }),
  define({
    id: 'medicine-difficult-call',
    category: 'work',
    when: all(employed, isIn('job.industry', ['healthcare'])),
    chancePpm: 18_000,
    cooldownMonths: 12,
    text: decide(
      'A difficult call',
      'A fictional case on your ward does not fit the usual pattern. The team is unsure.',
      [
        [
          'consult',
          'Ask a senior colleague',
          'Together you worked it out. You learned a great deal.',
        ],
        [
          'research',
          'Read up on it overnight',
          'Your research paid off, though you are exhausted.',
        ],
      ],
    ),
    choices: [
      {
        id: 'consult',
        requires: null,
        effects: [performance(25), skill('science', 30), skill('socializing', 10)],
      },
      {
        id: 'research',
        requires: null,
        effects: [performance(40), skill('science', 40), stat('energy', -120)],
      },
    ],
  }),
  define({
    id: 'performing-lead-role',
    category: 'work',
    when: all(employed, isIn('job.industry', ['arts', 'media'])),
    chancePpm: 20_000,
    cooldownMonths: 12,
    text: decide(
      'A lead role',
      'A casting director invites you to read for a lead role in a new production.',
      [
        ['prepare', 'Prepare intensively', 'You gave a reading people are still talking about.'],
        ['casual', 'Go in relaxed', 'A decent reading. They will let you know.'],
        ['skip', 'Turn it down', 'You stayed with your current work.'],
      ],
    ),
    choices: [
      {
        id: 'prepare',
        requires: null,
        effects: [performance(60), stat('reputation', 40), stat('stress', 50)],
      },
      { id: 'casual', requires: null, effects: [performance(20), stat('confidence', 10)] },
      { id: 'skip', requires: null, effects: [] },
    ],
  }),
  define({
    id: 'work-headhunted',
    category: 'work',
    when: all(employed, cmp('job.performance', 'gte', 750)),
    chancePpm: 6_000,
    cooldownMonths: 36,
    text: decide(
      'Someone wants to hire you',
      'A recruiter says another employer is impressed by your work and would pay well.',
      [
        [
          'leverage',
          'Mention it to your manager',
          'Your manager does not want to lose you, and it shows.',
        ],
        ['ignore', 'Stay put and say nothing', 'You are happy where you are, for now.'],
      ],
    ),
    choices: [
      { id: 'leverage', requires: null, effects: [performance(20), stat('confidence', 40)] },
      { id: 'ignore', requires: null, effects: [stat('happiness', 10)] },
    ],
  }),
];
