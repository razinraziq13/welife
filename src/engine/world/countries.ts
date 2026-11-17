import { CountryProfileSchema, type CountryProfile, type Location } from './countrySchema';

/**
 * Baseline profiles for the 20 launch countries (spec §4).
 *
 * Status: BASELINE, UNVERIFIED. Wage and cost figures are rounded approximations from
 * the reference types listed below and are labelled as approximate in the UI. They will
 * be researched with dated sources in Milestone 6 (see docs/TRACEABILITY.md W-03).
 * Everything after the game's start date is simulated, not real-world fact (decision D4).
 */

const BASELINE_REFERENCES = [
  'Wages: national statistics office or ILOSTAT median/average monthly earnings, latest available (about 2023-2024), rounded',
  'Life expectancy: World Bank / UN World Population Prospects, about 2023, rounded',
  'Cost of living: published consumer price comparisons relative to the United States, about 2024, rounded',
  'Monarchy and nobility: constitutional and legal status as of 2025',
];

type ProfileInput = Omit<CountryProfile, 'source' | 'locations'> & {
  locations: [string, string, Location['kind'], number][];
};

function profile(input: ProfileInput): CountryProfile {
  const code = input.code.toLowerCase();
  const locations: Location[] = input.locations.map(([name, region, kind, costIndex]) => ({
    id: `${code}-${slug(name)}`,
    name,
    region,
    kind,
    costIndex,
  }));
  return CountryProfileSchema.parse({
    ...input,
    locations,
    source: { asOf: '2024', status: 'baseline-unverified', references: BASELINE_REFERENCES },
  });
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const NO_MONARCHY = {
  system: 'none',
  royalBirthAvailable: false,
  royalTitle: null,
  nobleTitle: null,
  nobleParticle: null,
} as const;

const SHARED_MONARCH_NOTE =
  'The monarch is shared with the United Kingdom and lives there, so royal births are not offered.';

export const COUNTRIES: readonly CountryProfile[] = [
  profile({
    code: 'MY',
    name: 'Malaysia',
    demonym: 'Malaysian',
    currency: { code: 'MYR', exponent: 2, symbol: 'RM' },
    locations: [
      ['Kuala Lumpur', 'Federal Territory', 'city', 135],
      ['George Town', 'Penang', 'city', 115],
      ['Johor Bahru', 'Johor', 'city', 105],
      ['Kota Bharu countryside', 'Kelantan', 'rural', 72],
    ],
    economy: { medianMonthlyWageMinor: 2_600_00, costOfLivingIndex: 38 },
    lifeExpectancy: 76,
    monarchy: {
      system: 'federal-elective',
      royalBirthAvailable: true,
      royalNote:
        "Malaysia's state rulers take turns as head of state. Royal births here are into a fictional branch of a state royal house.",
      nobilityAvailable: false,
      nobilityNote: 'Titles such as Datuk are awarded honours, not inherited nobility.',
      royalTitle: { female: 'Tengku', male: 'Tengku' },
      nobleTitle: null,
      nobleParticle: null,
    },
    names: {
      order: 'given-first',
      female: ['Nur Aisyah', 'Siti', 'Mei Ling', 'Priya', 'Aina', 'Hui Min', 'Kavitha', 'Farah'],
      male: ['Muhammad Amir', 'Ahmad', 'Wei Jie', 'Arjun', 'Haziq', 'Jun Hao', 'Ravi', 'Irfan'],
      family: ['Abdullah', 'Tan', 'Lim', 'Wong', 'Rahman', 'Ismail', 'Kumar', 'Lee', 'Ibrahim'],
    },
  }),
  profile({
    code: 'SG',
    name: 'Singapore',
    demonym: 'Singaporean',
    currency: { code: 'SGD', exponent: 2, symbol: 'S$' },
    locations: [
      ['Central Area', 'Central Region', 'city', 125],
      ['Tampines', 'East Region', 'city', 98],
      ['Jurong West', 'West Region', 'city', 95],
      ['Woodlands', 'North Region', 'city', 92],
    ],
    economy: { medianMonthlyWageMinor: 5_500_00, costOfLivingIndex: 85 },
    lifeExpectancy: 83,
    monarchy: {
      ...NO_MONARCHY,
      royalNote: 'Singapore is a republic.',
      nobilityAvailable: false,
      nobilityNote: 'Singapore has no hereditary nobility.',
    },
    names: {
      order: 'given-first',
      female: ['Hui Min', 'Shu Fen', 'Nur Hidayah', 'Divya', 'Rachel', 'Jia Ying'],
      male: ['Wei Ming', 'Jun Jie', 'Muhammad Hafiz', 'Arun', 'Ryan', 'Zhi Hao'],
      family: ['Tan', 'Lim', 'Lee', 'Ng', 'Ong', 'Wong', 'Goh', 'Chua', 'Rahman', 'Pillai'],
    },
  }),
  profile({
    code: 'ID',
    name: 'Indonesia',
    demonym: 'Indonesian',
    currency: { code: 'IDR', exponent: 2, symbol: 'Rp' },
    locations: [
      ['Jakarta', 'DKI Jakarta', 'city', 140],
      ['Surabaya', 'East Java', 'city', 110],
      ['Yogyakarta', 'Special Region of Yogyakarta', 'city', 95],
      ['Klaten countryside', 'Central Java', 'rural', 70],
    ],
    economy: { medianMonthlyWageMinor: 3_000_000_00, costOfLivingIndex: 30 },
    lifeExpectancy: 71,
    monarchy: {
      system: 'traditional',
      royalBirthAvailable: true,
      royalNote:
        'Indonesia is a republic, but traditional sultanates keep cultural roles (and, in Yogyakarta, a constitutional one). Royal births are into a fictional traditional royal house.',
      nobilityAvailable: true,
      nobilityNote:
        'Javanese aristocratic families keep hereditary titles socially; they carry no legal privilege.',
      royalTitle: { female: 'Gusti Raden Ajeng', male: 'Gusti Raden Mas' },
      nobleTitle: { female: 'Raden Ajeng', male: 'Raden Mas' },
      nobleParticle: null,
    },
    names: {
      order: 'given-first',
      female: ['Siti', 'Putri', 'Dewi', 'Ayu', 'Nadia', 'Intan'],
      male: ['Budi', 'Agus', 'Rizky', 'Dimas', 'Andi', 'Fajar'],
      family: ['Santoso', 'Wijaya', 'Saputra', 'Hidayat', 'Kusuma', 'Pratama', 'Setiawan'],
    },
  }),
  profile({
    code: 'TH',
    name: 'Thailand',
    demonym: 'Thai',
    currency: { code: 'THB', exponent: 2, symbol: '฿' },
    locations: [
      ['Bangkok', 'Bangkok Metropolitan Region', 'city', 135],
      ['Chiang Mai', 'Northern Thailand', 'city', 95],
      ['Phuket', 'Southern Thailand', 'city', 120],
      ['Khon Kaen countryside', 'Isan', 'rural', 70],
    ],
    economy: { medianMonthlyWageMinor: 15_000_00, costOfLivingIndex: 38 },
    lifeExpectancy: 79,
    monarchy: {
      system: 'constitutional',
      royalBirthAvailable: true,
      royalNote:
        'Descendants of kings carry hereditary royal ranks that fade over generations. Royal births here are into a fictional distant royal lineage.',
      nobilityAvailable: false,
      nobilityNote: 'Non-royal noble ranks were abolished in 1932.',
      royalTitle: { female: 'Mom Rajawongse', male: 'Mom Rajawongse' },
      nobleTitle: null,
      nobleParticle: null,
    },
    names: {
      order: 'given-first',
      female: ['Ploy', 'Siriporn', 'Nattaya', 'Kanya', 'Mali', 'Pim'],
      male: ['Somchai', 'Anan', 'Krit', 'Nattapong', 'Thanakorn', 'Arthit'],
      family: [
        'Saetang',
        'Srisuk',
        'Wongsawat',
        'Chaiyaporn',
        'Rattanakul',
        'Boonmee',
        'Sukprasert',
      ],
    },
  }),
  profile({
    code: 'JP',
    name: 'Japan',
    demonym: 'Japanese',
    currency: { code: 'JPY', exponent: 0, symbol: '¥' },
    locations: [
      ['Tokyo', 'Kantō', 'city', 135],
      ['Osaka', 'Kansai', 'city', 115],
      ['Fukuoka', 'Kyūshū', 'city', 100],
      ['Akita countryside', 'Tōhoku', 'rural', 78],
    ],
    economy: { medianMonthlyWageMinor: 300_000, costOfLivingIndex: 60 },
    lifeExpectancy: 84,
    monarchy: {
      ...NO_MONARCHY,
      system: 'constitutional',
      royalNote:
        'The Imperial Family is a very small group of real, identifiable people, so royal births are not offered.',
      nobilityAvailable: false,
      nobilityNote: 'The kazoku peerage was abolished in 1947.',
    },
    names: {
      order: 'family-first',
      female: ['Yui', 'Hina', 'Sakura', 'Aoi', 'Mei', 'Yuna'],
      male: ['Haruto', 'Ren', 'Sota', 'Yuto', 'Hiroshi', 'Takumi'],
      family: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura'],
    },
  }),
  profile({
    code: 'KR',
    name: 'South Korea',
    demonym: 'South Korean',
    currency: { code: 'KRW', exponent: 0, symbol: '₩' },
    locations: [
      ['Seoul', 'Seoul Capital Area', 'city', 135],
      ['Busan', 'Yeongnam', 'city', 105],
      ['Daegu', 'Yeongnam', 'city', 98],
      ['Jeolla countryside', 'South Jeolla', 'rural', 72],
    ],
    economy: { medianMonthlyWageMinor: 3_000_000, costOfLivingIndex: 65 },
    lifeExpectancy: 84,
    monarchy: {
      ...NO_MONARCHY,
      royalNote: 'South Korea is a republic.',
      nobilityAvailable: false,
      nobilityNote: 'Hereditary class distinctions were abolished in the late 19th century.',
    },
    names: {
      order: 'family-first',
      female: ['Ji-woo', 'Seo-yeon', 'Min-ji', 'Ha-eun', 'Soo-ah', 'Ye-jin'],
      male: ['Min-jun', 'Seo-jun', 'Do-yun', 'Ji-ho', 'Hyun-woo', 'Joon-young'],
      family: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon'],
    },
  }),
  profile({
    code: 'CN',
    name: 'China',
    demonym: 'Chinese',
    currency: { code: 'CNY', exponent: 2, symbol: 'CN¥' },
    locations: [
      ['Shanghai', 'East China', 'city', 140],
      ['Beijing', 'North China', 'city', 138],
      ['Chengdu', 'Southwest China', 'city', 100],
      ['Henan countryside', 'Central China', 'rural', 65],
    ],
    economy: { medianMonthlyWageMinor: 6_500_00, costOfLivingIndex: 40 },
    lifeExpectancy: 78,
    monarchy: {
      ...NO_MONARCHY,
      royalNote: 'China has had no monarchy since 1912.',
      nobilityAvailable: false,
      nobilityNote: 'China has no hereditary nobility.',
    },
    names: {
      order: 'family-first',
      female: ['Na', 'Fang', 'Xiuying', 'Jing', 'Yan', 'Mei'],
      male: ['Wei', 'Hao', 'Jun', 'Lei', 'Yang', 'Ming'],
      family: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao'],
    },
  }),
  profile({
    code: 'IN',
    name: 'India',
    demonym: 'Indian',
    currency: { code: 'INR', exponent: 2, symbol: '₹' },
    locations: [
      ['Mumbai', 'Maharashtra', 'city', 140],
      ['Delhi', 'National Capital Territory', 'city', 130],
      ['Bengaluru', 'Karnataka', 'city', 125],
      ['Rural Uttar Pradesh', 'Uttar Pradesh', 'rural', 62],
    ],
    economy: { medianMonthlyWageMinor: 20_000_00, costOfLivingIndex: 24 },
    lifeExpectancy: 72,
    monarchy: {
      ...NO_MONARCHY,
      royalNote: 'Princely states joined India after 1947, and royal privileges ended in 1971.',
      nobilityAvailable: true,
      nobilityNote:
        'Families descended from former princely rulers keep heritage, property and social standing, but no legal title.',
    },
    names: {
      order: 'given-first',
      female: ['Aanya', 'Priya', 'Diya', 'Ananya', 'Kavya', 'Meera'],
      male: ['Aarav', 'Vihaan', 'Arjun', 'Rohan', 'Aditya', 'Karan'],
      family: ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Iyer', 'Das'],
    },
  }),
  profile({
    code: 'AU',
    name: 'Australia',
    demonym: 'Australian',
    currency: { code: 'AUD', exponent: 2, symbol: 'A$' },
    locations: [
      ['Sydney', 'New South Wales', 'city', 130],
      ['Melbourne', 'Victoria', 'city', 118],
      ['Brisbane', 'Queensland', 'city', 108],
      ['Regional Victoria', 'Victoria', 'rural', 82],
    ],
    economy: { medianMonthlyWageMinor: 6_000_00, costOfLivingIndex: 75 },
    lifeExpectancy: 83,
    monarchy: {
      ...NO_MONARCHY,
      system: 'constitutional',
      royalNote: SHARED_MONARCH_NOTE,
      nobilityAvailable: false,
      nobilityNote: 'Australia has no hereditary nobility.',
    },
    names: {
      order: 'given-first',
      female: ['Charlotte', 'Olivia', 'Amelia', 'Isla', 'Mia', 'Ava'],
      male: ['Oliver', 'Noah', 'Jack', 'William', 'Leo', 'Henry'],
      family: ['Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Nguyen', 'Martin'],
    },
  }),
  profile({
    code: 'NZ',
    name: 'New Zealand',
    demonym: 'New Zealander',
    currency: { code: 'NZD', exponent: 2, symbol: 'NZ$' },
    locations: [
      ['Auckland', 'Auckland', 'city', 125],
      ['Wellington', 'Wellington', 'city', 115],
      ['Christchurch', 'Canterbury', 'city', 100],
      ['Rural Waikato', 'Waikato', 'rural', 82],
    ],
    economy: { medianMonthlyWageMinor: 5_000_00, costOfLivingIndex: 72 },
    lifeExpectancy: 82,
    monarchy: {
      ...NO_MONARCHY,
      system: 'constitutional',
      royalNote: SHARED_MONARCH_NOTE,
      nobilityAvailable: false,
      nobilityNote: 'New Zealand has no hereditary nobility.',
    },
    names: {
      order: 'given-first',
      female: ['Isla', 'Charlotte', 'Aria', 'Amelia', 'Mia', 'Ruby'],
      male: ['Oliver', 'Noah', 'Nikau', 'Leo', 'Jack', 'Luca'],
      family: ['Smith', 'Wilson', 'Williams', 'Brown', 'Taylor', 'Ngata', 'Walker', 'Thompson'],
    },
  }),
  profile({
    code: 'US',
    name: 'United States',
    demonym: 'American',
    currency: { code: 'USD', exponent: 2, symbol: '$' },
    locations: [
      ['New York City', 'New York', 'city', 145],
      ['Los Angeles', 'California', 'city', 135],
      ['Houston', 'Texas', 'city', 100],
      ['Rural Iowa', 'Iowa', 'rural', 78],
    ],
    economy: { medianMonthlyWageMinor: 5_000_00, costOfLivingIndex: 100 },
    lifeExpectancy: 78,
    monarchy: {
      ...NO_MONARCHY,
      royalNote: 'The United States is a republic.',
      nobilityAvailable: false,
      nobilityNote: 'The Constitution forbids titles of nobility.',
    },
    names: {
      order: 'given-first',
      female: ['Olivia', 'Emma', 'Charlotte', 'Sophia', 'Mia', 'Isabella'],
      male: ['Liam', 'Noah', 'Oliver', 'James', 'Elijah', 'Mateo'],
      family: ['Smith', 'Johnson', 'Williams', 'Brown', 'Garcia', 'Miller', 'Davis', 'Rodriguez'],
    },
  }),
  profile({
    code: 'CA',
    name: 'Canada',
    demonym: 'Canadian',
    currency: { code: 'CAD', exponent: 2, symbol: 'C$' },
    locations: [
      ['Toronto', 'Ontario', 'city', 130],
      ['Montreal', 'Quebec', 'city', 108],
      ['Vancouver', 'British Columbia', 'city', 135],
      ['Rural Saskatchewan', 'Saskatchewan', 'rural', 80],
    ],
    economy: { medianMonthlyWageMinor: 4_800_00, costOfLivingIndex: 70 },
    lifeExpectancy: 82,
    monarchy: {
      ...NO_MONARCHY,
      system: 'constitutional',
      royalNote: SHARED_MONARCH_NOTE,
      nobilityAvailable: false,
      nobilityNote: 'Canada has no hereditary nobility.',
    },
    names: {
      order: 'given-first',
      female: ['Olivia', 'Charlotte', 'Amelia', 'Emma', 'Chloé', 'Léa'],
      male: ['Noah', 'Liam', 'William', 'Theodore', 'Félix', 'Benjamin'],
      family: ['Smith', 'Tremblay', 'Brown', 'Martin', 'Roy', 'Wilson', 'Gagnon', 'Lee'],
    },
  }),
  profile({
    code: 'GB',
    name: 'United Kingdom',
    demonym: 'British',
    currency: { code: 'GBP', exponent: 2, symbol: '£' },
    locations: [
      ['London', 'England', 'city', 145],
      ['Manchester', 'England', 'city', 105],
      ['Edinburgh', 'Scotland', 'city', 112],
      ['Rural North Yorkshire', 'England', 'rural', 85],
    ],
    economy: { medianMonthlyWageMinor: 3_000_00, costOfLivingIndex: 70 },
    lifeExpectancy: 81,
    monarchy: {
      system: 'constitutional',
      royalBirthAvailable: false,
      royalNote:
        'The royal family is a small group of real, identifiable people, so royal births are not offered. Choose Noble for a hereditary peerage family.',
      nobilityAvailable: true,
      nobilityNote: "Hereditary peerages still exist; peers' children use courtesy styles.",
      royalTitle: null,
      nobleTitle: { female: 'The Hon.', male: 'The Hon.' },
      nobleParticle: null,
    },
    names: {
      order: 'given-first',
      female: ['Olivia', 'Amelia', 'Isla', 'Ava', 'Freya', 'Lily'],
      male: ['Muhammad', 'Noah', 'Oliver', 'George', 'Arthur', 'Leo'],
      family: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Evans', 'Khan'],
    },
  }),
  profile({
    code: 'FR',
    name: 'France',
    demonym: 'French',
    currency: { code: 'EUR', exponent: 2, symbol: '€' },
    locations: [
      ['Paris', 'Île-de-France', 'city', 140],
      ['Lyon', 'Auvergne-Rhône-Alpes', 'city', 108],
      ['Marseille', "Provence-Alpes-Côte d'Azur", 'city', 100],
      ['Rural Normandy', 'Normandy', 'rural', 80],
    ],
    economy: { medianMonthlyWageMinor: 2_700_00, costOfLivingIndex: 72 },
    lifeExpectancy: 83,
    monarchy: {
      ...NO_MONARCHY,
      royalNote: 'France is a republic.',
      nobilityAvailable: true,
      nobilityNote:
        "Noble titles have no legal status, but old noble families still use them socially, often with the 'de' particle.",
      nobleParticle: 'de',
    },
    names: {
      order: 'given-first',
      female: ['Louise', 'Jade', 'Ambre', 'Emma', 'Alice', 'Léa'],
      male: ['Gabriel', 'Raphaël', 'Louis', 'Arthur', 'Jules', 'Adam'],
      family: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand'],
    },
  }),
  profile({
    code: 'DE',
    name: 'Germany',
    demonym: 'German',
    currency: { code: 'EUR', exponent: 2, symbol: '€' },
    locations: [
      ['Berlin', 'Berlin', 'city', 115],
      ['Munich', 'Bavaria', 'city', 135],
      ['Hamburg', 'Hamburg', 'city', 120],
      ['Rural Lower Saxony', 'Lower Saxony', 'rural', 82],
    ],
    economy: { medianMonthlyWageMinor: 3_900_00, costOfLivingIndex: 68 },
    lifeExpectancy: 81,
    monarchy: {
      ...NO_MONARCHY,
      royalNote: 'Germany has been a republic since 1918.',
      nobilityAvailable: true,
      nobilityNote: "Since 1919 former titles survive only as part of the surname, such as 'von'.",
      nobleParticle: 'von',
    },
    names: {
      order: 'given-first',
      female: ['Emilia', 'Sophia', 'Emma', 'Hannah', 'Mia', 'Lina'],
      male: ['Noah', 'Matteo', 'Leon', 'Paul', 'Finn', 'Elias'],
      family: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker'],
    },
  }),
  profile({
    code: 'IT',
    name: 'Italy',
    demonym: 'Italian',
    currency: { code: 'EUR', exponent: 2, symbol: '€' },
    locations: [
      ['Rome', 'Lazio', 'city', 120],
      ['Milan', 'Lombardy', 'city', 135],
      ['Naples', 'Campania', 'city', 95],
      ['Rural Tuscany', 'Tuscany', 'rural', 85],
    ],
    economy: { medianMonthlyWageMinor: 2_300_00, costOfLivingIndex: 65 },
    lifeExpectancy: 83,
    monarchy: {
      ...NO_MONARCHY,
      royalNote: 'Italy has been a republic since 1946.',
      nobilityAvailable: true,
      nobilityNote:
        'Noble titles have not been legally recognised since 1948, but noble families keep them socially.',
    },
    names: {
      order: 'given-first',
      female: ['Sofia', 'Aurora', 'Giulia', 'Ginevra', 'Alice', 'Beatrice'],
      male: ['Leonardo', 'Francesco', 'Tommaso', 'Edoardo', 'Alessandro', 'Lorenzo'],
      family: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci'],
    },
  }),
  profile({
    code: 'BR',
    name: 'Brazil',
    demonym: 'Brazilian',
    currency: { code: 'BRL', exponent: 2, symbol: 'R$' },
    locations: [
      ['São Paulo', 'São Paulo', 'city', 130],
      ['Rio de Janeiro', 'Rio de Janeiro', 'city', 120],
      ['Salvador', 'Bahia', 'city', 92],
      ['Rural Minas Gerais', 'Minas Gerais', 'rural', 70],
    ],
    economy: { medianMonthlyWageMinor: 2_800_00, costOfLivingIndex: 35 },
    lifeExpectancy: 76,
    monarchy: {
      ...NO_MONARCHY,
      royalNote: 'The monarchy ended in 1889.',
      nobilityAvailable: false,
      nobilityNote: 'Imperial titles were not hereditary and ended with the empire.',
    },
    names: {
      order: 'given-first',
      female: ['Helena', 'Alice', 'Laura', 'Maria', 'Valentina', 'Heloísa'],
      male: ['Miguel', 'Arthur', 'Gael', 'Heitor', 'Theo', 'Davi'],
      family: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira'],
    },
  }),
  profile({
    code: 'ZA',
    name: 'South Africa',
    demonym: 'South African',
    currency: { code: 'ZAR', exponent: 2, symbol: 'R' },
    locations: [
      ['Johannesburg', 'Gauteng', 'city', 120],
      ['Cape Town', 'Western Cape', 'city', 125],
      ['Durban', 'KwaZulu-Natal', 'city', 100],
      ['Rural Eastern Cape', 'Eastern Cape', 'rural', 65],
    ],
    economy: { medianMonthlyWageMinor: 9_000_00, costOfLivingIndex: 40 },
    lifeExpectancy: 65,
    monarchy: {
      system: 'traditional',
      royalBirthAvailable: true,
      royalNote:
        'Traditional kingdoms are recognised by law alongside the republic. Royal births are into a fictional traditional royal family.',
      nobilityAvailable: false,
      nobilityNote: 'South Africa has no hereditary nobility outside traditional leadership.',
      royalTitle: { female: 'Princess', male: 'Prince' },
      nobleTitle: null,
      nobleParticle: null,
    },
    names: {
      order: 'given-first',
      female: ['Amahle', 'Lethabo', 'Naledi', 'Ayanda', 'Zoe', 'Lerato'],
      male: ['Lwazi', 'Bandile', 'Thabo', 'Liam', 'Sipho', 'Kabelo'],
      family: ['Nkosi', 'Dlamini', 'Ndlovu', 'Botha', 'Naidoo', 'Mokoena', 'Khumalo', 'van Wyk'],
    },
  }),
  profile({
    code: 'AE',
    name: 'United Arab Emirates',
    demonym: 'Emirati',
    currency: { code: 'AED', exponent: 2, symbol: 'AED' },
    locations: [
      ['Dubai', 'Dubai', 'city', 135],
      ['Abu Dhabi', 'Abu Dhabi', 'city', 128],
      ['Sharjah', 'Sharjah', 'city', 100],
      ['Al Dhafra', 'Abu Dhabi', 'rural', 80],
    ],
    economy: { medianMonthlyWageMinor: 12_000_00, costOfLivingIndex: 60 },
    lifeExpectancy: 79,
    monarchy: {
      system: 'absolute',
      royalBirthAvailable: true,
      royalNote:
        'Each emirate is ruled by a large royal family. Royal births are into a fictional branch of a ruling family.',
      nobilityAvailable: false,
      nobilityNote: 'The UAE has no separate hereditary nobility.',
      royalTitle: { female: 'Sheikha', male: 'Sheikh' },
      nobleTitle: null,
      nobleParticle: null,
    },
    names: {
      order: 'given-first',
      female: ['Fatima', 'Mariam', 'Shamma', 'Hessa', 'Noura', 'Aisha'],
      male: ['Mohammed', 'Hamdan', 'Saeed', 'Rashid', 'Khalid', 'Sultan'],
      family: ['Al Mansoori', 'Al Hashimi', 'Al Shamsi', 'Al Mazrouei', 'Al Ketbi', 'Al Nuaimi'],
    },
  }),
  profile({
    code: 'SA',
    name: 'Saudi Arabia',
    demonym: 'Saudi',
    currency: { code: 'SAR', exponent: 2, symbol: 'SAR' },
    locations: [
      ['Riyadh', 'Riyadh Province', 'city', 125],
      ['Jeddah', 'Makkah Province', 'city', 115],
      ['Dammam', 'Eastern Province', 'city', 105],
      ['Asir countryside', 'Asir Province', 'rural', 72],
    ],
    economy: { medianMonthlyWageMinor: 8_000_00, costOfLivingIndex: 45 },
    lifeExpectancy: 78,
    monarchy: {
      system: 'absolute',
      royalBirthAvailable: true,
      royalNote:
        'The royal family has thousands of members. Royal births are into a fictional distant branch.',
      nobilityAvailable: false,
      nobilityNote: 'Saudi Arabia has no separate hereditary nobility.',
      royalTitle: { female: 'Princess', male: 'Prince' },
      nobleTitle: null,
      nobleParticle: null,
    },
    names: {
      order: 'given-first',
      female: ['Sara', 'Noura', 'Lama', 'Reem', 'Joud', 'Layan'],
      male: ['Abdullah', 'Faisal', 'Turki', 'Fahad', 'Saud', 'Omar'],
      family: ['Al Qahtani', 'Al Ghamdi', 'Al Otaibi', 'Al Harbi', 'Al Zahrani', 'Al Dosari'],
    },
  }),
];

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));
const LOCATIONS = new Map(
  COUNTRIES.flatMap((country) =>
    country.locations.map((location) => [location.id, { country, location }] as const),
  ),
);

export function getCountry(code: string): CountryProfile {
  const country = BY_CODE.get(code);
  if (!country) throw new Error(`Unknown country ${code}`);
  return country;
}

export function findCountry(code: string): CountryProfile | undefined {
  return BY_CODE.get(code);
}

export function getLocation(locationId: string): { country: CountryProfile; location: Location } {
  const entry = LOCATIONS.get(locationId);
  if (!entry) throw new Error(`Unknown location ${locationId}`);
  return entry;
}

export function findLocation(
  locationId: string,
): { country: CountryProfile; location: Location } | undefined {
  return LOCATIONS.get(locationId);
}
