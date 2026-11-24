/** Slugs shared by the repository, routes and input schemas. */
export const SUBJECT_SLUGS = [
  "physics",
  "chemistry",
  "mathematics",
  "biology",
  "history",
  "geography",
] as const;

/** Supported question difficulty values. */
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

/** One subject in the practice catalogue. */
export type SubjectSlug = (typeof SUBJECT_SLUGS)[number];

/** A question's difficulty. */
export type Difficulty = (typeof DIFFICULTIES)[number];

/** A topic and its study summary. */
export interface Topic {
  name: string;
  summary: string;
}

/** Localized subject names and the topics taught in that subject. */
export interface Subject {
  slug: SubjectSlug;
  name: { en: string; te: string; hi: string };
  topics: readonly Topic[];
}

/** Original topic summaries for the demo question catalogue. */
export const subjects: readonly Subject[] = [
  {
    slug: "physics",
    name: { en: "Physics", te: "భౌతిక శాస్త్రం", hi: "भौतिकी" },
    topics: [
      {
        name: "Motion",
        summary:
          "Motion describes how position changes over time. Acceleration is the rate at which velocity changes.",
      },
      {
        name: "Electric circuits",
        summary:
          "A closed circuit lets electric charge flow. Ohm's law relates voltage, current and resistance.",
      },
      {
        name: "Light",
        summary:
          "Light reflects off surfaces and refracts when it passes between materials. A convex lens can focus parallel rays.",
      },
    ],
  },
  {
    slug: "chemistry",
    name: { en: "Chemistry", te: "రసాయన శాస్త్రం", hi: "रसायन विज्ञान" },
    topics: [
      {
        name: "Atoms",
        summary:
          "Protons identify an element, while neutrons distinguish its isotopes. Electrons govern much of how atoms bond.",
      },
      {
        name: "Acids and bases",
        summary:
          "The pH scale describes how acidic or basic a solution is. Acids and bases can react to form a salt and water.",
      },
      {
        name: "Mixtures",
        summary:
          "Mixtures contain substances that retain their own chemical identities. Filtration and distillation can separate their components by physical properties.",
      },
    ],
  },
  {
    slug: "mathematics",
    name: { en: "Mathematics", te: "గణితం", hi: "गणित" },
    topics: [
      {
        name: "Algebra",
        summary:
          "Algebra uses symbols to stand for numbers. Applying the same operation to both sides of an equation keeps it balanced.",
      },
      {
        name: "Geometry",
        summary:
          "Geometry studies shapes and their measurements. Area covers a surface, while perimeter measures its boundary.",
      },
      {
        name: "Probability",
        summary:
          "Probability measures how likely an outcome is, from zero to one. For equally likely outcomes, divide favorable outcomes by all possible outcomes.",
      },
    ],
  },
  {
    slug: "biology",
    name: { en: "Biology", te: "జీవ శాస్త్రం", hi: "जीव विज्ञान" },
    topics: [
      {
        name: "Cells",
        summary:
          "Cells are the basic units of life. Their structures carry out tasks such as energy conversion and protein synthesis.",
      },
      {
        name: "Plants",
        summary:
          "Plants use photosynthesis to store light energy in sugars. Their roots absorb water, and xylem carries it through the plant.",
      },
      {
        name: "Ecosystems",
        summary:
          "An ecosystem includes organisms and their physical surroundings. Energy passes between organisms through food chains and food webs.",
      },
    ],
  },
  {
    slug: "history",
    name: { en: "History", te: "చరిత్ర", hi: "इतिहास" },
    topics: [
      {
        name: "Indus Valley",
        summary:
          "The Indus civilization built planned cities such as Harappa and Mohenjo-daro. Archaeologists study its bricks, seals and drains to understand city life.",
      },
      {
        name: "Mauryan Empire",
        summary:
          "Chandragupta Maurya founded the Mauryan Empire. Ashoka later used inscriptions to communicate policies and ethical ideas.",
      },
      {
        name: "Indian independence",
        summary:
          "India became independent in 1947 after a long struggle against British colonial rule. The movement included mass protests, political negotiations and acts of civil disobedience.",
      },
    ],
  },
  {
    slug: "geography",
    name: { en: "Geography", te: "భూగోళ శాస్త్రం", hi: "भूगोल" },
    topics: [
      {
        name: "Maps",
        summary:
          "Maps show places and their relationships at a reduced scale. Coordinates help locate places using latitude and longitude.",
      },
      {
        name: "Weather",
        summary:
          "Weather describes short-term atmospheric conditions such as temperature, rain and wind. Climate describes patterns over much longer periods.",
      },
      {
        name: "Rivers",
        summary:
          "Rivers flow downhill and can erode, transport and deposit sediment. A drainage basin is the area whose runoff feeds a river and its tributaries.",
      },
    ],
  },
];
