/**
 * Beginner learning content: guided activities, quizzes and achievements.
 *
 * Activities are checked against the app's real state — an activity completes when you
 * actually select its target in the sky map, not when you click "done". Object ids here
 * match the catalogue ids built in astro/catalog.ts.
 */

export interface Activity {
  id: string
  title: string
  summary: string
  /** Catalogue id the learner has to find and select. */
  targetObjectId: string
  /**
   * Alternative target for observers who can never see the primary one — Polaris is
   * invisible from the southern hemisphere, for instance.
   */
  southernTargetObjectId?: string
  southernNote?: string
  steps: string[]
  hint: string
  achievement: string
}

export const ACTIVITIES: Activity[] = [
  {
    id: 'find-orion',
    title: 'Find Orion',
    summary: 'The easiest constellation to recognise, and the gateway to half the winter sky.',
    targetObjectId: 'con:Ori',
    steps: [
      'Open the Sky screen and look for three equally bright stars in a short, straight line. That is Orion’s Belt — nothing else in the sky looks quite like it.',
      'Above and to one side of the belt sits a distinctly orange star, Betelgeuse. Diagonally opposite it is blue-white Rigel.',
      'Hanging below the belt is a fainter line of stars: the sword. The fuzzy middle "star" is the Orion Nebula.',
      'Click on Orion in the map to complete this activity.'
    ],
    hint: 'If it is not up right now, press T and move the clock forward a few hours — or a few months. Orion is a northern-winter constellation.',
    achievement: 'orion-found'
  },
  {
    id: 'locate-jupiter',
    title: 'Locate Jupiter',
    summary: 'Planets do not twinkle. Learn to tell one from a star.',
    targetObjectId: 'jupiter',
    steps: [
      'Planets shine with a steady light, while stars twinkle. Jupiter is usually the second-brightest planet after Venus.',
      'Use the Tonight screen to see whether Jupiter is up, and at what time it is highest.',
      'Set the Time Machine to that moment, then find Jupiter on the map and click it.',
      'Check its distance in the details panel — it changes noticeably as Earth and Jupiter orbit the Sun.'
    ],
    hint: 'Jupiter is not visible every night of the year. If it is below the horizon, the Time Machine will get you to a night when it is up.',
    achievement: 'jupiter-found'
  },
  {
    id: 'north-star',
    title: 'Identify the North Star',
    summary: 'Polaris barely moves all night. Once you can find it, you always know which way is north.',
    targetObjectId: 'star:11734',
    southernTargetObjectId: 'con:Cru',
    southernNote:
      'Polaris never rises from the southern hemisphere. From there, the long axis of the Southern Cross points to the south celestial pole instead — so this activity uses Crux.',
    steps: [
      'Find the Big Dipper — seven bright stars in the shape of a saucepan, part of Ursa Major.',
      'Take the two stars at the outer end of the "pan" and follow the line they make, away from the handle.',
      'The first reasonably bright star you meet is Polaris, at the end of the Little Dipper’s handle.',
      'Click Polaris and watch its altitude in the details panel — it is almost exactly your latitude.'
    ],
    hint: 'Turn on constellation lines to see the Dipper shape drawn in.',
    achievement: 'polaris-found'
  },
  {
    id: 'find-moon',
    title: 'Find the Moon and read its phase',
    summary: 'The Moon is the one object whose appearance changes night to night.',
    targetObjectId: 'moon',
    steps: [
      'Click the Moon on the sky map. The details panel shows the illuminated fraction — how much of the disc is lit.',
      'Open the Time Machine, set the speed to one day per second, and press play. Watch the illumination run through a full cycle.',
      'A full cycle takes about 29.5 days. Notice that a bright Moon also makes the rest of the sky harder to observe.',
      'Check the Tonight screen: it warns you when moonlight will wash out faint targets.'
    ],
    hint: 'If the Moon is below the horizon, use the Time Machine to jump forward a few hours.',
    achievement: 'moon-found'
  }
]

export interface QuizQuestion {
  id: string
  question: string
  options: string[]
  answerIndex: number
  explanation: string
}

export interface Quiz {
  id: string
  title: string
  description: string
  questions: QuizQuestion[]
}

export const QUIZZES: Quiz[] = [
  {
    id: 'quiz-basics',
    title: 'Reading the sky',
    description: 'The vocabulary you need to use the rest of the app.',
    questions: [
      {
        id: 'magnitude',
        question: 'A star of magnitude 1 compared with a star of magnitude 6 is…',
        options: ['Fainter', 'Brighter', 'The same brightness', 'A different colour'],
        answerIndex: 1,
        explanation:
          'The magnitude scale runs backwards: smaller numbers mean brighter objects. Magnitude 6 is roughly the faintest the unaided eye can see under dark skies.'
      },
      {
        id: 'altitude',
        question: 'What does an altitude of 90° mean?',
        options: [
          'The object is on the horizon',
          'The object is due south',
          'The object is directly overhead',
          'The object has just set'
        ],
        answerIndex: 2,
        explanation:
          'Altitude measures the angle above the horizon: 0° is the horizon and 90° is the zenith, straight up.'
      },
      {
        id: 'azimuth',
        question: 'An object at azimuth 270° is in which direction?',
        options: ['North', 'East', 'South', 'West'],
        answerIndex: 3,
        explanation:
          'Azimuth is measured clockwise from north: 0° north, 90° east, 180° south, 270° west.'
      },
      {
        id: 'twinkle',
        question: 'Why do stars twinkle while planets usually do not?',
        options: [
          'Planets are brighter',
          'Stars are point sources, so the atmosphere disturbs their light more',
          'Planets emit their own light',
          'Stars are closer'
        ],
        answerIndex: 1,
        explanation:
          'A star is effectively a single point of light, so turbulence in the air shifts all of it at once. A planet shows a small disc, and the wobbles average out.'
      }
    ]
  },
  {
    id: 'quiz-objects',
    title: 'Objects in the sky',
    description: 'Stars, planets, clusters and galaxies — and how to tell them apart.',
    questions: [
      {
        id: 'messier',
        question: 'What is the Messier catalogue?',
        options: [
          'A list of the brightest stars',
          'A list of fuzzy objects that are not comets',
          'A list of constellations',
          'A list of satellites'
        ],
        answerIndex: 1,
        explanation:
          'Charles Messier was hunting comets and kept mistaking nebulae and clusters for them. His list of 110 "things that are not comets" turned out to be a catalogue of the finest deep-sky objects in the sky.'
      },
      {
        id: 'andromeda',
        question: 'M31, the Andromeda Galaxy, is…',
        options: [
          'A star cluster in our galaxy',
          'A cloud of gas around a dying star',
          'A separate galaxy roughly two and a half million light-years away',
          'A planet'
        ],
        answerIndex: 2,
        explanation:
          'It is the nearest large spiral galaxy and the most distant thing most people can see with the unaided eye.'
      },
      {
        id: 'opposition',
        question: 'When a planet is "at opposition", it…',
        options: [
          'Is closest to the Sun',
          'Is opposite the Sun in our sky, so it is up all night',
          'Is invisible',
          'Is moving backwards'
        ],
        answerIndex: 1,
        explanation:
          'At opposition a planet rises at sunset and sets at sunrise, and is at its closest and brightest for the year. It is the best time to observe it.'
      },
      {
        id: 'shower',
        question: 'The radiant of a meteor shower is…',
        options: [
          'The brightest meteor',
          'The point in the sky the meteors appear to come from',
          'The comet that caused it',
          'The peak hourly rate'
        ],
        answerIndex: 1,
        explanation:
          'Meteors from a shower travel on parallel paths, so perspective makes them appear to stream away from a single point. The higher that point is in your sky, the more meteors you see.'
      }
    ]
  }
]

export interface AchievementDefinition {
  id: string
  title: string
  description: string
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'first-light', title: 'First light', description: 'Opened NovaSky and finished the introduction.' },
  { id: 'orion-found', title: 'Hunter spotted', description: 'Found Orion in the sky map.' },
  { id: 'jupiter-found', title: 'Gas giant', description: 'Located Jupiter.' },
  { id: 'polaris-found', title: 'True north', description: 'Identified the pole star.' },
  { id: 'moon-found', title: 'Phase watcher', description: 'Found the Moon and read its phase.' },
  { id: 'quiz-basics', title: 'Sky literate', description: 'Passed the "Reading the sky" quiz.' },
  { id: 'quiz-objects', title: 'Object spotter', description: 'Passed the "Objects in the sky" quiz.' },
  { id: 'time-traveller', title: 'Time traveller', description: 'Used the Time Machine to look at another date.' },
  { id: 'deep-diver', title: 'Deep diver', description: 'Opened the details of a Messier object.' }
]

/** A quiz is passed at three quarters correct. */
export const QUIZ_PASS_RATIO = 0.75
