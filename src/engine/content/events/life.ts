import type { EventDefinition } from '../../events/schema';
import {
  ageYears,
  all,
  any,
  atSchool,
  auto,
  befriend,
  bond,
  cmp,
  decide,
  define,
  employed,
  family,
  flag,
  grade,
  isIn,
  medical,
  money,
  need,
  not,
  partnered,
  performance,
  schedule,
  skill,
  stat,
  studying,
  subject,
  theyRemember,
  youRemember,
} from './dsl';

/**
 * Milestone 3-4 content: school, friendships, family, romance (adults only, non-explicit),
 * work and money. Several choices create memories that make other events eligible years
 * later (spec §4 Butterfly effects): standing up for a classmate can lead to a job
 * referral; being there for a friend can bring help when you are struggling.
 */

const SCHOOL: EventDefinition[] = [
  define({
    id: 'first-school-day',
    category: 'school',
    when: all(cmp('school.stage', 'eq', 'primary'), ageYears(4, 8)),
    subject: subject('classmate'),
    chancePpm: 600_000,
    maxOccurrences: 1,
    text: decide(
      'First day of school',
      'A new classroom full of faces. {subject} is sitting next to you and looks just as nervous.',
      [
        [
          'hello',
          'Say hello',
          'You and {subject} spent the day together and laughed at the same things.',
        ],
        [
          'teacher',
          'Stay close to the teacher',
          'You felt safer near the teacher, and the day went smoothly.',
        ],
      ],
    ),
    choices: [
      {
        id: 'hello',
        requires: null,
        effects: [bond(12, 5), theyRemember('firstFriend', 40, 50), stat('confidence', 20)],
      },
      { id: 'teacher', requires: null, effects: [stat('discipline', 10), stat('confidence', -10)] },
    ],
  }),
  define({
    id: 'playground-teasing',
    category: 'school',
    when: all(ageYears(7, 13), isIn('school.stage', ['primary', 'lowerSecondary'])),
    subject: subject('classmate'),
    chancePpm: 15_000,
    maxOccurrences: 1,
    text: decide(
      'Trouble at break time',
      'A group is teasing {subject} in the playground. Nobody else is stepping in.',
      [
        [
          'standUp',
          'Stand up for them',
          'You told the group to stop. {subject} looked at you as if you had changed everything.',
        ],
        [
          'teacher',
          'Fetch a teacher',
          'A teacher came and broke it up. {subject} thanked you quietly afterwards.',
        ],
        ['walkAway', 'Walk away', "You kept out of it, but you saw the look on {subject}'s face."],
      ],
    ),
    choices: [
      {
        id: 'standUp',
        requires: null,
        effects: [
          theyRemember('stoodUpForMe', 80, 90, 'permanent'),
          bond(15, 15, 10),
          stat('confidence', 30),
          stat('stress', 20),
        ],
      },
      {
        id: 'teacher',
        requires: null,
        effects: [theyRemember('gotHelp', 50, 60), bond(8, 8), stat('discipline', 10)],
      },
      {
        id: 'walkAway',
        requires: null,
        effects: [
          theyRemember('leftAlone', -30, 60, 'permanent'),
          youRemember('lookedAway', -20, 40),
          stat('stress', 10),
        ],
      },
    ],
  }),
  define({
    id: 'class-project',
    category: 'school',
    when: all(ageYears(9, 18), atSchool),
    subject: subject('classmate'),
    chancePpm: 20_000,
    cooldownMonths: 18,
    text: decide(
      'Group project',
      'Your teacher pairs you with {subject} for a big project worth a lot of marks.',
      [
        [
          'lead',
          'Take the lead',
          'You organised everything. The project went well, though {subject} felt a little sidelined.',
        ],
        ['share', 'Split the work fairly', 'You and {subject} made a good team.'],
        [
          'coast',
          'Let {subject} do most of it',
          'The project got done, but {subject} noticed who did the work.',
        ],
      ],
    ),
    choices: [
      { id: 'lead', requires: null, effects: [skill('leadership', 20), grade(25), bond(-2, 0, 5)] },
      {
        id: 'share',
        requires: null,
        effects: [grade(15), bond(10, 5), theyRemember('goodTeammate', 30, 40, 'fast')],
      },
      {
        id: 'coast',
        requires: null,
        effects: [grade(-10), stat('stress', -10), theyRemember('didNothing', -30, 40, 'fast')],
      },
    ],
  }),
  define({
    id: 'test-answers',
    category: 'school',
    when: all(ageYears(13, 18), isIn('school.stage', ['lowerSecondary', 'upperSecondary'])),
    subject: subject('classmate'),
    chancePpm: 8_000,
    cooldownMonths: 24,
    maxOccurrences: 2,
    text: decide(
      'An offer before the test',
      "{subject} says they have the answers to tomorrow's test and offers to share them.",
      [
        [
          'refuse',
          'Say no and revise instead',
          'You revised late into the evening and felt good about doing it properly.',
        ],
        ['take', 'Take the answers', 'The test felt easy. Too easy.'],
      ],
    ),
    choices: [
      { id: 'refuse', requires: null, effects: [stat('discipline', 20), grade(5)] },
      {
        id: 'take',
        requires: null,
        effects: [
          grade(40),
          stat('stress', 30),
          flag('school.cheated'),
          schedule('test-answers-found', 2, 35),
        ],
      },
    ],
  }),
  define({
    id: 'test-answers-found',
    category: 'school',
    scheduledOnly: true,
    when: ageYears(0),
    effects: [grade(-100), stat('reputation', -60), stat('stress', 80), family('parents', -10)],
    text: auto(
      'Found out',
      'The school discovered that answers to the test had been shared.',
      'Your result was cancelled and your parents were called in. It was a hard lesson.',
    ),
  }),
  define({
    id: 'teacher-believes',
    category: 'school',
    when: all(ageYears(8, 25), cmp('school.grade', 'gte', 550)),
    subject: subject('teacher'),
    chancePpm: 15_000,
    cooldownMonths: 24,
    effects: [
      stat('confidence', 40),
      stat('discipline', 15),
      bond(6, 4, 10),
      youRemember('believedInMe', 50, 60, 'slow'),
    ],
    text: auto(
      'A word from your teacher',
      '{subject} keeps you back after class.',
      '{subject} told you that you have real potential. You will remember it.',
    ),
  }),
  define({
    id: 'school-trip',
    category: 'school',
    when: all(ageYears(7, 17), atSchool),
    chancePpm: 12_000,
    cooldownMonths: 24,
    text: decide(
      'School trip',
      'Your class is going on a trip. There is a fee for the coach and tickets.',
      [
        ['go', 'Go on the trip', 'It was one of the best days of the year.'],
        ['skip', 'Stay behind', 'You had a quiet day while everyone else was away.'],
      ],
    ),
    choices: [
      {
        id: 'go',
        requires: null,
        effects: [
          money(-12, 'school'),
          stat('happiness', 60),
          need('social', 200),
          family('friends', 3),
        ],
      },
      { id: 'skip', requires: null, effects: [stat('stress', -10)] },
    ],
  }),
  define({
    id: 'proud-report',
    category: 'school',
    when: all(ageYears(6, 18), atSchool, cmp('school.grade', 'gte', 800)),
    chancePpm: 20_000,
    cooldownMonths: 12,
    effects: [family('parents', 5), stat('confidence', 20)],
    text: auto(
      'Top marks',
      'Your latest marks are among the best in your year.',
      'Your family put your report on the fridge.',
    ),
  }),
  define({
    id: 'struggling-at-school',
    category: 'school',
    when: all(cmp('school.grade', 'lt', 450), studying),
    chancePpm: 25_000,
    cooldownMonths: 12,
    text: decide(
      'Falling behind',
      'Your grades are slipping and you are finding lessons hard to follow.',
      [
        ['tutor', 'Get a tutor', 'A few sessions with a tutor started to make things click.'],
        ['study', 'Study harder on your own', 'It was tiring, but you started to catch up.'],
        ['ignore', 'Hope it sorts itself out', 'It did not sort itself out.'],
      ],
    ),
    choices: [
      {
        id: 'tutor',
        requires: null,
        effects: [money(-10, 'school'), grade(60), stat('stress', 10)],
      },
      {
        id: 'study',
        requires: null,
        effects: [grade(30), stat('stress', 30), stat('discipline', 10)],
      },
      { id: 'ignore', requires: null, effects: [grade(-20)] },
    ],
  }),
  define({
    id: 'freshers-week',
    category: 'school',
    when: all(cmp('school.stage', 'eq', 'tertiary'), ageYears(17, 30)),
    subject: subject('classmate'),
    chancePpm: 500_000,
    maxOccurrences: 1,
    text: decide(
      'Welcome week',
      'Your first week of further study is full of clubs, events and new people, including {subject}.',
      [
        [
          'social',
          'Say yes to everything',
          'You met lots of people, and {subject} became a friend.',
        ],
        ['focus', 'Get ahead with reading', 'You started the term well prepared.'],
      ],
    ),
    choices: [
      {
        id: 'social',
        requires: null,
        effects: [befriend, need('social', 300), stat('happiness', 50), need('rest', -150)],
      },
      { id: 'focus', requires: null, effects: [grade(30), skill('reading', 15)] },
    ],
  }),
  define({
    id: 'all-nighter',
    category: 'school',
    when: cmp('school.stage', 'eq', 'tertiary'),
    chancePpm: 20_000,
    cooldownMonths: 6,
    text: decide(
      'Deadline tomorrow',
      'An assignment is due in the morning and it is nowhere near finished.',
      [
        ['pull', 'Stay up all night', 'You handed it in on time, running on very little sleep.'],
        [
          'sleep',
          'Sleep and ask for an extension',
          'You were refreshed but had to explain yourself.',
        ],
      ],
    ),
    choices: [
      {
        id: 'pull',
        requires: null,
        effects: [grade(25), stat('health', -20), stat('stress', 30), need('rest', -300)],
      },
      { id: 'sleep', requires: null, effects: [grade(-10), stat('stress', -10)] },
    ],
  }),
  define({
    id: 'study-abroad',
    category: 'school',
    when: all(cmp('school.stage', 'eq', 'tertiary'), cmp('school.grade', 'gte', 700)),
    chancePpm: 8_000,
    maxOccurrences: 1,
    text: decide(
      'Study abroad',
      'You have been offered a term abroad at a partner university. It is a chance, and it is not free.',
      [
        ['go', 'Go abroad for a term', 'A term in another country changed how you see the world.'],
        ['stay', 'Stay at home', 'You stayed with the people and routines you know.'],
      ],
    ),
    choices: [
      {
        id: 'go',
        requires: null,
        effects: [
          money(-80, 'travel'),
          stat('happiness', 100),
          stat('confidence', 40),
          skill('socializing', 30),
        ],
      },
      { id: 'stay', requires: null, effects: [stat('stress', -10)] },
    ],
  }),
  define({
    id: 'team-rivalry',
    category: 'school',
    when: all(cmp('clubs.count', 'gte', 1), ageYears(8, 25)),
    subject: subject('classmate'),
    chancePpm: 12_000,
    cooldownMonths: 18,
    text: decide(
      'Picked ahead of you',
      'At your club, {subject} keeps getting chosen ahead of you.',
      [
        ['train', 'Train harder', 'You put in extra practice. It showed.'],
        ['congratulate', 'Congratulate them', '{subject} was touched that you were so gracious.'],
        [
          'complain',
          'Complain that it is unfair',
          'It did not change the decision, and things with {subject} got frosty.',
        ],
      ],
    ),
    choices: [
      {
        id: 'train',
        requires: null,
        effects: [stat('discipline', 20), stat('stress', 20), skill('fitness', 15)],
      },
      {
        id: 'congratulate',
        requires: null,
        effects: [bond(8, 4, 5), theyRemember('goodSport', 30, 40, 'fast')],
      },
      { id: 'complain', requires: null, effects: [bond(-5, 0, -5, 15)] },
    ],
  }),
];

const SOCIAL: EventDefinition[] = [
  define({
    id: 'neighbour-kid-plays',
    category: 'social',
    when: ageYears(4, 12),
    subject: subject('neighbour', { minAge: 3, maxAge: 14 }),
    chancePpm: 15_000,
    maxOccurrences: 2,
    text: decide('Want to play?', '{subject} from down the street asks if you want to play.', [
      ['play', 'Play together', 'You spent the whole afternoon outside with {subject}.'],
      ['shy', 'Stay inside', 'You were too shy this time.'],
    ]),
    choices: [
      {
        id: 'play',
        requires: null,
        effects: [
          bond(12, 5),
          theyRemember('playedTogether', 30, 40, 'fast'),
          need('leisure', 150),
        ],
      },
      { id: 'shy', requires: null, effects: [stat('confidence', -10)] },
    ],
  }),
  define({
    id: 'friend-birthday',
    category: 'social',
    when: all(ageYears(5, 17), cmp('social.friends', 'gte', 1)),
    subject: subject('friend'),
    chancePpm: 20_000,
    cooldownMonths: 12,
    text: decide('Birthday party', '{subject} has invited you to their birthday party.', [
      ['go', 'Go and bring a present', 'Cake, games and a very happy {subject}.'],
      ['skip', 'Skip it', '{subject} asked where you were.'],
    ]),
    choices: [
      { id: 'go', requires: null, effects: [money(-3, 'gifts'), stat('happiness', 40), bond(6)] },
      { id: 'skip', requires: null, effects: [bond(-4)] },
    ],
  }),
  define({
    id: 'friend-hard-time',
    category: 'social',
    when: ageYears(12),
    subject: subject('friend'),
    chancePpm: 15_000,
    cooldownMonths: 12,
    text: decide(
      'A friend needs you',
      '{subject} is going through a hard time and asks if you can talk.',
      [
        [
          'listen',
          'Drop everything and listen',
          'You talked for hours. {subject} said it meant more than you knew.',
        ],
        ['busy', 'Say you are busy', '{subject} said it was fine. It did not sound fine.'],
      ],
    ),
    choices: [
      {
        id: 'listen',
        requires: null,
        effects: [stat('stress', 10), bond(6, 10), theyRemember('thereForMe', 70, 80)],
      },
      {
        id: 'busy',
        requires: null,
        effects: [bond(-8, -5), theyRemember('notThere', -30, 50, 'fast')],
      },
    ],
  }),
  define({
    id: 'friend-drifting',
    category: 'social',
    when: ageYears(14),
    subject: subject('friend', { maxCloseness: 45 }),
    chancePpm: 15_000,
    cooldownMonths: 12,
    text: decide(
      'Drifting apart',
      'You realise you have not really talked to {subject} in months.',
      [
        ['reconnect', 'Get in touch', 'You picked up where you left off.'],
        ['letGo', 'Let it be', 'Some friendships fade, and that is all right.'],
      ],
    ),
    choices: [
      { id: 'reconnect', requires: null, effects: [bond(12, 3)] },
      { id: 'letGo', requires: null, effects: [] },
    ],
  }),
  define({
    id: 'sibling-squabble',
    category: 'family',
    when: ageYears(5, 20),
    subject: subject('sibling'),
    chancePpm: 15_000,
    cooldownMonths: 12,
    text: decide(
      'Sibling squabble',
      'You and {subject} are arguing about something that seemed very important at the time.',
      [
        ['sorry', 'Say sorry first', 'You made up quickly.'],
        ['stand', 'Stand your ground', 'Neither of you backed down.'],
      ],
    ),
    choices: [
      { id: 'sorry', requires: null, effects: [bond(4, 0, 0, -10)] },
      { id: 'stand', requires: null, effects: [bond(-3, 0, 0, 12), stat('confidence', 10)] },
    ],
  }),
  define({
    id: 'grandparent-stories',
    category: 'family',
    when: ageYears(5, 18),
    subject: subject('grandparent'),
    chancePpm: 15_000,
    cooldownMonths: 18,
    effects: [bond(6, 3), skill('reading', 10), youRemember('stories', 40, 50, 'slow')],
    text: auto(
      'Stories from long ago',
      '{subject} tells you about growing up.',
      "You listened to {subject}'s stories until the light faded.",
    ),
  }),
  define({
    id: 'grandparent-unwell',
    category: 'family',
    when: ageYears(5),
    subject: subject('grandparent', { minAge: 70 }),
    chancePpm: 6_000,
    cooldownMonths: 36,
    text: decide('Not feeling well', '{subject} has not been well lately.', [
      ['visit', 'Visit them', '{subject} brightened up the moment you arrived.'],
      ['call', 'Call instead', 'A short call, but {subject} was glad to hear from you.'],
    ]),
    choices: [
      {
        id: 'visit',
        requires: null,
        effects: [bond(10, 5), stat('stress', 10), theyRemember('visitedMe', 50, 60)],
      },
      { id: 'call', requires: null, effects: [bond(3)] },
    ],
  }),
  define({
    id: 'cousin-visit',
    category: 'family',
    when: ageYears(4, 16),
    subject: subject('relative', { maxAge: 25 }),
    chancePpm: 10_000,
    cooldownMonths: 24,
    effects: [bond(8), need('leisure', 150), stat('happiness', 30)],
    text: auto(
      'Family visit',
      '{subject} comes to stay for the weekend.',
      'You and {subject} stayed up far too late talking.',
    ),
  }),
  define({
    id: 'family-dinner',
    category: 'family',
    when: ageYears(3, 25),
    chancePpm: 15_000,
    cooldownMonths: 12,
    effects: [family('parents', 4), need('social', 100), stat('happiness', 20)],
    text: auto(
      'Family dinner',
      'Everyone is home for once, all at the same table.',
      'A long, noisy, happy dinner.',
    ),
  }),
  define({
    id: 'teen-party',
    category: 'teen',
    when: ageYears(14, 19),
    chancePpm: 20_000,
    cooldownMonths: 6,
    text: decide('Party invitation', 'Everyone seems to be going to a party this weekend.', [
      ['go', 'Go', 'Loud music, good company and a late night.'],
      ['stay', 'Stay in', 'A quiet night and a good sleep.'],
    ]),
    choices: [
      {
        id: 'go',
        requires: null,
        effects: [
          need('social', 200),
          stat('happiness', 30),
          stat('stress', -10),
          need('rest', -100),
        ],
      },
      { id: 'stay', requires: null, effects: [need('rest', 100)] },
    ],
  }),
  define({
    id: 'sneak-out',
    category: 'teen',
    when: ageYears(15, 19),
    subject: subject('friend', { minAge: 13 }),
    chancePpm: 6_000,
    maxOccurrences: 2,
    text: decide(
      'Just this once',
      '{subject} wants you to skip a family commitment and go out with them instead.',
      [
        ['refuse', 'Keep your promise', 'You stayed. {subject} was a little disappointed.'],
        ['go', 'Go with {subject}', 'It was fun while it lasted.'],
      ],
    ),
    choices: [
      { id: 'refuse', requires: null, effects: [stat('discipline', 15), bond(-3)] },
      {
        id: 'go',
        requires: null,
        effects: [
          stat('happiness', 20),
          bond(5),
          family('parents', -5),
          schedule('sneaking-found', 1, 50),
        ],
      },
    ],
  }),
  define({
    id: 'sneaking-found',
    category: 'family',
    scheduledOnly: true,
    when: ageYears(0),
    effects: [family('parents', -10), stat('stress', 40)],
    text: auto(
      'Found out',
      'Your family found out where you really were.',
      'There was a long talk about trust.',
    ),
  }),
  define({
    id: 'neighbour-favour',
    category: 'social',
    when: ageYears(16),
    subject: subject('neighbour', { minAge: 18 }),
    chancePpm: 10_000,
    cooldownMonths: 18,
    text: decide('A favour', '{subject} asks if you could help carry some furniture.', [
      ['help', 'Help out', 'Heavy work, but {subject} was very grateful.'],
      ['decline', 'Make an excuse', 'You stayed in.'],
    ]),
    choices: [
      {
        id: 'help',
        requires: null,
        effects: [bond(8, 5), theyRemember('helpedMe', 50, 50), stat('energy', -100)],
      },
      { id: 'decline', requires: null, effects: [bond(-2)] },
    ],
  }),
  define({
    id: 'colleague-lunch',
    category: 'work',
    when: employed,
    subject: subject('colleague'),
    chancePpm: 15_000,
    cooldownMonths: 12,
    text: decide('Lunch invitation', '{subject} asks if you want to grab lunch together.', [
      ['yes', 'Join them', 'You found out you have a lot in common with {subject}.'],
      ['no', 'Eat at your desk', 'You got some work done.'],
    ]),
    choices: [
      { id: 'yes', requires: null, effects: [bond(10, 4), need('social', 100)] },
      { id: 'no', requires: null, effects: [performance(5)] },
    ],
  }),
  // Butterfly effects: memories made years earlier.
  define({
    id: 'old-classmate-referral',
    category: 'work',
    when: all(ageYears(19), not(employed)),
    subject: subject('anyone', { minAge: 18, memory: 'stoodUpForMe' }),
    chancePpm: 40_000,
    maxOccurrences: 1,
    text: decide(
      'An old classmate gets in touch',
      '{subject} messages you out of the blue. Years ago you stood up for them at school, and they never forgot. They offer to put in a good word wherever they can.',
      [
        [
          'thank',
          'Thank them warmly',
          '{subject} promised to recommend you if you apply where they work.',
        ],
        ['proud', 'Say you will manage alone', '{subject} respected that, and the offer stands.'],
      ],
    ),
    choices: [
      { id: 'thank', requires: null, effects: [befriend, bond(10, 10), stat('happiness', 40)] },
      { id: 'proud', requires: null, effects: [bond(4, 0, 6), stat('confidence', 10)] },
    ],
  }),
  define({
    id: 'school-reunion',
    category: 'social',
    when: ageYears(24, 65),
    subject: subject('anyone', { minAge: 20, memory: 'leftAlone' }),
    chancePpm: 20_000,
    maxOccurrences: 1,
    text: decide(
      'Class reunion',
      'At a class reunion, {subject} mentions the day you walked away while they were being teased.',
      [
        [
          'apologise',
          'Apologise sincerely',
          '{subject} said it meant a lot to hear that, after all these years.',
        ],
        ['brush', 'Brush it off', 'The conversation ended there.'],
      ],
    ),
    choices: [
      {
        id: 'apologise',
        requires: null,
        effects: [bond(10, 8, 5, -20), theyRemember('apologised', 40, 60)],
      },
      { id: 'brush', requires: null, effects: [bond(-5, -5, 0, 10)] },
    ],
  }),
  define({
    id: 'friend-returns-favour',
    category: 'money',
    when: all(ageYears(20), any(cmp('money.inDebt', 'eq', true), not(employed))),
    subject: subject('anyone', { minAge: 18, memory: 'thereForMe' }),
    chancePpm: 30_000,
    maxOccurrences: 1,
    effects: [money(80, 'gifts'), bond(6, 6), stat('happiness', 40)],
    text: auto(
      'A friend remembers',
      '{subject} heard things have been difficult and remembers how you were there for them.',
      '{subject} insisted on helping you out with some money. "You were there for me," they said.',
    ),
  }),
  define({
    id: 'old-hurt',
    category: 'social',
    when: ageYears(16),
    subject: subject('anyone', { memory: 'notThere' }),
    chancePpm: 6_000,
    maxOccurrences: 1,
    text: decide(
      'An old hurt',
      '{subject} brings up the time you were not there when they needed you.',
      [
        ['apologise', 'Apologise', 'It cleared the air between you.'],
        ['defend', 'Explain yourself', '{subject} was not convinced.'],
      ],
    ),
    choices: [
      { id: 'apologise', requires: null, effects: [bond(6, 5, 0, -15)] },
      { id: 'defend', requires: null, effects: [bond(-4, -4, 0, 10)] },
    ],
  }),
];

const ROMANCE: EventDefinition[] = [
  define({
    id: 'first-crush',
    category: 'teen',
    when: ageYears(13, 17),
    chancePpm: 15_000,
    maxOccurrences: 1,
    text: decide(
      'A crush',
      'You realise you think about someone in your class a lot more than you used to.',
      [
        [
          'tell',
          'Tell your best friend',
          'Your friend was sworn to secrecy, and it felt good to say it out loud.',
        ],
        [
          'secret',
          'Keep it to yourself',
          'You wrote about it in a notebook nobody will ever read.',
        ],
      ],
    ),
    choices: [
      { id: 'tell', requires: null, effects: [need('social', 100), stat('stress', 10)] },
      { id: 'secret', requires: null, effects: [stat('creativity', 10), stat('stress', 15)] },
    ],
  }),
  define({
    id: 'date-night',
    category: 'romance',
    when: all(ageYears(18), partnered),
    subject: subject('partner'),
    chancePpm: 30_000,
    cooldownMonths: 6,
    text: decide(
      'Date night',
      'It has been a while since you and {subject} had an evening just for the two of you.',
      [
        ['plan', 'Plan something special', 'A lovely evening. {subject} was delighted.'],
        ['home', 'A quiet night in', 'Takeaway, a film and an early night together.'],
      ],
    ),
    choices: [
      {
        id: 'plan',
        requires: null,
        effects: [money(-5, 'leisure'), bond(8, 3), stat('happiness', 40)],
      },
      { id: 'home', requires: null, effects: [bond(4), need('rest', 100)] },
    ],
  }),
  define({
    id: 'partner-disagreement',
    category: 'romance',
    when: all(ageYears(18), partnered),
    subject: subject('partner'),
    chancePpm: 15_000,
    cooldownMonths: 12,
    text: decide('A disagreement', 'You and {subject} disagree about how to spend your weekends.', [
      ['talk', 'Talk it through', 'You found a compromise you can both live with.'],
      ['sulk', 'Go quiet', 'It hung in the air for days.'],
    ]),
    choices: [
      { id: 'talk', requires: null, effects: [bond(3, 5, 0, -10)] },
      { id: 'sulk', requires: null, effects: [bond(-5, -3, 0, 15)] },
    ],
  }),
  define({
    id: 'anniversary',
    category: 'romance',
    when: cmp('social.married', 'eq', true),
    subject: subject('partner'),
    chancePpm: 60_000,
    cooldownMonths: 12,
    effects: [bond(6, 2), stat('happiness', 40)],
    text: auto(
      'Anniversary',
      'Another year together.',
      'You and {subject} celebrated with a quiet dinner.',
    ),
  }),
  define({
    id: 'partner-opportunity',
    category: 'romance',
    when: all(ageYears(18), partnered),
    subject: subject('partner', { minAge: 18 }),
    chancePpm: 10_000,
    cooldownMonths: 24,
    text: decide(
      'Big news',
      '{subject} has been offered a promotion that would mean much longer hours.',
      [
        ['support', 'Encourage them', '{subject} took it, grateful for your support.'],
        ['worry', 'Say you are worried', 'You talked about it, and some tension stayed.'],
      ],
    ),
    choices: [
      { id: 'support', requires: null, effects: [bond(8, 5), stat('stress', 10)] },
      { id: 'worry', requires: null, effects: [bond(0, 0, 0, 8)] },
    ],
  }),
];

const WORK: EventDefinition[] = [
  define({
    id: 'job-interview',
    category: 'work',
    scheduledOnly: true,
    when: ageYears(0),
    text: decide(
      'Job interview',
      'Your interview for the {title} role at {employer} is today. How will you approach it?',
      [
        [
          'confident',
          'Show confidence and talk up your strengths',
          'You made your case with confidence at {employer}.',
        ],
        [
          'honest',
          'Be open about what you can and cannot do yet',
          'You were honest and straightforward at {employer}.',
        ],
        [
          'curious',
          'Ask thoughtful questions about the team',
          'You asked good questions and learned a lot about {employer}.',
        ],
      ],
    ),
    choices: [
      {
        id: 'confident',
        requires: null,
        effects: [{ kind: 'action', action: 'interview.confident' }],
      },
      { id: 'honest', requires: null, effects: [{ kind: 'action', action: 'interview.honest' }] },
      { id: 'curious', requires: null, effects: [{ kind: 'action', action: 'interview.curious' }] },
    ],
  }),
  define({
    id: 'first-paycheck',
    category: 'work',
    when: all(employed, cmp('job.tenure', 'lte', 1)),
    chancePpm: 900_000,
    maxOccurrences: 1,
    effects: [stat('happiness', 40), stat('confidence', 20)],
    text: auto(
      'First pay',
      'Your first wages have arrived.',
      'Seeing your own pay arrive felt like a real milestone.',
    ),
  }),
  define({
    id: 'first-part-time-job',
    category: 'work',
    when: all(employed, ageYears(13, 17)),
    chancePpm: 400_000,
    maxOccurrences: 1,
    effects: [stat('discipline', 20), stat('confidence', 20)],
    text: auto(
      'Your first job',
      'You have started your first part-time job.',
      'Early starts and new responsibilities: it made you feel grown up.',
    ),
  }),
  define({
    id: 'big-project',
    category: 'work',
    when: employed,
    chancePpm: 20_000,
    cooldownMonths: 12,
    text: decide('A big project', 'Your team needs someone to lead an important new project.', [
      ['volunteer', 'Volunteer', 'It was demanding, but people noticed what you did.'],
      ['pass', 'Let someone else take it', 'You kept your workload manageable.'],
    ]),
    choices: [
      {
        id: 'volunteer',
        requires: null,
        effects: [performance(80), stat('stress', 40), skill('leadership', 20)],
      },
      { id: 'pass', requires: null, effects: [stat('stress', -10), performance(-20)] },
    ],
  }),
  define({
    id: 'manager-criticism',
    category: 'work',
    when: employed,
    subject: subject('manager'),
    chancePpm: 12_000,
    cooldownMonths: 18,
    text: decide(
      'Criticised in front of the team',
      '{subject} criticises your work in a team meeting.',
      [
        [
          'calm',
          'Ask to talk privately',
          'A calm conversation cleared things up, and {subject} respected it.',
        ],
        ['push', 'Push back there and then', 'You defended yourself. The room went quiet.'],
        ['ignore', 'Say nothing', 'You let it go, but it stayed with you.'],
      ],
    ),
    choices: [
      { id: 'calm', requires: null, effects: [bond(3, 0, 8, -5), performance(20)] },
      { id: 'push', requires: null, effects: [bond(-5, 0, 0, 15), stat('confidence', 20)] },
      { id: 'ignore', requires: null, effects: [stat('stress', 30)] },
    ],
  }),
  define({
    id: 'credit-taken',
    category: 'work',
    when: employed,
    subject: subject('colleague'),
    chancePpm: 10_000,
    cooldownMonths: 18,
    text: decide('Your idea, their name', '{subject} presents your idea as their own.', [
      ['confront', 'Confront them', '{subject} backed down. The air between you is colder now.'],
      ['manager', 'Tell your manager', 'Your manager made sure the credit went to you.'],
      ['letGo', 'Let it go', 'You kept the peace, and kept the memory.'],
    ]),
    choices: [
      { id: 'confront', requires: null, effects: [bond(-8, -5, 0, 20), performance(20)] },
      {
        id: 'manager',
        requires: null,
        effects: [performance(30), bond(-10, 0, 0, 25), theyRemember('reportedMe', -50, 60)],
      },
      {
        id: 'letGo',
        requires: null,
        effects: [stat('stress', 20), youRemember('tookCredit', -40, 50, 'slow')],
      },
    ],
  }),
  define({
    id: 'overtime',
    category: 'work',
    when: employed,
    chancePpm: 20_000,
    cooldownMonths: 6,
    text: decide('Extra hours', 'Your employer asks for extra hours this month, paid as a bonus.', [
      ['accept', 'Take the extra hours', 'Long days, but a welcome bonus.'],
      ['decline', 'Decline politely', 'You kept your evenings free.'],
    ]),
    choices: [
      {
        id: 'accept',
        requires: null,
        effects: [money(15, 'bonus'), stat('stress', 40), need('rest', -150), performance(30)],
      },
      { id: 'decline', requires: null, effects: [performance(-10)] },
    ],
  }),
  define({
    id: 'training-course',
    category: 'work',
    when: employed,
    chancePpm: 12_000,
    cooldownMonths: 18,
    text: decide('Training course', 'Your employer offers you a place on a training course.', [
      ['attend', 'Attend', 'You came back with new skills and fresh ideas.'],
      ['skip', 'Too busy this time', 'The work piled up anyway.'],
    ]),
    choices: [
      {
        id: 'attend',
        requires: null,
        effects: [
          skill('leadership', 15),
          skill('technology', 15),
          skill('business', 15),
          performance(20),
        ],
      },
      { id: 'skip', requires: null, effects: [] },
    ],
  }),
  define({
    id: 'recognition',
    category: 'work',
    when: all(employed, cmp('job.performance', 'gte', 800)),
    chancePpm: 20_000,
    cooldownMonths: 12,
    effects: [stat('confidence', 50), stat('reputation', 30), money(20, 'bonus')],
    text: auto(
      'Employee recognition',
      'Your work has been recognised by senior management.',
      'A thank-you in front of everyone, and a bonus.',
    ),
  }),
  define({
    id: 'burnout',
    category: 'health',
    when: all(employed, cmp('stats.stress', 'gte', 750)),
    chancePpm: 60_000,
    cooldownMonths: 6,
    text: decide('Running on empty', 'You feel exhausted all the time and dread going to work.', [
      ['leave', 'Take time off to recover', 'A few weeks away helped you breathe again.'],
      ['push', 'Push through', 'You kept going, but it cost you.'],
    ]),
    choices: [
      {
        id: 'leave',
        requires: null,
        effects: [performance(-30), stat('stress', -150), stat('health', 20)],
      },
      { id: 'push', requires: null, effects: [stat('stress', 40), stat('health', -30)] },
    ],
  }),
  define({
    id: 'side-gig',
    category: 'work',
    when: ageYears(18),
    chancePpm: 8_000,
    cooldownMonths: 24,
    text: decide('A side job', 'Someone offers you a short paid job on the side.', [
      ['take', 'Take it', 'Some extra money, at the cost of your free time.'],
      ['decline', 'Decline', 'You kept your evenings.'],
    ]),
    choices: [
      { id: 'take', requires: null, effects: [money(40, 'sideIncome'), stat('stress', 30)] },
      { id: 'decline', requires: null, effects: [] },
    ],
  }),
  define({
    id: 'job-search-blues',
    category: 'work',
    when: all(ageYears(20, 60), not(employed), cmp('school.stage', 'eq', 'none')),
    chancePpm: 25_000,
    cooldownMonths: 6,
    text: decide('Searching', 'Another week of applications and no replies.', [
      ['keep', 'Keep going', 'You refused to give up.'],
      ['break', 'Take a short break', 'A few days off helped you come back stronger.'],
    ]),
    choices: [
      { id: 'keep', requires: null, effects: [stat('discipline', 15), stat('stress', 20)] },
      { id: 'break', requires: null, effects: [stat('stress', -40), stat('happiness', 10)] },
    ],
  }),
  define({
    id: 'team-celebration',
    category: 'work',
    when: employed,
    subject: subject('colleague'),
    chancePpm: 15_000,
    cooldownMonths: 12,
    effects: [bond(6), stat('happiness', 20), need('social', 100)],
    text: auto(
      'Team celebration',
      'Your team celebrates finishing a long piece of work.',
      'You got to know {subject} better over the celebration.',
    ),
  }),
];

const MONEY: EventDefinition[] = [
  define({
    id: 'forgotten-note',
    category: 'money',
    when: ageYears(8),
    chancePpm: 4_000,
    cooldownMonths: 60,
    effects: [money(2, 'gifts'), stat('happiness', 20)],
    text: auto(
      'A lucky find',
      'You put on an old jacket.',
      'You found some forgotten money in the pocket.',
    ),
  }),
  define({
    id: 'appliance-breaks',
    category: 'money',
    when: all(ageYears(18), cmp('home.own', 'eq', true)),
    chancePpm: 15_000,
    cooldownMonths: 12,
    effects: [money(-25, 'repairs'), stat('stress', 20)],
    text: auto(
      'Broken down',
      'The washing machine stops working.',
      'A repair you had not planned for.',
    ),
  }),
  define({
    id: 'car-trouble',
    category: 'money',
    when: ageYears(18),
    chancePpm: 10_000,
    cooldownMonths: 18,
    text: decide('Car trouble', 'Your car is making a worrying noise.', [
      ['fix', 'Get it fixed now', 'Expensive, but sorted.'],
      ['wait', 'Wait and see', 'The noise did not go away.'],
    ]),
    choices: [
      { id: 'fix', requires: null, effects: [money(-30, 'repairs')] },
      { id: 'wait', requires: null, effects: [stat('stress', 30), schedule('car-worse', 3, 50)] },
    ],
  }),
  define({
    id: 'car-worse',
    category: 'money',
    scheduledOnly: true,
    when: ageYears(0),
    effects: [money(-60, 'repairs'), stat('stress', 40)],
    text: auto(
      'It got worse',
      'The car finally broke down.',
      'The repair cost far more than it would have before.',
    ),
  }),
  define({
    id: 'prize-scam',
    category: 'money',
    when: ageYears(16),
    chancePpm: 8_000,
    cooldownMonths: 24,
    text: decide(
      'You have won!',
      'A message says you have won a prize and asks for your bank details to send it.',
      [
        ['ignore', 'Delete it', 'It was a scam. You were right to ignore it.'],
        ['reply', 'Send the details', 'Money went missing from your account. It was a scam.'],
      ],
    ),
    choices: [
      { id: 'ignore', requires: null, effects: [stat('discipline', 5)] },
      {
        id: 'reply',
        requires: null,
        effects: [money(-50, 'fraud'), stat('stress', 60), flag('scammed')],
      },
    ],
  }),
  define({
    id: 'relative-asks-loan',
    category: 'money',
    when: all(ageYears(21), cmp('money.savingsMonths', 'gte', 3)),
    subject: subject('sibling', { minAge: 18 }),
    chancePpm: 8_000,
    cooldownMonths: 36,
    text: decide(
      'Can you lend me some money?',
      '{subject} asks to borrow money to get through a rough patch.',
      [
        ['lend', 'Lend it', '{subject} was very grateful and promised to pay you back.'],
        ['refuse', 'Say no', '{subject} said they understood.'],
      ],
    ),
    choices: [
      {
        id: 'lend',
        requires: null,
        effects: [
          money(-60, 'familyLoan'),
          bond(10, 10),
          theyRemember('lentMeMoney', 70, 80),
          schedule('relative-repays', 12, 60, true),
        ],
      },
      { id: 'refuse', requires: null, effects: [bond(-8), theyRemember('refusedHelp', -40, 50)] },
    ],
  }),
  define({
    id: 'relative-repays',
    category: 'money',
    scheduledOnly: true,
    when: ageYears(0),
    subject: subject('anyone', { memory: 'lentMeMoney' }),
    effects: [money(60, 'familyLoan'), bond(5, 5)],
    text: auto(
      'Paid back',
      '{subject} has something for you.',
      '{subject} paid back every penny they borrowed.',
    ),
  }),
  define({
    id: 'painful-infection',
    category: 'health',
    when: ageYears(1),
    chancePpm: 6_000,
    cooldownMonths: 24,
    effects: [medical(80), stat('health', -30), stat('stress', 20)],
    text: auto(
      'Feeling unwell',
      'You come down with a painful infection that needs treatment.',
      'Treatment cleared it up within a couple of weeks.',
    ),
  }),
  define({
    id: 'budget-review',
    category: 'money',
    when: all(ageYears(18), cmp('money.inDebt', 'eq', true)),
    chancePpm: 30_000,
    cooldownMonths: 6,
    text: decide('Money worries', 'Your debts are on your mind more and more.', [
      ['cut', 'Make a strict budget', 'Cutting back was hard, but you feel more in control.'],
      ['carry', 'Carry on as you are', 'The worry did not go away.'],
    ]),
    choices: [
      {
        id: 'cut',
        requires: null,
        effects: [stat('discipline', 20), stat('happiness', -20), stat('stress', 10)],
      },
      { id: 'carry', requires: null, effects: [stat('stress', 20)] },
    ],
  }),
  define({
    id: 'sibling-milestone',
    category: 'family',
    when: ageYears(4),
    subject: subject('sibling', { minAge: 17, maxAge: 30 }),
    chancePpm: 6_000,
    maxOccurrences: 2,
    effects: [bond(5), stat('happiness', 20)],
    text: auto(
      'Proud of them',
      '{subject} has reached a big milestone.',
      "The family celebrated {subject}'s news together.",
    ),
  }),
];

export const LIFE_EVENTS: EventDefinition[] = [...SCHOOL, ...SOCIAL, ...ROMANCE, ...WORK, ...MONEY];
