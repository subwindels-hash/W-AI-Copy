/**
 * Structured curriculum for every registered language.
 * Content is authored here — the teacher never invents words or grammar.
 */

import type {
  LlAssessmentItem,
  LlCefrLevel,
  LlConversationMode,
  LlGrammarRule,
  LlItemKind,
  LlLearningModule,
  LlLesson,
  LlSkill,
  LlVocabItem,
} from "@windels/shared/languageLearning";
import { requireLanguage } from "./registry.js";

export interface Lexeme {
  word: string;
  translation: string;
  pronunciation: string;
  example: string;
  exampleTranslation: string;
  category: string;
  difficulty: LlCefrLevel;
}

export interface GrammarSeed {
  title: string;
  level: LlCefrLevel;
  rule: string;
  simpleRule: string;
  examples: Array<{ target: string; explanation: string }>;
  exercise: { prompt: string; accepted: string[]; explanation: string };
}

export interface ConversationBeat {
  mode: LlConversationMode;
  teacher: string;
  expected: string[];
  natural: string;
  hint: string;
}

export interface ListeningItem {
  id: string;
  transcript: string;
  translation: string;
  prompt: string;
  accepted: string[];
  level: LlCefrLevel;
}

export interface WritingPrompt {
  id: string;
  prompt: string;
  starterVocab: string[];
  level: LlCefrLevel;
}

export interface LangPack {
  code: string;
  vocab: LlVocabItem[];
  grammar: LlGrammarRule[];
  lessons: LlLesson[];
  modules: LlLearningModule[];
  assessment: LlAssessmentItem[];
  conversations: ConversationBeat[];
  listening: ListeningItem[];
  writing: WritingPrompt[];
  greetings: string[];
}

const LEVEL_ORDER: LlCefrLevel[] = ["BEGINNER", "A1", "A2", "B1", "B2", "C1", "C2"];

export function levelIndex(level: LlCefrLevel): number {
  if (level === "NOT_STARTED") return -1;
  return LEVEL_ORDER.indexOf(level);
}

export function nextLevel(level: LlCefrLevel): LlCefrLevel | null {
  const i = levelIndex(level);
  if (i < 0) return "A1";
  return LEVEL_ORDER[i + 1] ?? null;
}

function vid(code: string, i: number): string {
  return `v_${code}_${String(i).padStart(3, "0")}`;
}
function gid(code: string, i: number): string {
  return `g_${code}_${String(i).padStart(2, "0")}`;
}
function lid(code: string, i: number): string {
  return `lsn_${code}_${String(i).padStart(2, "0")}`;
}

function buildFromLexicon(
  code: string,
  lexemes: Lexeme[],
  grammarSeeds: GrammarSeed[],
  conversations: ConversationBeat[],
  greetings: string[],
): LangPack {
  requireLanguage(code);
  const vocab: LlVocabItem[] = lexemes.map((lx, i) => ({
    id: vid(code, i),
    languageCode: code,
    word: lx.word,
    translation: lx.translation,
    pronunciation: lx.pronunciation,
    exampleSentence: lx.example,
    exampleTranslation: lx.exampleTranslation,
    difficulty: lx.difficulty,
    category: lx.category,
  }));

  const grammar: LlGrammarRule[] = grammarSeeds.map((g, i) => ({
    id: gid(code, i),
    languageCode: code,
    title: g.title,
    level: g.level,
    rule: g.rule,
    simpleRule: g.simpleRule,
    examples: g.examples,
  }));

  const categories = [...new Set(lexemes.map((l) => l.category))];
  const lessons: LlLesson[] = [];
  const modules: LlLearningModule[] = [];

  let lessonN = 0;
  let week = 1;
  for (const category of categories) {
    const items = vocab.filter((v) => v.category === category);
    const level = items[0]?.difficulty ?? "A1";
    const practice = items.slice(0, 5).map((v, i) => ({
      id: `p_${code}_${lessonN}_${i}`,
      skill: "VOCABULARY" as LlSkill,
      kind: "TRANSLATE_TO_EXPLANATION" as LlItemKind,
      prompt: `What does “${v.word}” mean?`,
      accepted: [v.translation.toLowerCase(), ...v.translation.toLowerCase().split("/").map((s) => s.trim())],
      hint: v.pronunciation,
      explanation: `“${v.word}” (${v.pronunciation}) means “${v.translation}”. Example: ${v.exampleSentence} — ${v.exampleTranslation}`,
    }));
    const lesson: LlLesson = {
      id: lid(code, lessonN),
      languageCode: code,
      moduleId: `mod_${code}_${lessonN}`,
      title: `${category[0]!.toUpperCase()}${category.slice(1)}`,
      topic: category,
      level,
      explanation: `This lesson introduces ${category} in the target language. Read each word, say it aloud, then translate it.`,
      examples: items.slice(0, 4).map((v) => ({
        target: `${v.word} — ${v.exampleSentence}`,
        explanation: `${v.translation}. ${v.exampleTranslation}`,
      })),
      practice,
      estimatedMinutes: 8,
    };
    lessons.push(lesson);
    modules.push({
      id: lesson.moduleId,
      languageCode: code,
      title: lesson.title,
      topic: category,
      level,
      skills: ["VOCABULARY", "READING"],
      lessonIds: [lesson.id],
      week,
      order: lessonN,
    });
    lessonN += 1;
    if (lessonN % 3 === 0) week += 1;
  }

  for (let i = 0; i < grammarSeeds.length; i++) {
    const g = grammarSeeds[i]!;
    const rule = grammar[i]!;
    const lesson: LlLesson = {
      id: lid(code, lessonN),
      languageCode: code,
      moduleId: `mod_${code}_${lessonN}`,
      title: g.title,
      topic: "grammar",
      level: g.level,
      explanation: g.rule,
      examples: g.examples,
      practice: [{
        id: `p_${code}_${lessonN}_0`,
        skill: "GRAMMAR",
        kind: "FILL_BLANK",
        prompt: g.exercise.prompt,
        accepted: g.exercise.accepted.map((a) => a.toLowerCase()),
        hint: g.simpleRule,
        explanation: g.exercise.explanation,
      }],
      estimatedMinutes: 10,
    };
    lessons.push(lesson);
    modules.push({
      id: lesson.moduleId,
      languageCode: code,
      title: g.title,
      topic: "grammar",
      level: g.level,
      skills: ["GRAMMAR", "WRITING"],
      lessonIds: [lesson.id],
      week,
      order: lessonN,
    });
    lessonN += 1;
    if (lessonN % 3 === 0) week += 1;
    void rule;
  }

  const assessment: LlAssessmentItem[] = [];
  const skillCycle: Array<{ skill: LlSkill; kind: LlItemKind }> = [
    { skill: "VOCABULARY", kind: "TRANSLATE_TO_EXPLANATION" },
    { skill: "READING", kind: "MULTIPLE_CHOICE" },
    { skill: "GRAMMAR", kind: "FILL_BLANK" },
    { skill: "LISTENING", kind: "LISTEN_CHOOSE" },
    { skill: "WRITING", kind: "TRANSLATE_TO_TARGET" },
    { skill: "SPEAKING", kind: "SPEAK_REPEAT" },
  ];
  vocab.forEach((v, i) => {
    const slot = skillCycle[i % skillCycle.length]!;
    const distractors = vocab.filter((x) => x.id !== v.id).slice(0, 3).map((x) => x.translation);
    const options = [v.translation, ...distractors].slice(0, 4);
    assessment.push({
      id: `q_${code}_${String(i).padStart(3, "0")}`,
      skill: slot.skill,
      level: v.difficulty,
      kind: slot.kind,
      prompt:
        slot.skill === "VOCABULARY" ? `What does “${v.word}” mean?`
          : slot.skill === "READING" ? `Read: “${v.exampleSentence}”. What is it about?`
            : slot.skill === "GRAMMAR" ? grammarSeeds[i % grammarSeeds.length]?.exercise.prompt ?? `Use “${v.word}” correctly.`
              : slot.skill === "LISTENING" ? `You hear: “${v.word}”. Choose the meaning.`
                : slot.skill === "WRITING" ? `Write the target-language word for “${v.translation}”.`
                  : `Say: “${v.word}”`,
      promptLanguage: "en",
      targetText: slot.skill === "WRITING" || slot.skill === "SPEAKING" ? v.word : v.translation,
      options: slot.kind === "MULTIPLE_CHOICE" || slot.kind === "LISTEN_CHOOSE" ? options : undefined,
      audioText: slot.skill === "LISTENING" || slot.skill === "SPEAKING" ? v.word : undefined,
    });
  });
  grammarSeeds.forEach((g, i) => {
    assessment.push({
      id: `qg_${code}_${String(i).padStart(2, "0")}`,
      skill: "GRAMMAR",
      level: g.level,
      kind: "FILL_BLANK",
      prompt: g.exercise.prompt,
      promptLanguage: "en",
      targetText: g.exercise.accepted[0],
    });
  });

  const listening: ListeningItem[] = vocab.slice(0, 8).map((v, i) => ({
    id: `lis_${code}_${String(i).padStart(2, "0")}`,
    transcript: v.exampleSentence,
    translation: v.exampleTranslation,
    prompt: `What did you hear? (meaning in English)`,
    accepted: [v.exampleTranslation.toLowerCase(), v.translation.toLowerCase()],
    level: v.difficulty,
  }));

  const writing: WritingPrompt[] = [
    {
      id: `wr_${code}_01`,
      prompt: "Write 2–4 sentences introducing yourself.",
      starterVocab: vocab.filter((v) => v.category === "greetings" || v.category === "people").slice(0, 6).map((v) => v.word),
      level: "A1",
    },
    {
      id: `wr_${code}_02`,
      prompt: "Write about a typical day or weekend.",
      starterVocab: vocab.filter((v) => v.category === "time" || v.category === "food").slice(0, 6).map((v) => v.word),
      level: "A2",
    },
  ];

  return { code, vocab, grammar, lessons, modules, assessment, conversations, listening, writing, greetings };
}

function pack(
  code: string,
  greetings: string[],
  lexemes: Lexeme[],
  grammar: GrammarSeed[],
  conversations: ConversationBeat[],
): LangPack {
  return buildFromLexicon(code, lexemes, grammar, conversations, greetings);
}

const PACKS: Record<string, LangPack> = {
  nl: pack("nl", ["Hallo", "Goedemorgen", "Hoe gaat het?"], [
    { word: "hallo", translation: "hello", pronunciation: "HAH-lo", example: "Hallo, ik heet Anna.", exampleTranslation: "Hello, my name is Anna.", category: "greetings", difficulty: "A1" },
    { word: "goedemorgen", translation: "good morning", pronunciation: "KHOO-duh-mor-khun", example: "Goedemorgen, hoe gaat het?", exampleTranslation: "Good morning, how are you?", category: "greetings", difficulty: "A1" },
    { word: "dank je", translation: "thank you", pronunciation: "dahnk yuh", example: "Dank je wel.", exampleTranslation: "Thank you very much.", category: "greetings", difficulty: "A1" },
    { word: "alsjeblieft", translation: "please / here you are", pronunciation: "ALS-yuh-bleeft", example: "Een koffie, alsjeblieft.", exampleTranslation: "A coffee, please.", category: "greetings", difficulty: "A1" },
    { word: "ja", translation: "yes", pronunciation: "yah", example: "Ja, dat klopt.", exampleTranslation: "Yes, that is correct.", category: "basics", difficulty: "A1" },
    { word: "nee", translation: "no", pronunciation: "nay", example: "Nee, dank je.", exampleTranslation: "No, thank you.", category: "basics", difficulty: "A1" },
    { word: "ik", translation: "I", pronunciation: "ik", example: "Ik woon in Amsterdam.", exampleTranslation: "I live in Amsterdam.", category: "people", difficulty: "A1" },
    { word: "jij", translation: "you (informal)", pronunciation: "yay", example: "Jij bent aardig.", exampleTranslation: "You are kind.", category: "people", difficulty: "A1" },
    { word: "water", translation: "water", pronunciation: "VAH-ter", example: "Mag ik water?", exampleTranslation: "May I have water?", category: "food", difficulty: "A1" },
    { word: "brood", translation: "bread", pronunciation: "broht", example: "Het brood is vers.", exampleTranslation: "The bread is fresh.", category: "food", difficulty: "A1" },
    { word: "koffie", translation: "coffee", pronunciation: "KOF-fee", example: "Ik drink koffie.", exampleTranslation: "I drink coffee.", category: "food", difficulty: "A1" },
    { word: "huis", translation: "house", pronunciation: "hows", example: "Ons huis is klein.", exampleTranslation: "Our house is small.", category: "places", difficulty: "A1" },
    { word: "station", translation: "station", pronunciation: "sta-SYOHN", example: "Waar is het station?", exampleTranslation: "Where is the station?", category: "places", difficulty: "A1" },
    { word: "een", translation: "one / a", pronunciation: "ayn", example: "Ik heb een boek.", exampleTranslation: "I have a book.", category: "numbers", difficulty: "A1" },
    { word: "twee", translation: "two", pronunciation: "tway", example: "Ik heb twee zussen.", exampleTranslation: "I have two sisters.", category: "numbers", difficulty: "A1" },
    { word: "vandaag", translation: "today", pronunciation: "fan-DAHKH", example: "Vandaag is het mooi weer.", exampleTranslation: "Today the weather is nice.", category: "time", difficulty: "A2" },
    { word: "morgen", translation: "tomorrow / morning", pronunciation: "MOR-khun", example: "Tot morgen.", exampleTranslation: "See you tomorrow.", category: "time", difficulty: "A2" },
    { word: "werken", translation: "to work", pronunciation: "WER-kun", example: "Ik werk in een kantoor.", exampleTranslation: "I work in an office.", category: "verbs", difficulty: "A2" },
    { word: "begrijpen", translation: "to understand", pronunciation: "buh-KHREYE-pun", example: "Ik begrijp het niet.", exampleTranslation: "I do not understand it.", category: "verbs", difficulty: "A2" },
    { word: "misschien", translation: "maybe", pronunciation: "mis-SKEEN", example: "Misschien later.", exampleTranslation: "Maybe later.", category: "basics", difficulty: "B1" },
  ], [
    { title: "Subject–verb inversion in questions", level: "A1", rule: "In Dutch yes/no questions the finite verb comes first: 'Woon je in Utrecht?' In English the helper 'do' is used instead.", simpleRule: "For a yes/no question, put the verb first: Woon je…?", examples: [{ target: "Spreek je Nederlands?", explanation: "Verb 'spreek' first, then subject 'je'." }], exercise: { prompt: "Turn into a question: 'Je woont in Utrecht.' (start with Woon)", accepted: ["woon je in utrecht?", "woon je in utrecht"], explanation: "Invert verb and subject: Woon je in Utrecht?" } },
    { title: "Modal verb + infinitive at the end", level: "A2", rule: "With kunnen/willen/moeten the second verb is an infinitive at the end: 'Ik wil koffie drinken.'", simpleRule: "Modal first, other verb last.", examples: [{ target: "Ik moet morgen werken.", explanation: "'moet' is conjugated; 'werken' stays at the end." }], exercise: { prompt: "Complete: Ik wil water ____. (drink)", accepted: ["drinken", "ik wil water drinken"], explanation: "Infinitive drinken goes last." } },
    { title: "The two Dutch 'you' forms", level: "A1", rule: "Use jij/je with friends; u is formal. Verbs agree: je bent / u bent.", simpleRule: "je = informal you, u = formal you.", examples: [{ target: "Hoe gaat het met u?", explanation: "Formal greeting." }], exercise: { prompt: "Formal 'you' in Dutch is…", accepted: ["u"], explanation: "u is the polite form." } },
  ], [
    { mode: "BEGINNER", teacher: "Hallo! Hoe gaat het?", expected: ["het gaat goed", "goed", "prima", "het gaat goed met mij"], natural: "Het gaat goed.", hint: "A natural reply is 'Het gaat goed.'" },
    { mode: "RESTAURANT", teacher: "Wat wilt u drinken?", expected: ["koffie", "water", "een koffie", "ik wil koffie"], natural: "Een koffie, alstublieft.", hint: "Name a drink plus alstublieft." },
    { mode: "TRAVEL", teacher: "Waar is het station?", expected: ["daar", "rechts", "links", "het is daar"], natural: "Het station is daar.", hint: "Point or say daar / links / rechts." },
    { mode: "EMERGENCY", teacher: "Heeft u hulp nodig?", expected: ["ja", "ja alstublieft", "ik heb hulp nodig"], natural: "Ja, ik heb hulp nodig.", hint: "Yes + ik heb hulp nodig." },
  ]),

  es: pack("es", ["Hola", "Buenos días", "¿Cómo estás?"], [
    { word: "hola", translation: "hello", pronunciation: "OH-lah", example: "Hola, me llamo Ana.", exampleTranslation: "Hello, my name is Ana.", category: "greetings", difficulty: "A1" },
    { word: "buenos días", translation: "good morning", pronunciation: "BWEH-nos DEE-as", example: "Buenos días, ¿cómo está?", exampleTranslation: "Good morning, how are you?", category: "greetings", difficulty: "A1" },
    { word: "gracias", translation: "thank you", pronunciation: "GRAH-syas", example: "Muchas gracias.", exampleTranslation: "Thank you very much.", category: "greetings", difficulty: "A1" },
    { word: "por favor", translation: "please", pronunciation: "por fah-VOR", example: "Un café, por favor.", exampleTranslation: "A coffee, please.", category: "greetings", difficulty: "A1" },
    { word: "sí", translation: "yes", pronunciation: "see", example: "Sí, es correcto.", exampleTranslation: "Yes, that is correct.", category: "basics", difficulty: "A1" },
    { word: "no", translation: "no", pronunciation: "noh", example: "No, gracias.", exampleTranslation: "No, thank you.", category: "basics", difficulty: "A1" },
    { word: "yo", translation: "I", pronunciation: "yo", example: "Yo vivo en Madrid.", exampleTranslation: "I live in Madrid.", category: "people", difficulty: "A1" },
    { word: "tú", translation: "you (informal)", pronunciation: "too", example: "Tú eres amable.", exampleTranslation: "You are kind.", category: "people", difficulty: "A1" },
    { word: "agua", translation: "water", pronunciation: "AH-gwa", example: "Quiero agua.", exampleTranslation: "I want water.", category: "food", difficulty: "A1" },
    { word: "pan", translation: "bread", pronunciation: "pahn", example: "El pan está fresco.", exampleTranslation: "The bread is fresh.", category: "food", difficulty: "A1" },
    { word: "café", translation: "coffee", pronunciation: "kah-FEH", example: "Bebo café.", exampleTranslation: "I drink coffee.", category: "food", difficulty: "A1" },
    { word: "casa", translation: "house", pronunciation: "KAH-sah", example: "Mi casa es pequeña.", exampleTranslation: "My house is small.", category: "places", difficulty: "A1" },
    { word: "estación", translation: "station", pronunciation: "es-tah-SYOHN", example: "¿Dónde está la estación?", exampleTranslation: "Where is the station?", category: "places", difficulty: "A1" },
    { word: "uno", translation: "one", pronunciation: "OO-no", example: "Tengo un libro.", exampleTranslation: "I have a book.", category: "numbers", difficulty: "A1" },
    { word: "dos", translation: "two", pronunciation: "dohs", example: "Tengo dos hermanas.", exampleTranslation: "I have two sisters.", category: "numbers", difficulty: "A1" },
    { word: "hoy", translation: "today", pronunciation: "oy", example: "Hoy hace buen tiempo.", exampleTranslation: "Today the weather is nice.", category: "time", difficulty: "A2" },
    { word: "mañana", translation: "tomorrow / morning", pronunciation: "mah-NYAH-nah", example: "Hasta mañana.", exampleTranslation: "See you tomorrow.", category: "time", difficulty: "A2" },
    { word: "trabajar", translation: "to work", pronunciation: "trah-bah-HAR", example: "Trabajo en una oficina.", exampleTranslation: "I work in an office.", category: "verbs", difficulty: "A2" },
    { word: "entender", translation: "to understand", pronunciation: "en-ten-DEHR", example: "No entiendo.", exampleTranslation: "I do not understand.", category: "verbs", difficulty: "A2" },
    { word: "quizá", translation: "maybe", pronunciation: "kee-SAH", example: "Quizá más tarde.", exampleTranslation: "Maybe later.", category: "basics", difficulty: "B1" },
  ], [
    { title: "Ser vs estar", level: "A2", rule: "ser is for identity and origin; estar is for location and temporary states.", simpleRule: "ser = what something is; estar = how/where it is.", examples: [{ target: "Soy profesor. Estoy cansado.", explanation: "Identity vs temporary state." }], exercise: { prompt: "Fill: Yo ____ en casa. (location)", accepted: ["estoy", "yo estoy en casa"], explanation: "Location uses estar: estoy." } },
    { title: "Gender of nouns", level: "A1", rule: "Most nouns ending in -o are masculine (el), -a feminine (la).", simpleRule: "el libro, la casa.", examples: [{ target: "la casa / el libro", explanation: "Match article to noun gender." }], exercise: { prompt: "The article for 'casa' is…", accepted: ["la", "la casa"], explanation: "casa is feminine: la casa." } },
    { title: "Informal vs formal you", level: "A1", rule: "tú + -as/-es verbs; usted + third person.", simpleRule: "tú with friends, usted in formal settings.", examples: [{ target: "¿Cómo estás? / ¿Cómo está usted?", explanation: "Same meaning, different register." }], exercise: { prompt: "Informal 'you' in Spanish is…", accepted: ["tú", "tu"], explanation: "tú is informal you." } },
  ], [
    { mode: "BEGINNER", teacher: "¡Hola! ¿Cómo estás?", expected: ["bien", "estoy bien", "muy bien"], natural: "Estoy bien, gracias.", hint: "Say estoy bien." },
    { mode: "RESTAURANT", teacher: "¿Qué quiere beber?", expected: ["café", "agua", "un café", "quiero agua"], natural: "Un café, por favor.", hint: "Name a drink + por favor." },
    { mode: "TRAVEL", teacher: "¿Dónde está la estación?", expected: ["allí", "a la derecha", "a la izquierda"], natural: "Está allí.", hint: "allí / derecha / izquierda." },
    { mode: "EMERGENCY", teacher: "¿Necesita ayuda?", expected: ["sí", "sí por favor", "necesito ayuda"], natural: "Sí, necesito ayuda.", hint: "Sí, necesito ayuda." },
  ]),

  it: pack("it", ["Ciao", "Buongiorno", "Come stai?"], [
    { word: "ciao", translation: "hello / bye", pronunciation: "chow", example: "Ciao, mi chiamo Luca.", exampleTranslation: "Hi, my name is Luca.", category: "greetings", difficulty: "A1" },
    { word: "buongiorno", translation: "good morning", pronunciation: "bwon-JOR-no", example: "Buongiorno, come sta?", exampleTranslation: "Good morning, how are you?", category: "greetings", difficulty: "A1" },
    { word: "grazie", translation: "thank you", pronunciation: "GRAH-tsyeh", example: "Grazie mille.", exampleTranslation: "Thank you very much.", category: "greetings", difficulty: "A1" },
    { word: "per favore", translation: "please", pronunciation: "per fah-VO-reh", example: "Un caffè, per favore.", exampleTranslation: "A coffee, please.", category: "greetings", difficulty: "A1" },
    { word: "sì", translation: "yes", pronunciation: "see", example: "Sì, esatto.", exampleTranslation: "Yes, exactly.", category: "basics", difficulty: "A1" },
    { word: "no", translation: "no", pronunciation: "noh", example: "No, grazie.", exampleTranslation: "No, thank you.", category: "basics", difficulty: "A1" },
    { word: "io", translation: "I", pronunciation: "EE-oh", example: "Io vivo a Roma.", exampleTranslation: "I live in Rome.", category: "people", difficulty: "A1" },
    { word: "tu", translation: "you (informal)", pronunciation: "too", example: "Tu sei gentile.", exampleTranslation: "You are kind.", category: "people", difficulty: "A1" },
    { word: "acqua", translation: "water", pronunciation: "AH-kwah", example: "Vorrei dell'acqua.", exampleTranslation: "I would like some water.", category: "food", difficulty: "A1" },
    { word: "pane", translation: "bread", pronunciation: "PAH-neh", example: "Il pane è fresco.", exampleTranslation: "The bread is fresh.", category: "food", difficulty: "A1" },
    { word: "caffè", translation: "coffee", pronunciation: "kaf-FEH", example: "Bevo un caffè.", exampleTranslation: "I drink a coffee.", category: "food", difficulty: "A1" },
    { word: "casa", translation: "house", pronunciation: "KAH-zah", example: "La mia casa è piccola.", exampleTranslation: "My house is small.", category: "places", difficulty: "A1" },
    { word: "stazione", translation: "station", pronunciation: "stat-TSYO-neh", example: "Dov'è la stazione?", exampleTranslation: "Where is the station?", category: "places", difficulty: "A1" },
    { word: "uno", translation: "one", pronunciation: "OO-no", example: "Ho un libro.", exampleTranslation: "I have a book.", category: "numbers", difficulty: "A1" },
    { word: "due", translation: "two", pronunciation: "DOO-eh", example: "Ho due sorelle.", exampleTranslation: "I have two sisters.", category: "numbers", difficulty: "A1" },
    { word: "oggi", translation: "today", pronunciation: "OD-jee", example: "Oggi c'è bel tempo.", exampleTranslation: "Today the weather is nice.", category: "time", difficulty: "A2" },
    { word: "domani", translation: "tomorrow", pronunciation: "do-MAH-nee", example: "A domani.", exampleTranslation: "See you tomorrow.", category: "time", difficulty: "A2" },
    { word: "lavorare", translation: "to work", pronunciation: "lah-vo-RAH-reh", example: "Lavoro in ufficio.", exampleTranslation: "I work in an office.", category: "verbs", difficulty: "A2" },
    { word: "capire", translation: "to understand", pronunciation: "kah-PEE-reh", example: "Non capisco.", exampleTranslation: "I do not understand.", category: "verbs", difficulty: "A2" },
    { word: "forse", translation: "maybe", pronunciation: "FOR-seh", example: "Forse più tardi.", exampleTranslation: "Maybe later.", category: "basics", difficulty: "B1" },
  ], [
    { title: "Definite articles", level: "A1", rule: "il/lo/la/i/gli/le agree with gender and number. Use lo before s+consonant or z.", simpleRule: "il libro, la casa, lo studente.", examples: [{ target: "il caffè / la stazione", explanation: "Masculine vs feminine." }], exercise: { prompt: "The article for 'casa' is…", accepted: ["la", "la casa"], explanation: "casa is feminine: la." } },
    { title: "Essere vs stare", level: "A2", rule: "essere for identity; stare for how someone is feeling or staying.", simpleRule: "Come stai? uses stare.", examples: [{ target: "Sono italiano. Sto bene.", explanation: "Identity vs state." }], exercise: { prompt: "Complete: Come ____? (informal how are you)", accepted: ["stai", "come stai"], explanation: "Come stai?" } },
    { title: "Formal lei", level: "A1", rule: "lei is both 'she' and formal 'you'. Verbs use third person.", simpleRule: "Formal you = lei.", examples: [{ target: "Come sta, signora?", explanation: "Formal greeting." }], exercise: { prompt: "Formal 'you' in Italian is…", accepted: ["lei"], explanation: "lei is the polite form." } },
  ], [
    { mode: "BEGINNER", teacher: "Ciao! Come stai?", expected: ["bene", "sto bene", "tutto bene"], natural: "Sto bene, grazie.", hint: "Sto bene." },
    { mode: "RESTAURANT", teacher: "Cosa desidera da bere?", expected: ["caffè", "acqua", "un caffè"], natural: "Un caffè, per favore.", hint: "Name a drink." },
    { mode: "TRAVEL", teacher: "Dov'è la stazione?", expected: ["lì", "a destra", "a sinistra"], natural: "È lì.", hint: "lì / destra / sinistra." },
    { mode: "EMERGENCY", teacher: "Ha bisogno di aiuto?", expected: ["sì", "ho bisogno di aiuto"], natural: "Sì, ho bisogno di aiuto.", hint: "Sì, ho bisogno di aiuto." },
  ]),

  fr: pack("fr", ["Bonjour", "Salut", "Comment allez-vous ?"], [
    { word: "bonjour", translation: "hello / good day", pronunciation: "bon-ZHOOR", example: "Bonjour, je m'appelle Marie.", exampleTranslation: "Hello, my name is Marie.", category: "greetings", difficulty: "A1" },
    { word: "salut", translation: "hi", pronunciation: "sah-LEW", example: "Salut, ça va ?", exampleTranslation: "Hi, how's it going?", category: "greetings", difficulty: "A1" },
    { word: "merci", translation: "thank you", pronunciation: "mair-SEE", example: "Merci beaucoup.", exampleTranslation: "Thank you very much.", category: "greetings", difficulty: "A1" },
    { word: "s'il vous plaît", translation: "please (formal)", pronunciation: "seel voo PLEH", example: "Un café, s'il vous plaît.", exampleTranslation: "A coffee, please.", category: "greetings", difficulty: "A1" },
    { word: "oui", translation: "yes", pronunciation: "wee", example: "Oui, c'est ça.", exampleTranslation: "Yes, that's it.", category: "basics", difficulty: "A1" },
    { word: "non", translation: "no", pronunciation: "nohn", example: "Non, merci.", exampleTranslation: "No, thank you.", category: "basics", difficulty: "A1" },
    { word: "je", translation: "I", pronunciation: "zhuh", example: "J'habite à Paris.", exampleTranslation: "I live in Paris.", category: "people", difficulty: "A1" },
    { word: "tu", translation: "you (informal)", pronunciation: "tew", example: "Tu es gentil.", exampleTranslation: "You are kind.", category: "people", difficulty: "A1" },
    { word: "eau", translation: "water", pronunciation: "oh", example: "Je voudrais de l'eau.", exampleTranslation: "I would like some water.", category: "food", difficulty: "A1" },
    { word: "pain", translation: "bread", pronunciation: "pan", example: "Le pain est frais.", exampleTranslation: "The bread is fresh.", category: "food", difficulty: "A1" },
    { word: "café", translation: "coffee", pronunciation: "kah-FAY", example: "Je bois un café.", exampleTranslation: "I drink a coffee.", category: "food", difficulty: "A1" },
    { word: "maison", translation: "house", pronunciation: "meh-ZOHN", example: "Ma maison est petite.", exampleTranslation: "My house is small.", category: "places", difficulty: "A1" },
    { word: "gare", translation: "station", pronunciation: "gar", example: "Où est la gare ?", exampleTranslation: "Where is the station?", category: "places", difficulty: "A1" },
    { word: "un", translation: "one / a (masc.)", pronunciation: "uhn", example: "J'ai un livre.", exampleTranslation: "I have a book.", category: "numbers", difficulty: "A1" },
    { word: "deux", translation: "two", pronunciation: "duh", example: "J'ai deux sœurs.", exampleTranslation: "I have two sisters.", category: "numbers", difficulty: "A1" },
    { word: "aujourd'hui", translation: "today", pronunciation: "oh-zhoor-DWEE", example: "Aujourd'hui il fait beau.", exampleTranslation: "Today the weather is nice.", category: "time", difficulty: "A2" },
    { word: "demain", translation: "tomorrow", pronunciation: "duh-MAN", example: "À demain.", exampleTranslation: "See you tomorrow.", category: "time", difficulty: "A2" },
    { word: "travailler", translation: "to work", pronunciation: "trah-vah-YAY", example: "Je travaille au bureau.", exampleTranslation: "I work at the office.", category: "verbs", difficulty: "A2" },
    { word: "comprendre", translation: "to understand", pronunciation: "kom-PRAHN-druh", example: "Je ne comprends pas.", exampleTranslation: "I do not understand.", category: "verbs", difficulty: "A2" },
    { word: "peut-être", translation: "maybe", pronunciation: "puh-TETR", example: "Peut-être plus tard.", exampleTranslation: "Maybe later.", category: "basics", difficulty: "B1" },
  ], [
    { title: "Articles and gender", level: "A1", rule: "le/un masculine, la/une feminine; l' before a vowel.", simpleRule: "le pain, la gare, l'eau.", examples: [{ target: "l'eau est froide", explanation: "eau is feminine but uses l'." }], exercise: { prompt: "The article for 'gare' is…", accepted: ["la", "la gare"], explanation: "gare is feminine: la gare." } },
    { title: "Ne … pas negation", level: "A1", rule: "Wrap the verb: je ne comprends pas.", simpleRule: "ne + verb + pas.", examples: [{ target: "Je ne travaille pas demain.", explanation: "Negation around travaille." }], exercise: { prompt: "Negate: Je comprends. (use ne … pas)", accepted: ["je ne comprends pas", "ne comprends pas"], explanation: "Je ne comprends pas." } },
    { title: "Tu vs vous", level: "A1", rule: "tu informal; vous formal or plural.", simpleRule: "vous with strangers.", examples: [{ target: "Comment allez-vous ?", explanation: "Formal greeting." }], exercise: { prompt: "Formal 'you' in French is…", accepted: ["vous"], explanation: "vous is formal/plural you." } },
  ], [
    { mode: "BEGINNER", teacher: "Bonjour ! Comment ça va ?", expected: ["ça va", "bien", "ça va bien"], natural: "Ça va bien, merci.", hint: "Ça va bien." },
    { mode: "RESTAURANT", teacher: "Que voulez-vous boire ?", expected: ["café", "eau", "un café"], natural: "Un café, s'il vous plaît.", hint: "Name a drink." },
    { mode: "TRAVEL", teacher: "Où est la gare ?", expected: ["là-bas", "à droite", "à gauche"], natural: "Elle est là-bas.", hint: "là-bas / droite / gauche." },
    { mode: "EMERGENCY", teacher: "Avez-vous besoin d'aide ?", expected: ["oui", "j'ai besoin d'aide"], natural: "Oui, j'ai besoin d'aide.", hint: "Oui, j'ai besoin d'aide." },
  ]),
};

function romanceLike(
  code: string,
  greetings: string[],
  words: [string, string, string, string, string][],
  extraGrammar: GrammarSeed[],
  extraConv: ConversationBeat[],
): LangPack {
  const cats = ["greetings", "greetings", "greetings", "greetings", "basics", "basics", "people", "people", "food", "food", "food", "places", "places", "numbers", "numbers", "time", "time", "verbs", "verbs", "basics"];
  const diffs: LlCefrLevel[] = ["A1", "A1", "A1", "A1", "A1", "A1", "A1", "A1", "A1", "A1", "A1", "A1", "A1", "A1", "A1", "A2", "A2", "A2", "A2", "B1"];
  const lexemes: Lexeme[] = words.map((w, i) => ({
    word: w[0],
    translation: w[1],
    pronunciation: w[2],
    example: w[3],
    exampleTranslation: w[4],
    category: cats[i] ?? "basics",
    difficulty: diffs[i] ?? "A1",
  }));
  return pack(code, greetings, lexemes, extraGrammar, extraConv);
}

PACKS.de = romanceLike("de", ["Hallo", "Guten Morgen", "Wie geht's?"], [
  ["hallo", "hello", "HAH-lo", "Hallo, ich heiße Anna.", "Hello, my name is Anna."],
  ["guten Morgen", "good morning", "GOO-ten MOR-gen", "Guten Morgen, wie geht es Ihnen?", "Good morning, how are you?"],
  ["danke", "thank you", "DAHN-kuh", "Vielen Dank.", "Thank you very much."],
  ["bitte", "please / you're welcome", "BIT-tuh", "Einen Kaffee, bitte.", "A coffee, please."],
  ["ja", "yes", "yah", "Ja, das stimmt.", "Yes, that is right."],
  ["nein", "no", "nine", "Nein, danke.", "No, thank you."],
  ["ich", "I", "ikh", "Ich wohne in Berlin.", "I live in Berlin."],
  ["du", "you (informal)", "doo", "Du bist nett.", "You are nice."],
  ["Wasser", "water", "VAS-ser", "Ich möchte Wasser.", "I would like water."],
  ["Brot", "bread", "broht", "Das Brot ist frisch.", "The bread is fresh."],
  ["Kaffee", "coffee", "KAH-fay", "Ich trinke Kaffee.", "I drink coffee."],
  ["Haus", "house", "house", "Unser Haus ist klein.", "Our house is small."],
  ["Bahnhof", "station", "BAHN-hohf", "Wo ist der Bahnhof?", "Where is the station?"],
  ["eins", "one", "eyns", "Ich habe ein Buch.", "I have a book."],
  ["zwei", "two", "tsvy", "Ich habe zwei Schwestern.", "I have two sisters."],
  ["heute", "today", "HOY-tuh", "Heute ist schönes Wetter.", "Today the weather is nice."],
  ["morgen", "tomorrow", "MOR-gen", "Bis morgen.", "See you tomorrow."],
  ["arbeiten", "to work", "AR-bye-ten", "Ich arbeite im Büro.", "I work in the office."],
  ["verstehen", "to understand", "fer-SHTAY-en", "Ich verstehe nicht.", "I do not understand."],
  ["vielleicht", "maybe", "fee-LYEKHT", "Vielleicht später.", "Maybe later."],
], [
  { title: "V2 word order", level: "A1", rule: "The finite verb is the second element in a main clause: Heute gehe ich.", simpleRule: "Verb stays in position 2.", examples: [{ target: "Heute gehe ich zur Arbeit.", explanation: "Heute is first; gehe is second." }], exercise: { prompt: "Complete with the verb second: Heute ____ ich. (go = gehe)", accepted: ["gehe", "heute gehe ich"], explanation: "Heute gehe ich." } },
  { title: "Nominative articles", level: "A1", rule: "der (masc), die (fem), das (neut) in nominative singular.", simpleRule: "der Bahnhof, die Frau, das Haus.", examples: [{ target: "der Kaffee / das Wasser", explanation: "Gender is lexical — learn with the noun." }], exercise: { prompt: "The article for 'Bahnhof' is…", accepted: ["der", "der bahnhof"], explanation: "Bahnhof is masculine: der." } },
  { title: "du vs Sie", level: "A1", rule: "du informal; Sie formal (always capital).", simpleRule: "Sie with strangers.", examples: [{ target: "Wie geht es Ihnen?", explanation: "Formal dative Ihnen." }], exercise: { prompt: "Formal 'you' in German is…", accepted: ["sie"], explanation: "Sie is the polite form." } },
], [
  { mode: "BEGINNER", teacher: "Hallo! Wie geht's?", expected: ["gut", "mir geht es gut", "gut danke"], natural: "Mir geht's gut.", hint: "Mir geht's gut." },
  { mode: "RESTAURANT", teacher: "Was möchten Sie trinken?", expected: ["kaffee", "wasser", "einen kaffee"], natural: "Einen Kaffee, bitte.", hint: "Name a drink + bitte." },
  { mode: "TRAVEL", teacher: "Wo ist der Bahnhof?", expected: ["dort", "rechts", "links"], natural: "Der Bahnhof ist dort.", hint: "dort / rechts / links." },
  { mode: "EMERGENCY", teacher: "Brauchen Sie Hilfe?", expected: ["ja", "ich brauche hilfe"], natural: "Ja, ich brauche Hilfe.", hint: "Ja, ich brauche Hilfe." },
]);

PACKS.en = romanceLike("en", ["Hello", "Good morning", "How are you?"], [
  ["hello", "hello", "heh-LOH", "Hello, my name is Sam.", "Hello, my name is Sam."],
  ["good morning", "good morning", "good MOR-ning", "Good morning, how are you?", "Good morning, how are you?"],
  ["thank you", "thank you", "THANK yoo", "Thank you very much.", "Thank you very much."],
  ["please", "please", "pleez", "A coffee, please.", "A coffee, please."],
  ["yes", "yes", "yes", "Yes, that is right.", "Yes, that is right."],
  ["no", "no", "noh", "No, thank you.", "No, thank you."],
  ["I", "I", "eye", "I live in London.", "I live in London."],
  ["you", "you", "yoo", "You are kind.", "You are kind."],
  ["water", "water", "WAH-ter", "I would like water.", "I would like water."],
  ["bread", "bread", "bred", "The bread is fresh.", "The bread is fresh."],
  ["coffee", "coffee", "KAW-fee", "I drink coffee.", "I drink coffee."],
  ["house", "house", "hows", "My house is small.", "My house is small."],
  ["station", "station", "STAY-shun", "Where is the station?", "Where is the station?"],
  ["one", "one", "wun", "I have one book.", "I have one book."],
  ["two", "two", "too", "I have two sisters.", "I have two sisters."],
  ["today", "today", "tuh-DAY", "Today the weather is nice.", "Today the weather is nice."],
  ["tomorrow", "tomorrow", "tuh-MOR-oh", "See you tomorrow.", "See you tomorrow."],
  ["work", "to work", "wurk", "I work in an office.", "I work in an office."],
  ["understand", "to understand", "un-der-STAND", "I do not understand.", "I do not understand."],
  ["maybe", "maybe", "MAY-bee", "Maybe later.", "Maybe later."],
], [
  { title: "Do-support in questions", level: "A1", rule: "English yes/no questions use do/does: Do you live here?", simpleRule: "Do + subject + verb.", examples: [{ target: "Do you speak English?", explanation: "Do comes first." }], exercise: { prompt: "Make a question: You live here. (start with Do)", accepted: ["do you live here?", "do you live here"], explanation: "Do you live here?" } },
  { title: "Simple present -s", level: "A1", rule: "Third person singular adds -s: she works.", simpleRule: "he/she/it + verb-s.", examples: [{ target: "She works in London.", explanation: "works, not work." }], exercise: { prompt: "He ____ coffee. (drink)", accepted: ["drinks", "he drinks coffee"], explanation: "Third person: drinks." } },
  { title: "Articles a/an/the", level: "A1", rule: "a before consonant sound, an before vowel sound, the when specific.", simpleRule: "a book, an apple, the station.", examples: [{ target: "an office / a house", explanation: "Sound, not spelling, decides a/an." }], exercise: { prompt: "Choose a or an: ____ apple", accepted: ["an", "an apple"], explanation: "apple starts with a vowel sound: an." } },
], [
  { mode: "BEGINNER", teacher: "Hello! How are you?", expected: ["i'm fine", "i am fine", "good", "fine thanks"], natural: "I'm fine, thank you.", hint: "I'm fine, thank you." },
  { mode: "RESTAURANT", teacher: "What would you like to drink?", expected: ["coffee", "water", "a coffee please"], natural: "A coffee, please.", hint: "Name a drink + please." },
  { mode: "TRAVEL", teacher: "Where is the station?", expected: ["over there", "on the right", "on the left"], natural: "It's over there.", hint: "over there / left / right." },
  { mode: "EMERGENCY", teacher: "Do you need help?", expected: ["yes", "yes please", "i need help"], natural: "Yes, I need help.", hint: "Yes, I need help." },
]);

PACKS.pt = romanceLike("pt", ["Olá", "Bom dia", "Como está?"], [
  ["olá", "hello", "oh-LAH", "Olá, eu me chamo Ana.", "Hello, my name is Ana."],
  ["bom dia", "good morning", "bohn DEE-ah", "Bom dia, tudo bem?", "Good morning, all well?"],
  ["obrigado", "thank you (masc.)", "oh-bree-GAH-doo", "Muito obrigado.", "Thank you very much."],
  ["por favor", "please", "poor fah-VOR", "Um café, por favor.", "A coffee, please."],
  ["sim", "yes", "seeng", "Sim, está certo.", "Yes, that is right."],
  ["não", "no", "nowng", "Não, obrigado.", "No, thank you."],
  ["eu", "I", "eh-oo", "Eu moro em Lisboa.", "I live in Lisbon."],
  ["tu", "you (informal)", "too", "Tu és gentil.", "You are kind."],
  ["água", "water", "AH-gwa", "Quero água.", "I want water."],
  ["pão", "bread", "powng", "O pão está fresco.", "The bread is fresh."],
  ["café", "coffee", "kah-FEH", "Eu bebo café.", "I drink coffee."],
  ["casa", "house", "KAH-zah", "A minha casa é pequena.", "My house is small."],
  ["estação", "station", "esh-tah-SOWNG", "Onde fica a estação?", "Where is the station?"],
  ["um", "one / a", "oong", "Eu tenho um livro.", "I have a book."],
  ["dois", "two", "doysh", "Eu tenho duas irmãs.", "I have two sisters."],
  ["hoje", "today", "OH-zheh", "Hoje está bom tempo.", "Today the weather is nice."],
  ["amanhã", "tomorrow", "ah-mah-NYAHNG", "Até amanhã.", "See you tomorrow."],
  ["trabalhar", "to work", "trah-bah-LYAR", "Eu trabalho no escritório.", "I work in the office."],
  ["entender", "to understand", "en-ten-DEHR", "Eu não entendo.", "I do not understand."],
  ["talvez", "maybe", "tal-VEZH", "Talvez mais tarde.", "Maybe later."],
], [
  { title: "Obrigado / obrigada", level: "A1", rule: "Speakers use obrigado (masc.) or obrigada (fem.) to agree with themselves, not the listener.", simpleRule: "Match thank-you to your own gender.", examples: [{ target: "Muito obrigada.", explanation: "A woman speaking." }], exercise: { prompt: "A man saying thank you uses…", accepted: ["obrigado"], explanation: "obrigado agrees with a male speaker." } },
  { title: "Ser vs estar", level: "A2", rule: "ser for identity; estar for location and states.", simpleRule: "estar for location.", examples: [{ target: "Estou em casa.", explanation: "Location uses estar." }], exercise: { prompt: "Fill: Eu ____ em casa. (location)", accepted: ["estou", "eu estou em casa"], explanation: "Location: estou." } },
  { title: "Articles", level: "A1", rule: "o/os masculine, a/as feminine.", simpleRule: "o pão, a casa.", examples: [{ target: "a estação / o café", explanation: "Learn gender with the noun." }], exercise: { prompt: "The article for 'casa' is…", accepted: ["a", "a casa"], explanation: "casa is feminine: a." } },
], [
  { mode: "BEGINNER", teacher: "Olá! Tudo bem?", expected: ["tudo bem", "bem", "tudo bem e você"], natural: "Tudo bem, obrigado.", hint: "Tudo bem." },
  { mode: "RESTAURANT", teacher: "O que deseja beber?", expected: ["café", "água", "um café"], natural: "Um café, por favor.", hint: "Name a drink." },
  { mode: "TRAVEL", teacher: "Onde fica a estação?", expected: ["ali", "à direita", "à esquerda"], natural: "Fica ali.", hint: "ali / direita / esquerda." },
  { mode: "EMERGENCY", teacher: "Precisa de ajuda?", expected: ["sim", "preciso de ajuda"], natural: "Sim, preciso de ajuda.", hint: "Sim, preciso de ajuda." },
]);

PACKS.ar = romanceLike("ar", ["مرحبا", "صباح الخير", "كيف حالك؟"], [
  ["مرحبا", "hello", "mar-HA-ban", "مرحبا، اسمي سارة.", "Hello, my name is Sarah."],
  ["صباح الخير", "good morning", "sa-BAH el-KHEIR", "صباح الخير، كيف حالك؟", "Good morning, how are you?"],
  ["شكرا", "thank you", "SHUK-ran", "شكرا جزيلا.", "Thank you very much."],
  ["من فضلك", "please", "min FAD-lak", "قهوة من فضلك.", "Coffee, please."],
  ["نعم", "yes", "NA-am", "نعم، هذا صحيح.", "Yes, that is correct."],
  ["لا", "no", "laa", "لا، شكرا.", "No, thank you."],
  ["أنا", "I", "a-NA", "أنا أسكن في القاهرة.", "I live in Cairo."],
  ["أنت", "you (masc. informal)", "AN-ta", "أنت لطيف.", "You are kind."],
  ["ماء", "water", "maa", "أريد ماء.", "I want water."],
  ["خبز", "bread", "khubz", "الخبز طازج.", "The bread is fresh."],
  ["قهوة", "coffee", "QAH-wa", "أشرب قهوة.", "I drink coffee."],
  ["بيت", "house", "bayt", "بيتي صغير.", "My house is small."],
  ["محطة", "station", "ma-HAT-ta", "أين المحطة؟", "Where is the station?"],
  ["واحد", "one", "WAA-hid", "عندي كتاب واحد.", "I have one book."],
  ["اثنان", "two", "ith-NAAN", "عندي أختان.", "I have two sisters."],
  ["اليوم", "today", "al-YOWM", "اليوم الطقس جميل.", "Today the weather is nice."],
  ["غدا", "tomorrow", "GHA-dan", "إلى الغد.", "See you tomorrow."],
  ["يعمل", "to work", "YA-mal", "أعمل في مكتب.", "I work in an office."],
  ["يفهم", "to understand", "YAF-ham", "لا أفهم.", "I do not understand."],
  ["ربما", "maybe", "RU-ba-ma", "ربما لاحقا.", "Maybe later."],
], [
  { title: "The definite article ال", level: "A1", rule: "Arabic attaches ال to the noun: البيت = the house.", simpleRule: "ال + noun = the noun.", examples: [{ target: "القهوة / الماء", explanation: "Article is prefixed." }], exercise: { prompt: "Write 'the house' using بيت", accepted: ["البيت"], explanation: "ال + بيت = البيت." } },
  { title: "Equational sentences", level: "A1", rule: "Present-tense 'to be' is usually omitted: أنا معلم.", simpleRule: "No present-tense is/am/are.", examples: [{ target: "أنا في البيت.", explanation: "I (am) in the house." }], exercise: { prompt: "Translate without a 'be' verb: I a teacher → أنا ____", accepted: ["معلم", "أنا معلم", "معلمة", "أنا معلمة"], explanation: "أنا معلم / أنا معلمة." } },
  { title: "RTL script", level: "A1", rule: "Arabic is written right-to-left. Letters change shape by position.", simpleRule: "Read from the right.", examples: [{ target: "مرحبا", explanation: "Starts on the right." }], exercise: { prompt: "Arabic text direction is… (LTR or RTL)", accepted: ["rtl"], explanation: "Arabic is RTL." } },
], [
  { mode: "BEGINNER", teacher: "مرحبا! كيف حالك؟", expected: ["بخير", "أنا بخير", "الحمد لله"], natural: "أنا بخير، شكرا.", hint: "أنا بخير." },
  { mode: "RESTAURANT", teacher: "ماذا تريد أن تشرب؟", expected: ["قهوة", "ماء", "أريد قهوة"], natural: "قهوة من فضلك.", hint: "قهوة من فضلك." },
  { mode: "TRAVEL", teacher: "أين المحطة؟", expected: ["هناك", "على اليمين", "على اليسار"], natural: "هناك.", hint: "هناك / يمين / يسار." },
  { mode: "EMERGENCY", teacher: "هل تحتاج مساعدة؟", expected: ["نعم", "نعم من فضلك", "أحتاج مساعدة"], natural: "نعم، أحتاج مساعدة.", hint: "نعم، أحتاج مساعدة." },
]);

PACKS.zh = romanceLike("zh", ["你好", "早上好", "你好吗？"], [
  ["你好", "hello", "nǐ hǎo", "你好，我叫李明。", "Hello, my name is Li Ming."],
  ["早上好", "good morning", "zǎo shang hǎo", "早上好，你好吗？", "Good morning, how are you?"],
  ["谢谢", "thank you", "xiè xie", "非常感谢。", "Thank you very much."],
  ["请", "please", "qǐng", "请给我一杯咖啡。", "Please give me a coffee."],
  ["是", "yes / to be", "shì", "是的，没错。", "Yes, that's right."],
  ["不", "no / not", "bù", "不，谢谢。", "No, thank you."],
  ["我", "I / me", "wǒ", "我住在北京。", "I live in Beijing."],
  ["你", "you", "nǐ", "你很好。", "You are very good/kind."],
  ["水", "water", "shuǐ", "我要水。", "I want water."],
  ["面包", "bread", "miàn bāo", "面包很新鲜。", "The bread is fresh."],
  ["咖啡", "coffee", "kā fēi", "我喝咖啡。", "I drink coffee."],
  ["家", "home / house", "jiā", "我家很小。", "My home is small."],
  ["车站", "station", "chē zhàn", "车站在哪里？", "Where is the station?"],
  ["一", "one", "yī", "我有一本书。", "I have one book."],
  ["二", "two", "èr", "我有两个姐姐。", "I have two older sisters."],
  ["今天", "today", "jīn tiān", "今天天气很好。", "Today the weather is nice."],
  ["明天", "tomorrow", "míng tiān", "明天见。", "See you tomorrow."],
  ["工作", "to work / job", "gōng zuò", "我在办公室工作。", "I work in an office."],
  ["懂", "to understand", "dǒng", "我听不懂。", "I do not understand (what I hear)."],
  ["也许", "maybe", "yě xǔ", "也许以后。", "Maybe later."],
], [
  { title: "No conjugation", level: "A1", rule: "Verbs do not change for person or tense. Time words mark when: 我明天工作.", simpleRule: "Same verb for I/you/he; add time words.", examples: [{ target: "我工作。他工作。", explanation: "工作 stays the same." }], exercise: { prompt: "The verb 'work' for 'he' is still…", accepted: ["工作", "gong zuo", "gōng zuò"], explanation: "No conjugation: 工作." } },
  { title: "Measure words", level: "A2", rule: "Numbers need a classifier: 一杯咖啡, 一本书.", simpleRule: "number + measure + noun.", examples: [{ target: "一杯水", explanation: "杯 is the measure for cups of liquid." }], exercise: { prompt: "Complete: 一____咖啡 (cup measure)", accepted: ["杯", "一杯咖啡"], explanation: "一杯咖啡." } },
  { title: "Question particle 吗", level: "A1", rule: "Add 吗 to a statement to make a yes/no question.", simpleRule: "Statement + 吗？", examples: [{ target: "你好吗？", explanation: "你好 + 吗." }], exercise: { prompt: "Turn 你好 into a question", accepted: ["你好吗", "你好吗？"], explanation: "你好吗？" } },
], [
  { mode: "BEGINNER", teacher: "你好！你好吗？", expected: ["我很好", "很好", "还好"], natural: "我很好，谢谢。", hint: "我很好。" },
  { mode: "RESTAURANT", teacher: "你想喝什么？", expected: ["咖啡", "水", "一杯咖啡"], natural: "一杯咖啡，谢谢。", hint: "一杯咖啡。" },
  { mode: "TRAVEL", teacher: "车站在哪里？", expected: ["在那儿", "在右边", "在左边"], natural: "在那儿。", hint: "在那儿。" },
  { mode: "EMERGENCY", teacher: "你需要帮助吗？", expected: ["需要", "是", "我需要帮助"], natural: "是的，我需要帮助。", hint: "我需要帮助。" },
]);

PACKS.ja = romanceLike("ja", ["こんにちは", "おはよう", "お元気ですか？"], [
  ["こんにちは", "hello", "kon-ni-chi-wa", "こんにちは、田中です。", "Hello, I am Tanaka."],
  ["おはよう", "good morning", "o-ha-YOH", "おはようございます。", "Good morning (polite)."],
  ["ありがとう", "thank you", "a-ri-GA-toh", "ありがとうございます。", "Thank you very much."],
  ["ください", "please (give me)", "ku-da-SAI", "コーヒーをください。", "Coffee, please."],
  ["はい", "yes", "hai", "はい、そうです。", "Yes, that is so."],
  ["いいえ", "no", "i-i-e", "いいえ、結構です。", "No, I'm fine."],
  ["わたし", "I", "wa-ta-shi", "わたしは東京に住んでいます。", "I live in Tokyo."],
  ["あなた", "you", "a-NA-ta", "あなたはやさしいです。", "You are kind."],
  ["みず", "water", "mi-zu", "みずをください。", "Water, please."],
  ["パン", "bread", "pan", "パンは新しいです。", "The bread is fresh."],
  ["コーヒー", "coffee", "KO-hi", "コーヒーを飲みます。", "I drink coffee."],
  ["いえ", "house", "i-e", "いえは小さいです。", "The house is small."],
  ["えき", "station", "e-ki", "えきはどこですか？", "Where is the station?"],
  ["いち", "one", "i-chi", "ほんが 一さつ あります。", "I have one book."],
  ["に", "two", "ni", "あねが ふたり います。", "I have two older sisters."],
  ["きょう", "today", "kyoh", "きょうは いい てんき です。", "Today the weather is nice."],
  ["あした", "tomorrow", "a-shi-ta", "また あした。", "See you tomorrow."],
  ["はたらく", "to work", "ha-ta-ra-ku", "じむしょで はたらきます。", "I work at an office."],
  ["わかる", "to understand", "wa-ka-ru", "わかりません。", "I do not understand."],
  ["たぶん", "maybe", "ta-BUN", "たぶん あとで。", "Maybe later."],
], [
  { title: "The particle は", level: "A1", rule: "は (wa) marks the topic: わたしは学生です.", simpleRule: "X は Y です = As for X, it is Y.", examples: [{ target: "これは本です。", explanation: "This (topic) is a book." }], exercise: { prompt: "Topic particle pronounced 'wa' is written…", accepted: ["は"], explanation: "は is read wa as a topic marker." } },
  { title: "です / ます politeness", level: "A1", rule: "Add です after nouns/adjectives and ます after verbs for polite speech.", simpleRule: "です after nouns, ます after verbs.", examples: [{ target: "コーヒーを飲みます。", explanation: "Polite verb ending." }], exercise: { prompt: "Polite 'it is' copula is…", accepted: ["です"], explanation: "です is the polite copula." } },
  { title: "Question か", level: "A1", rule: "Add か to make a question: 学生ですか？", simpleRule: "Statement + か.", examples: [{ target: "わかりますか？", explanation: "Do you understand?" }], exercise: { prompt: "Add the question particle to わかります", accepted: ["わかりますか", "わかりますか？"], explanation: "わかりますか？" } },
], [
  { mode: "BEGINNER", teacher: "こんにちは！お元気ですか？", expected: ["げんきです", "はい", "元気です"], natural: "はい、元気です。", hint: "元気です。" },
  { mode: "RESTAURANT", teacher: "何を飲みますか？", expected: ["コーヒー", "みず", "コーヒーをください"], natural: "コーヒーをください。", hint: "コーヒーをください。" },
  { mode: "TRAVEL", teacher: "えきはどこですか？", expected: ["あそこです", "みぎです", "ひだりです"], natural: "あそこです。", hint: "あそこです。" },
  { mode: "EMERGENCY", teacher: "助けが必要ですか？", expected: ["はい", "助けて", "必要です"], natural: "はい、助けが必要です。", hint: "はい、助けが必要です。" },
]);

PACKS.ko = romanceLike("ko", ["안녕하세요", "좋은 아침입니다", "잘 지내세요?"], [
  ["안녕하세요", "hello", "an-nyeong-ha-se-yo", "안녕하세요, 저는 민수입니다.", "Hello, I am Minsu."],
  ["좋은 아침", "good morning", "jo-eun a-chim", "좋은 아침입니다.", "Good morning."],
  ["감사합니다", "thank you", "gam-sa-ham-ni-da", "정말 감사합니다.", "Thank you very much."],
  ["주세요", "please give me", "ju-se-yo", "커피 주세요.", "Coffee, please."],
  ["네", "yes", "ne", "네, 맞아요.", "Yes, that's right."],
  ["아니요", "no", "a-ni-yo", "아니요, 괜찮아요.", "No, I'm fine."],
  ["저", "I (humble)", "jeo", "저는 서울에 살아요.", "I live in Seoul."],
  ["당신", "you", "dang-sin", "당신은 친절해요.", "You are kind."],
  ["물", "water", "mul", "물 주세요.", "Water, please."],
  ["빵", "bread", "ppang", "빵이 신선해요.", "The bread is fresh."],
  ["커피", "coffee", "keo-pi", "커피를 마셔요.", "I drink coffee."],
  ["집", "house", "jip", "우리 집은 작아요.", "Our house is small."],
  ["역", "station", "yeok", "역이 어디예요?", "Where is the station?"],
  ["하나", "one", "ha-na", "책이 한 권 있어요.", "I have one book."],
  ["둘", "two", "dul", "언니가 두 명 있어요.", "I have two older sisters."],
  ["오늘", "today", "o-neul", "오늘 날씨가 좋아요.", "Today the weather is nice."],
  ["내일", "tomorrow", "nae-il", "내일 봐요.", "See you tomorrow."],
  ["일하다", "to work", "il-ha-da", "사무실에서 일해요.", "I work at an office."],
  ["이해하다", "to understand", "i-hae-ha-da", "이해하지 못해요.", "I do not understand."],
  ["아마", "maybe", "a-ma", "아마 나중에.", "Maybe later."],
], [
  { title: "Topic particle 은/는", level: "A1", rule: "은 after a consonant, 는 after a vowel: 저는, 물은.", simpleRule: "은/는 marks the topic.", examples: [{ target: "저는 학생이에요.", explanation: "저 + 는." }], exercise: { prompt: "Topic particle after 저 is…", accepted: ["는", "저는"], explanation: "저 ends in a vowel: 는." } },
  { title: "Polite 요 ending", level: "A1", rule: "Everyday polite speech ends verbs with 요: 가요, 먹어요.", simpleRule: "Add 요 to be polite.", examples: [{ target: "커피 주세요.", explanation: "주세요 is a polite request." }], exercise: { prompt: "Polite request ending often is…", accepted: ["요", "주세요"], explanation: "요 marks polite speech." } },
  { title: "Yes and no", level: "A1", rule: "네 = yes, 아니요 = no. 네 also means 'I hear you'.", simpleRule: "네 / 아니요.", examples: [{ target: "네, 감사합니다.", explanation: "Yes + thank you." }], exercise: { prompt: "Korean for yes is…", accepted: ["네"], explanation: "네." } },
], [
  { mode: "BEGINNER", teacher: "안녕하세요! 잘 지내세요?", expected: ["네", "잘 지내요", "좋아요"], natural: "네, 잘 지내요.", hint: "잘 지내요." },
  { mode: "RESTAURANT", teacher: "뭐 드릴까요?", expected: ["커피", "물", "커피 주세요"], natural: "커피 주세요.", hint: "커피 주세요." },
  { mode: "TRAVEL", teacher: "역이 어디예요?", expected: ["저기요", "오른쪽", "왼쪽"], natural: "저기요.", hint: "저기요." },
  { mode: "EMERGENCY", teacher: "도움이 필요하세요?", expected: ["네", "도와주세요", "필요해요"], natural: "네, 도와주세요.", hint: "도와주세요." },
]);

PACKS.ru = romanceLike("ru", ["Здравствуйте", "Доброе утро", "Как дела?"], [
  ["привет", "hi", "pri-VYET", "Привет, меня зовут Анна.", "Hi, my name is Anna."],
  ["доброе утро", "good morning", "DOB-ra-ye OO-tra", "Доброе утро, как дела?", "Good morning, how are you?"],
  ["спасибо", "thank you", "spa-SEE-ba", "Большое спасибо.", "Thank you very much."],
  ["пожалуйста", "please / you're welcome", "pa-ZHAL-sta", "Кофе, пожалуйста.", "Coffee, please."],
  ["да", "yes", "da", "Да, верно.", "Yes, correct."],
  ["нет", "no", "nyet", "Нет, спасибо.", "No, thank you."],
  ["я", "I", "ya", "Я живу в Москве.", "I live in Moscow."],
  ["ты", "you (informal)", "ty", "Ты добрый.", "You are kind."],
  ["вода", "water", "va-DA", "Мне воду.", "Water for me."],
  ["хлеб", "bread", "khlyeb", "Хлеб свежий.", "The bread is fresh."],
  ["кофе", "coffee", "KO-fye", "Я пью кофе.", "I drink coffee."],
  ["дом", "house", "dom", "Наш дом маленький.", "Our house is small."],
  ["вокзал", "station", "vag-ZAL", "Где вокзал?", "Where is the station?"],
  ["один", "one (masc.)", "a-DEEN", "У меня одна книга.", "I have one book."],
  ["два", "two", "dva", "У меня две сестры.", "I have two sisters."],
  ["сегодня", "today", "sye-VOD-nya", "Сегодня хорошая погода.", "Today the weather is nice."],
  ["завтра", "tomorrow", "ZAF-tra", "До завтра.", "See you tomorrow."],
  ["работать", "to work", "ra-BO-tat", "Я работаю в офисе.", "I work in an office."],
  ["понимать", "to understand", "pa-ni-MAT", "Я не понимаю.", "I do not understand."],
  ["может быть", "maybe", "MO-zhet byt", "Может быть позже.", "Maybe later."],
], [
  { title: "No present-tense 'to be'", level: "A1", rule: "In the present tense быть is omitted: Я студент.", simpleRule: "I student = I am a student.", examples: [{ target: "Это дом.", explanation: "This (is) a house." }], exercise: { prompt: "Present-tense 'am/is' is usually…", accepted: ["omitted", "nothing", "zero", "не ставится"], explanation: "It is omitted." } },
  { title: "ты vs вы", level: "A1", rule: "ты informal; вы formal or plural.", simpleRule: "вы with strangers.", examples: [{ target: "Как вы?", explanation: "Formal how are you." }], exercise: { prompt: "Formal 'you' in Russian is…", accepted: ["вы"], explanation: "вы." } },
  { title: "Не negation", level: "A1", rule: "Put не before the verb: Я не понимаю.", simpleRule: "не + verb.", examples: [{ target: "Я не работаю сегодня.", explanation: "не before работаю." }], exercise: { prompt: "Negate понимаю", accepted: ["не понимаю", "я не понимаю"], explanation: "не понимаю." } },
], [
  { mode: "BEGINNER", teacher: "Привет! Как дела?", expected: ["хорошо", "нормально", "отлично"], natural: "Хорошо, спасибо.", hint: "Хорошо." },
  { mode: "RESTAURANT", teacher: "Что будете пить?", expected: ["кофе", "воду", "воду пожалуйста"], natural: "Кофе, пожалуйста.", hint: "Кофе, пожалуйста." },
  { mode: "TRAVEL", teacher: "Где вокзал?", expected: ["там", "направо", "налево"], natural: "Там.", hint: "там / направо / налево." },
  { mode: "EMERGENCY", teacher: "Вам нужна помощь?", expected: ["да", "да нужна", "нужна помощь"], natural: "Да, нужна помощь.", hint: "Да, нужна помощь." },
]);

PACKS.hi = romanceLike("hi", ["नमस्ते", "सुप्रभात", "आप कैसे हैं?"], [
  ["नमस्ते", "hello", "na-mas-TAY", "नमस्ते, मेरा नाम अनिल है।", "Hello, my name is Anil."],
  ["सुप्रभात", "good morning", "su-pra-BHAAT", "सुप्रभात, कैसे हैं आप?", "Good morning, how are you?"],
  ["धन्यवाद", "thank you", "dhan-ya-VAAD", "बहुत धन्यवाद।", "Thank you very much."],
  ["कृपया", "please", "KRIP-ya", "कृपया एक चाय दीजिए।", "Please give one tea."],
  ["हाँ", "yes", "haan", "हाँ, सही है।", "Yes, that is right."],
  ["नहीं", "no", "na-heen", "नहीं, धन्यवाद।", "No, thank you."],
  ["मैं", "I", "main", "मैं दिल्ली में रहता हूँ।", "I live in Delhi."],
  ["तुम", "you (informal)", "tum", "तुम अच्छे हो।", "You are good/kind."],
  ["पानी", "water", "PAA-nee", "मुझे पानी चाहिए।", "I want water."],
  ["रोटी", "bread / roti", "RO-tee", "रोटी गरम है।", "The bread is hot."],
  ["चाय", "tea", "chaai", "मैं चाय पीता हूँ।", "I drink tea."],
  ["घर", "house / home", "ghar", "मेरा घर छोटा है।", "My house is small."],
  ["स्टेशन", "station", "STAY-shan", "स्टेशन कहाँ है?", "Where is the station?"],
  ["एक", "one", "ek", "मेरे पास एक किताब है।", "I have one book."],
  ["दो", "two", "do", "मेरी दो बहनें हैं।", "I have two sisters."],
  ["आज", "today", "aaj", "आज मौसम अच्छा है।", "Today the weather is nice."],
  ["कल", "tomorrow / yesterday", "kal", "कल मिलते हैं।", "See you tomorrow."],
  ["काम करना", "to work", "kaam kar-na", "मैं दफ़्तर में काम करता हूँ।", "I work in an office."],
  ["समझना", "to understand", "samajh-na", "मैं नहीं समझता।", "I do not understand."],
  ["शायद", "maybe", "SHAA-yad", "शायद बाद में।", "Maybe later."],
], [
  { title: "SOV word order", level: "A1", rule: "Hindi is subject–object–verb: मैं पानी पीता हूँ.", simpleRule: "Verb comes last.", examples: [{ target: "मैं चाय पीता हूँ।", explanation: "I tea drink." }], exercise: { prompt: "In Hindi the verb usually comes…", accepted: ["last", "at the end", "end"], explanation: "SOV: verb last." } },
  { title: "है copula", level: "A1", rule: "है = is (singular). हैं = are (plural/respect).", simpleRule: "X Y है.", examples: [{ target: "यह घर है।", explanation: "This is a house." }], exercise: { prompt: "Hindi for 'is' (singular) is…", accepted: ["है"], explanation: "है." } },
  { title: "आप vs तुम", level: "A1", rule: "आप is respectful; तुम is familiar.", simpleRule: "आप with strangers.", examples: [{ target: "आप कैसे हैं?", explanation: "Respectful how are you." }], exercise: { prompt: "Respectful 'you' is…", accepted: ["आप"], explanation: "आप." } },
], [
  { mode: "BEGINNER", teacher: "नमस्ते! कैसे हो?", expected: ["ठीक हूँ", "अच्छा हूँ", "मैं ठीक हूँ"], natural: "मैं ठीक हूँ, धन्यवाद।", hint: "मैं ठीक हूँ." },
  { mode: "RESTAURANT", teacher: "आप क्या लेंगे?", expected: ["चाय", "पानी", "चाय दीजिए"], natural: "चाय दीजिए।", hint: "चाय." },
  { mode: "TRAVEL", teacher: "स्टेशन कहाँ है?", expected: ["वहाँ", "दाएँ", "बाएँ"], natural: "वहाँ है।", hint: "वहाँ." },
  { mode: "EMERGENCY", teacher: "क्या आपको मदद चाहिए?", expected: ["हाँ", "मदद चाहिए", "हाँ मदद चाहिए"], natural: "हाँ, मदद चाहिए।", hint: "हाँ, मदद चाहिए." },
]);

PACKS.tr = romanceLike("tr", ["Merhaba", "Günaydın", "Nasılsın?"], [
  ["merhaba", "hello", "mer-HA-ba", "Merhaba, adım Elif.", "Hello, my name is Elif."],
  ["günaydın", "good morning", "gun-ay-DUN", "Günaydın, nasılsınız?", "Good morning, how are you?"],
  ["teşekkürler", "thank you", "te-shek-kur-LER", "Çok teşekkürler.", "Thank you very much."],
  ["lütfen", "please", "LUT-fen", "Bir kahve, lütfen.", "A coffee, please."],
  ["evet", "yes", "eh-VET", "Evet, doğru.", "Yes, correct."],
  ["hayır", "no", "HA-yur", "Hayır, teşekkürler.", "No, thank you."],
  ["ben", "I", "ben", "Ben İstanbul'da yaşıyorum.", "I live in Istanbul."],
  ["sen", "you (informal)", "sen", "Sen naziksin.", "You are kind."],
  ["su", "water", "soo", "Su istiyorum.", "I want water."],
  ["ekmek", "bread", "ek-MEK", "Ekmek taze.", "The bread is fresh."],
  ["kahve", "coffee", "kah-VEH", "Kahve içiyorum.", "I drink coffee."],
  ["ev", "house", "ev", "Evimiz küçük.", "Our house is small."],
  ["istasyon", "station", "is-tas-YON", "İstasyon nerede?", "Where is the station?"],
  ["bir", "one / a", "beer", "Bir kitabım var.", "I have a book."],
  ["iki", "two", "ee-kee", "İki kız kardeşim var.", "I have two sisters."],
  ["bugün", "today", "boo-GUN", "Bugün hava güzel.", "Today the weather is nice."],
  ["yarın", "tomorrow", "ya-RUN", "Yarın görüşürüz.", "See you tomorrow."],
  ["çalışmak", "to work", "cha-lish-MAK", "Ofiste çalışıyorum.", "I work in an office."],
  ["anlamak", "to understand", "an-la-MAK", "Anlamıyorum.", "I do not understand."],
  ["belki", "maybe", "BEL-kee", "Belki sonra.", "Maybe later."],
], [
  { title: "Agglutination", level: "A2", rule: "Turkish stacks suffixes: ev-ler-im-de = in my houses.", simpleRule: "Add endings to the stem.", examples: [{ target: "evimde", explanation: "ev + im + de = in my house." }], exercise: { prompt: "The Turkish word for house is…", accepted: ["ev"], explanation: "ev." } },
  { title: "No gender", level: "A1", rule: "Turkish has no grammatical gender and one word o for he/she/it.", simpleRule: "o = he/she/it.", examples: [{ target: "O çalışıyor.", explanation: "He/she is working." }], exercise: { prompt: "Turkish pronoun for he/she/it is…", accepted: ["o"], explanation: "o." } },
  { title: "Vowel harmony (intro)", level: "A2", rule: "Suffix vowels follow the last vowel of the stem: ev-de vs gün-de.", simpleRule: "Ending vowels match the word.", examples: [{ target: "evde / ofiste", explanation: "-de/-te locative." }], exercise: { prompt: "'in the house' is…", accepted: ["evde"], explanation: "ev + de = evde." } },
], [
  { mode: "BEGINNER", teacher: "Merhaba! Nasılsın?", expected: ["iyiyim", "iyi", "teşekkürler iyiyim"], natural: "İyiyim, teşekkürler.", hint: "İyiyim." },
  { mode: "RESTAURANT", teacher: "Ne içersiniz?", expected: ["kahve", "su", "bir kahve"], natural: "Bir kahve, lütfen.", hint: "Bir kahve, lütfen." },
  { mode: "TRAVEL", teacher: "İstasyon nerede?", expected: ["şurada", "sağda", "solda"], natural: "Şurada.", hint: "şurada." },
  { mode: "EMERGENCY", teacher: "Yardıma ihtiyacınız var mı?", expected: ["evet", "yardım", "evet yardım"], natural: "Evet, yardıma ihtiyacım var.", hint: "Evet." },
]);

function africanPack(
  code: string,
  greetings: string[],
  rows: [string, string, string, string, string][],
  g1: GrammarSeed,
  convHello: string,
  convReply: string[],
  drinkPrompt: string,
  drinkExpected: string[],
): LangPack {
  return romanceLike(code, greetings, rows, [
    g1,
    { title: "Yes and no", level: "A1", rule: "Learn the language's affirmative and negative particles from the lexicon and use them before adding extra words.", simpleRule: "Start answers with yes/no in the target language.", examples: [{ target: rows[4]![0], explanation: rows[4]![1] }], exercise: { prompt: `The word for yes is…`, accepted: [rows[4]![0].toLowerCase()], explanation: rows[4]![0] } },
    { title: "Polite requests", level: "A1", rule: "Pair a noun with the local word for please.", simpleRule: "item + please.", examples: [{ target: `${rows[10]![0]} ${rows[3]![0]}`, explanation: "A polite drink order." }], exercise: { prompt: `The word for please is…`, accepted: [rows[3]![0].toLowerCase()], explanation: rows[3]![0] } },
  ], [
    { mode: "BEGINNER", teacher: convHello, expected: convReply, natural: convReply[0] ?? "", hint: convReply[0] ?? "" },
    { mode: "RESTAURANT", teacher: drinkPrompt, expected: drinkExpected, natural: drinkExpected[0] ?? "", hint: drinkExpected[0] ?? "" },
    { mode: "TRAVEL", teacher: rows[12]![3], expected: ["there", rows[12]![0].toLowerCase()], natural: rows[12]![0], hint: "Name the place or point." },
    { mode: "EMERGENCY", teacher: "Need help?", expected: [rows[4]![0].toLowerCase(), "help"], natural: rows[4]![0], hint: rows[4]![0] },
  ]);
}

PACKS.sw = africanPack("sw", ["Habari", "Habari za asubuhi", "Hujambo?"], [
  ["habari", "hello / news", "ha-BA-ree", "Habari, jina langu ni Amina.", "Hello, my name is Amina."],
  ["habari za asubuhi", "good morning", "ha-BA-ree za a-su-BU-hi", "Habari za asubuhi?", "How is the morning?"],
  ["asante", "thank you", "a-SAN-teh", "Asante sana.", "Thank you very much."],
  ["tafadhali", "please", "ta-fa-DHA-li", "Kahawa, tafadhali.", "Coffee, please."],
  ["ndiyo", "yes", "NDEE-yo", "Ndiyo, sawa.", "Yes, okay."],
  ["hapana", "no", "ha-PA-na", "Hapana, asante.", "No, thank you."],
  ["mimi", "I", "MEE-mee", "Mimi ninaishi Dar es Salaam.", "I live in Dar es Salaam."],
  ["wewe", "you", "WEH-weh", "Wewe ni mwema.", "You are kind."],
  ["maji", "water", "MA-jee", "Nataka maji.", "I want water."],
  ["mkate", "bread", "m-KA-teh", "Mkate ni mbichi.", "The bread is fresh."],
  ["kahawa", "coffee", "ka-HA-wa", "Ninakunywa kahawa.", "I drink coffee."],
  ["nyumba", "house", "NYOOM-ba", "Nyumba yetu ni ndogo.", "Our house is small."],
  ["stesheni", "station", "ste-SHE-ni", "Stesheni iko wapi?", "Where is the station?"],
  ["moja", "one", "MO-ja", "Nina kitabu kimoja.", "I have one book."],
  ["mbili", "two", "m-BEE-lee", "Nina dada wawili.", "I have two sisters."],
  ["leo", "today", "LEH-o", "Leo hali ya hewa ni nzuri.", "Today the weather is nice."],
  ["kesho", "tomorrow", "KEH-sho", "Tutaonana kesho.", "See you tomorrow."],
  ["kufanya kazi", "to work", "koo-FAN-ya KA-zi", "Nanafanya kazi ofisini.", "I work in an office."],
  ["kuelewa", "to understand", "koo-eh-LEH-wa", "Sielewi.", "I do not understand."],
  ["labda", "maybe", "LAB-da", "Labda baadaye.", "Maybe later."],
], { title: "Noun classes (intro)", level: "A2", rule: "Swahili nouns belong to classes that control agreement: m-/wa- for people (mtu/watu).", simpleRule: "People often take m- singular and wa- plural.", examples: [{ target: "mtu / watu", explanation: "person / people." }], exercise: { prompt: "Swahili for I is…", accepted: ["mimi"], explanation: "mimi." } },
"Habari! Hujambo?", ["sijambo", "nzuri", "poa"], "Unataka nini?", ["kahawa", "maji", "kahawa tafadhali"]);

PACKS.yo = africanPack("yo", ["Ẹ n lẹ", "Ẹ káàárọ̀", "Báwo ni?"], [
  ["ẹ n lẹ", "hello", "eh n leh", "Ẹ n lẹ, orúkọ mi ni Ade.", "Hello, my name is Ade."],
  ["ẹ káàárọ̀", "good morning", "eh KAH-ah-raw", "Ẹ káàárọ̀, báwo ni?", "Good morning, how are you?"],
  ["ẹ ṣé", "thank you", "eh SHEH", "Ẹ ṣé gan.", "Thank you very much."],
  ["jọ̀wọ́", "please", "JAW-waw", "Kọfí, jọ̀wọ́.", "Coffee, please."],
  ["bẹ́ẹ̀ni", "yes", "beh-eh-nee", "Bẹ́ẹ̀ni, ó tọ́.", "Yes, that is right."],
  ["bẹ́ẹ̀kọ́", "no", "beh-eh-kaw", "Bẹ́ẹ̀kọ́, ẹ ṣé.", "No, thank you."],
  ["èmi", "I", "EH-mee", "Mo ń gbé ní Èkó.", "I live in Lagos."],
  ["ìwọ", "you", "ee-waw", "O ṣeun.", "You are kind."],
  ["omi", "water", "OH-mee", "Mo fẹ́ omi.", "I want water."],
  ["àkàrà", "bean cake", "ah-KAH-rah", "Àkàrà yìí dùn.", "This bean cake is tasty."],
  ["kọfí", "coffee", "KAW-fee", "Mo ń mu kọfí.", "I drink coffee."],
  ["ilé", "house", "ee-LEH", "Ilé wa kéré.", "Our house is small."],
  ["ibùdókọ̀", "station", "ee-boo-DAW-kaw", "Ibùdókọ̀ wà níbo?", "Where is the station?"],
  ["ọ̀kan", "one", "aw-kan", "Mo ní ìwé kan.", "I have one book."],
  ["èjì", "two", "eh-jee", "Mo ní àbúrò méjì.", "I have two younger siblings."],
  ["òní", "today", "aw-NEE", "Òjò ò rọ̀ lónìí.", "It is not raining today."],
  ["ọ̀la", "tomorrow", "aw-lah", "Títí di ọ̀la.", "Until tomorrow."],
  ["ṣiṣẹ́", "to work", "shee-SHEH", "Mo ń ṣiṣẹ́ ní ọ́fíìsì.", "I work in an office."],
  ["yè", "to understand", "yeh", "Mi ò yé mi.", "I do not understand."],
  ["bóyá", "maybe", "baw-YAH", "Bóyá lẹ́yìn náà.", "Maybe later."],
], { title: "Tone matters", level: "A2", rule: "Yoruba is tonal. The same letters with different tones are different words. Marks on ẹ/ọ/ṣ also change the sound.", simpleRule: "Learn words with their tones.", examples: [{ target: "ọkọ / oko", explanation: "Different tones, different meanings." }], exercise: { prompt: "Yoruba for water is…", accepted: ["omi"], explanation: "omi." } },
"Ẹ n lẹ! Báwo ni?", ["dáadáa", "ó dára", "a dúpẹ́"], "Kí lo fẹ́ mu?", ["kọfí", "omi"]);

PACKS.ig = africanPack("ig", ["Ndewo", "Ụtụtụ ọma", "Kedu?"], [
  ["ndewo", "hello", "n-DEH-wo", "Ndewo, aha m bụ Chioma.", "Hello, my name is Chioma."],
  ["ụtụtụ ọma", "good morning", "oo-TOO-too AW-ma", "Ụtụtụ ọma, kedu?", "Good morning, how are you?"],
  ["daalụ", "thank you", "DAH-loo", "Daalụ nke ukwuu.", "Thank you very much."],
  ["biko", "please", "BEE-ko", "Kọfị, biko.", "Coffee, please."],
  ["ee", "yes", "eh-eh", "Ee, ọ dị mma.", "Yes, it is fine."],
  ["mba", "no", "m-bah", "Mba, daalụ.", "No, thank you."],
  ["m", "I", "m", "Ebi m na Enugu.", "I live in Enugu."],
  ["gị", "you", "gee", "Ị dị mma.", "You are fine/kind."],
  ["mmiri", "water", "MEE-ree", "Achọrọ m mmiri.", "I want water."],
  ["achịcha", "bread", "a-CHEE-cha", "Achịcha a dị ọhụrụ.", "This bread is fresh."],
  ["kọfị", "coffee", "KAW-fee", "A na m aṅụ kọfị.", "I drink coffee."],
  ["ụlọ", "house", "OO-law", "Ụlọ anyị pere mpe.", "Our house is small."],
  ["ọdụ ụgbọ", "station", "AW-doo OO-gbo", "Ọdụ ụgbọ dị ebee?", "Where is the station?"],
  ["otu", "one", "OH-too", "Enwere m akwụkwọ otu.", "I have one book."],
  ["abụọ", "two", "a-BOO-aw", "Enwere m ụmụnne abụọ.", "I have two siblings."],
  ["taa", "today", "tah", "Ihu igwe dị mma taa.", "The weather is nice today."],
  ["echi", "tomorrow", "EH-chee", "Ka ọ dị echi.", "Until tomorrow."],
  ["ịrụ ọrụ", "to work", "ee-roo AW-roo", "A na m arụ ọrụ n'ọfịs.", "I work in an office."],
  ["ịghọta", "to understand", "ee-GAW-ta", "Aghọtaghị m.", "I do not understand."],
  ["ikekwe", "maybe", "ee-KEK-weh", "Ikekwe ma emesịa.", "Maybe later."],
], { title: "Subject pronouns", level: "A1", rule: "Igbo often uses m (I) and ị/gị (you). Tone and vowel harmony affect verbs.", simpleRule: "m = I, ị = you.", examples: [{ target: "Aha m bụ Ada.", explanation: "My name is Ada." }], exercise: { prompt: "Igbo for I / me is often…", accepted: ["m"], explanation: "m." } },
"Ndewo! Kedu?", ["ọ dị mma", "adị m mma", "ọma"], "Gịnị ka ị chọrọ ịṅụ?", ["kọfị", "mmiri"]);

PACKS.ha = africanPack("ha", ["Sannu", "Ina kwana", "Yaya kake?"], [
  ["sannu", "hello", "SAN-noo", "Sannu, sunana Aisha.", "Hello, my name is Aisha."],
  ["ina kwana", "good morning", "ee-na KWA-na", "Ina kwana, yaya kake?", "Good morning, how are you?"],
  ["na gode", "thank you", "na GO-deh", "Na gode sosai.", "Thank you very much."],
  ["don Allah", "please", "don AL-lah", "Kofi, don Allah.", "Coffee, please."],
  ["eh", "yes", "eh", "Eh, daidai ne.", "Yes, that is right."],
  ["a'a", "no", "ah-ah", "A'a, na gode.", "No, thank you."],
  ["ni", "I", "nee", "Ina zaune a Kano.", "I live in Kano."],
  ["kai", "you (masc.)", "kye", "Kai mutum ne mai kyau.", "You are a kind person."],
  ["ruwa", "water", "ROO-wa", "Ina son ruwa.", "I want water."],
  ["gurasa", "bread", "goo-RA-sa", "Gurasar tana da sabo.", "The bread is fresh."],
  ["kofi", "coffee", "KO-fee", "Ina shan kofi.", "I drink coffee."],
  ["gida", "house", "GEE-da", "Gidanmu yana da ƙanƙanta.", "Our house is small."],
  ["tasha", "station", "TA-sha", "Ina tasha yake?", "Where is the station?"],
  ["ɗaya", "one", "DA-ya", "Ina da littafi ɗaya.", "I have one book."],
  ["biyu", "two", "BEE-yu", "Ina da ƴan'uwa biyu.", "I have two siblings."],
  ["yau", "today", "yow", "Yau yanayi yana da kyau.", "Today the weather is nice."],
  ["gobe", "tomorrow", "GO-beh", "Sai gobe.", "Until tomorrow."],
  ["yin aiki", "to work", "yin EYE-kee", "Ina aiki a ofis.", "I work in an office."],
  ["fahimta", "to understand", "fa-HIM-ta", "Ban gane ba.", "I do not understand."],
  ["watakila", "maybe", "wa-ta-KEE-la", "Watakila daga baya.", "Maybe later."],
], { title: "Sannu greetings", level: "A1", rule: "Hausa greetings often ask after rest or work: Ina kwana, Ina gajiya. Reply with Lafiya lau.", simpleRule: "Greet, then answer lafiya lau.", examples: [{ target: "Lafiya lau.", explanation: "Fine / in health." }], exercise: { prompt: "A common healthy reply is…", accepted: ["lafiya lau", "lahiya lau"], explanation: "Lafiya lau." } },
"Sannu! Yaya kake?", ["lau", "lafiya", "lafiya lau"], "Me kake so ka sha?", ["kofi", "ruwa"]);

PACKS.af = romanceLike("af", ["Hallo", "Goeiemôre", "Hoe gaan dit?"], [
  ["hallo", "hello", "HAH-lo", "Hallo, my naam is Johan.", "Hello, my name is Johan."],
  ["goeiemôre", "good morning", "KHOO-ee-mor-uh", "Goeiemôre, hoe gaan dit?", "Good morning, how is it going?"],
  ["dankie", "thank you", "DAHN-kee", "Baie dankie.", "Thank you very much."],
  ["asseblief", "please", "ah-suh-BLEEF", "'n Koffie, asseblief.", "A coffee, please."],
  ["ja", "yes", "yah", "Ja, dis reg.", "Yes, that is right."],
  ["nee", "no", "nee", "Nee, dankie.", "No, thank you."],
  ["ek", "I", "ek", "Ek woon in Kaapstad.", "I live in Cape Town."],
  ["jy", "you (informal)", "yay", "Jy is vriendelik.", "You are friendly."],
  ["water", "water", "VAH-ter", "Ek wil water hê.", "I want water."],
  ["brood", "bread", "broht", "Die brood is vars.", "The bread is fresh."],
  ["koffie", "coffee", "KOF-fee", "Ek drink koffie.", "I drink coffee."],
  ["huis", "house", "hayss", "Ons huis is klein.", "Our house is small."],
  ["stasie", "station", "STAH-see", "Waar is die stasie?", "Where is the station?"],
  ["een", "one", "een", "Ek het een boek.", "I have one book."],
  ["twee", "two", "tvee", "Ek het twee susters.", "I have two sisters."],
  ["vandag", "today", "fan-DAKH", "Vandag is die weer mooi.", "Today the weather is nice."],
  ["môre", "tomorrow", "mor-uh", "Tot môre.", "Until tomorrow."],
  ["werk", "to work", "verk", "Ek werk in 'n kantoor.", "I work in an office."],
  ["verstaan", "to understand", "fer-STAHN", "Ek verstaan nie.", "I do not understand."],
  ["miskien", "maybe", "mis-KEEN", "Miskien later.", "Maybe later."],
], [
  { title: "Double negative", level: "A2", rule: "Afrikaans uses nie … nie: Ek verstaan nie.", simpleRule: "Put nie after the verb (and often again at the end of longer clauses).", examples: [{ target: "Ek drink nie koffie nie.", explanation: "nie … nie around the object." }], exercise: { prompt: "Negate: Ek verstaan. (add nie)", accepted: ["ek verstaan nie", "verstaan nie"], explanation: "Ek verstaan nie." } },
  { title: "Articles", level: "A1", rule: "die is the definite article for all genders; 'n is a/an.", simpleRule: "die huis, 'n koffie.", examples: [{ target: "die stasie", explanation: "the station." }], exercise: { prompt: "Afrikaans for 'the' is…", accepted: ["die"], explanation: "die." } },
  { title: "jy vs u", level: "A1", rule: "jy informal; u formal.", simpleRule: "u with strangers.", examples: [{ target: "Hoe gaan dit met u?", explanation: "Formal." }], exercise: { prompt: "Formal 'you' is…", accepted: ["u"], explanation: "u." } },
], [
  { mode: "BEGINNER", teacher: "Hallo! Hoe gaan dit?", expected: ["goed", "dit gaan goed", "baie goed"], natural: "Dit gaan goed.", hint: "Dit gaan goed." },
  { mode: "RESTAURANT", teacher: "Wat wil jy drink?", expected: ["koffie", "water", "koffie asseblief"], natural: "'n Koffie, asseblief.", hint: "koffie." },
  { mode: "TRAVEL", teacher: "Waar is die stasie?", expected: ["daar", "regs", "links"], natural: "Daar.", hint: "daar." },
  { mode: "EMERGENCY", teacher: "Het jy hulp nodig?", expected: ["ja", "ja asseblief", "ek het hulp nodig"], natural: "Ja, ek het hulp nodig.", hint: "Ja." },
]);

PACKS.zu = africanPack("zu", ["Sawubona", "Sawubona ekuseni", "Unjani?"], [
  ["sawubona", "hello (to one)", "sa-woo-BOH-na", "Sawubona, igama lami nguThandi.", "Hello, my name is Thandi."],
  ["sawubona ekuseni", "good morning", "sa-woo-BOH-na eh-koo-SEH-nee", "Sawubona ekuseni, unjani?", "Good morning, how are you?"],
  ["ngiyabonga", "thank you", "ngee-ya-BON-ga", "Ngiyabonga kakhulu.", "Thank you very much."],
  ["ngicela", "please (I request)", "ngee-TSEH-la", "Ngi cela ikhofi.", "I request coffee."],
  ["yebo", "yes", "YEH-bo", "Yebo, kulungile.", "Yes, it is fine."],
  ["cha", "no", "cha", "Cha, ngiyabonga.", "No, thank you."],
  ["mina", "I", "MEE-na", "Ngihlala eThekwini.", "I live in Durban."],
  ["wena", "you", "WEH-na", "Umomuhle.", "You are kind."],
  ["amanzi", "water", "a-MAN-zee", "Ngifuna amanzi.", "I want water."],
  ["isinkwa", "bread", "ee-SEEN-kwa", "Isinkwa sisisha.", "The bread is fresh."],
  ["ikhofi", "coffee", "ee-KO-fee", "Ngiyaphuza ikhofi.", "I drink coffee."],
  ["ikhaya", "home", "ee-KHA-ya", "Ikhaya lethu lincane.", "Our home is small."],
  ["isiteshi", "station", "ee-see-TEH-shee", "Isiteshi siphi?", "Where is the station?"],
  ["kunye", "one", "koo-NYEH", "Nginencwadi eyodwa.", "I have one book."],
  ["kubili", "two", "koo-BEE-lee", "Nginodadewethu ababili.", "I have two sisters."],
  ["namuhla", "today", "na-MOO-hla", "Namuhla isimo sezulu sihle.", "Today the weather is nice."],
  ["kusasa", "tomorrow", "koo-SA-sa", "Sizobonana kusasa.", "See you tomorrow."],
  ["ukusebenza", "to work", "oo-koo-seh-BEN-za", "Ngisebenza ehhovisi.", "I work in an office."],
  ["ukuqonda", "to understand", "oo-koo-KON-da", "Angiqondi.", "I do not understand."],
  ["mhlawumbe", "maybe", "m-hla-WOOM-beh", "Mhlawumbe kamuva.", "Maybe later."],
], { title: "Noun prefixes", level: "A2", rule: "Zulu nouns carry class prefixes (umu-/aba-, ili-/ama-) that control agreement on verbs and adjectives.", simpleRule: "The first syllable of a noun is often a class prefix.", examples: [{ target: "umuntu / abantu", explanation: "person / people." }], exercise: { prompt: "Zulu greeting to one person is…", accepted: ["sawubona"], explanation: "Sawubona." } },
"Sawubona! Unjani?", ["ngiyaphila", "ngikhona", "ngiyaphila nami"], "Ufunani?", ["ikhofi", "amanzi"]);

PACKS.id = romanceLike("id", ["Halo", "Selamat pagi", "Apa kabar?"], [
  ["halo", "hello", "HA-lo", "Halo, nama saya Sari.", "Hello, my name is Sari."],
  ["selamat pagi", "good morning", "suh-LA-mat PA-gee", "Selamat pagi, apa kabar?", "Good morning, how are you?"],
  ["terima kasih", "thank you", "tuh-REE-ma KA-seh", "Terima kasih banyak.", "Thank you very much."],
  ["tolong", "please / help", "TOH-long", "Kopi, tolong.", "Coffee, please."],
  ["ya", "yes", "yah", "Ya, benar.", "Yes, correct."],
  ["tidak", "no", "TEE-dak", "Tidak, terima kasih.", "No, thank you."],
  ["saya", "I", "SA-ya", "Saya tinggal di Jakarta.", "I live in Jakarta."],
  ["kamu", "you (informal)", "KA-moo", "Kamu baik.", "You are kind."],
  ["air", "water", "ah-EER", "Saya mau air.", "I want water."],
  ["roti", "bread", "RO-tee", "Rotinya masih baru.", "The bread is fresh."],
  ["kopi", "coffee", "KO-pee", "Saya minum kopi.", "I drink coffee."],
  ["rumah", "house", "ROO-mah", "Rumah kami kecil.", "Our house is small."],
  ["stasiun", "station", "sta-see-OON", "Stasiun di mana?", "Where is the station?"],
  ["satu", "one", "SA-too", "Saya punya satu buku.", "I have one book."],
  ["dua", "two", "DOO-ah", "Saya punya dua saudara.", "I have two siblings."],
  ["hari ini", "today", "HA-ree EE-nee", "Hari ini cuacanya bagus.", "Today the weather is nice."],
  ["besok", "tomorrow", "BEH-sok", "Sampai besok.", "See you tomorrow."],
  ["bekerja", "to work", "buh-KER-ja", "Saya bekerja di kantor.", "I work in an office."],
  ["mengerti", "to understand", "men-GER-tee", "Saya tidak mengerti.", "I do not understand."],
  ["mungkin", "maybe", "MOONG-kin", "Mungkin nanti.", "Maybe later."],
], [
  { title: "No tense inflection", level: "A1", rule: "Indonesian verbs do not conjugate. Time words and already/will particles mark tense: sudah, akan.", simpleRule: "Same verb for all persons.", examples: [{ target: "Saya bekerja. Dia bekerja.", explanation: "bekerja does not change." }], exercise: { prompt: "Indonesian for I is…", accepted: ["saya"], explanation: "saya." } },
  { title: "Tidak negation", level: "A1", rule: "tidak negates verbs/adjectives; bukan negates nouns.", simpleRule: "tidak + verb.", examples: [{ target: "Saya tidak mengerti.", explanation: "tidak before mengerti." }], exercise: { prompt: "Negate mengerti", accepted: ["tidak mengerti", "saya tidak mengerti"], explanation: "tidak mengerti." } },
  { title: "Anda vs kamu", level: "A1", rule: "kamu informal; Anda formal.", simpleRule: "Anda with strangers.", examples: [{ target: "Apa kabar Anda?", explanation: "Formal." }], exercise: { prompt: "Formal 'you' is…", accepted: ["anda"], explanation: "Anda." } },
], [
  { mode: "BEGINNER", teacher: "Halo! Apa kabar?", expected: ["baik", "baik-baik saja", "kabar baik"], natural: "Baik, terima kasih.", hint: "Baik." },
  { mode: "RESTAURANT", teacher: "Mau minum apa?", expected: ["kopi", "air", "kopi tolong"], natural: "Kopi, tolong.", hint: "kopi." },
  { mode: "TRAVEL", teacher: "Stasiun di mana?", expected: ["di sana", "kanan", "kiri"], natural: "Di sana.", hint: "di sana." },
  { mode: "EMERGENCY", teacher: "Butuh bantuan?", expected: ["ya", "tolong", "saya butuh bantuan"], natural: "Ya, saya butuh bantuan.", hint: "Ya." },
]);

PACKS.vi = romanceLike("vi", ["Xin chào", "Chào buổi sáng", "Bạn khỏe không?"], [
  ["xin chào", "hello", "sin chow", "Xin chào, tôi tên là Lan.", "Hello, my name is Lan."],
  ["chào buổi sáng", "good morning", "chow bwoy sang", "Chào buổi sáng, bạn khỏe không?", "Good morning, how are you?"],
  ["cảm ơn", "thank you", "kahm uhn", "Cảm ơn nhiều.", "Thank you very much."],
  ["làm ơn", "please", "lahm uhn", "Cà phê, làm ơn.", "Coffee, please."],
  ["có", "yes / to have", "kaw", "Có, đúng rồi.", "Yes, that's right."],
  ["không", "no / not", "khohng", "Không, cảm ơn.", "No, thank you."],
  ["tôi", "I", "toy", "Tôi sống ở Hà Nội.", "I live in Hanoi."],
  ["bạn", "you (friendly)", "bahn", "Bạn tốt bụng.", "You are kind."],
  ["nước", "water", "nook", "Tôi muốn nước.", "I want water."],
  ["bánh mì", "bread", "bang mee", "Bánh mì còn nóng.", "The bread is still hot."],
  ["cà phê", "coffee", "kah feh", "Tôi uống cà phê.", "I drink coffee."],
  ["nhà", "house", "nya", "Nhà tôi nhỏ.", "My house is small."],
  ["nhà ga", "station", "nya gah", "Nhà ga ở đâu?", "Where is the station?"],
  ["một", "one", "moht", "Tôi có một quyển sách.", "I have one book."],
  ["hai", "two", "high", "Tôi có hai chị.", "I have two older sisters."],
  ["hôm nay", "today", "hohm nai", "Hôm nay thời tiết đẹp.", "Today the weather is nice."],
  ["ngày mai", "tomorrow", "nyai mai", "Hẹn ngày mai.", "See you tomorrow."],
  ["làm việc", "to work", "lahm vyek", "Tôi làm việc ở văn phòng.", "I work in an office."],
  ["hiểu", "to understand", "hyew", "Tôi không hiểu.", "I do not understand."],
  ["có lẽ", "maybe", "kaw leh", "Có lẽ sau.", "Maybe later."],
], [
  { title: "Tones", level: "A1", rule: "Vietnamese has six tones in the northern standard. Tone changes meaning: ma / má / mà.", simpleRule: "Learn each word with its tone marks.", examples: [{ target: "má / mà", explanation: "Different tones, different words." }], exercise: { prompt: "Vietnamese for I is…", accepted: ["tôi", "toi"], explanation: "tôi." } },
  { title: "Không negation", level: "A1", rule: "không before the verb: Tôi không hiểu.", simpleRule: "không + verb.", examples: [{ target: "Tôi không làm việc hôm nay.", explanation: "không before làm." }], exercise: { prompt: "Negate hiểu", accepted: ["không hiểu", "tôi không hiểu"], explanation: "không hiểu." } },
  { title: "Classifier cuốn/quyển", level: "A2", rule: "Books take quyển/cuốn: một quyển sách.", simpleRule: "number + classifier + noun.", examples: [{ target: "một quyển sách", explanation: "one + classifier + book." }], exercise: { prompt: "Vietnamese for one is…", accepted: ["một", "mot"], explanation: "một." } },
], [
  { mode: "BEGINNER", teacher: "Xin chào! Bạn khỏe không?", expected: ["khỏe", "tôi khỏe", "khỏe cảm ơn"], natural: "Tôi khỏe, cảm ơn.", hint: "Tôi khỏe." },
  { mode: "RESTAURANT", teacher: "Bạn muốn uống gì?", expected: ["cà phê", "nước", "cà phê làm ơn"], natural: "Cà phê, làm ơn.", hint: "cà phê." },
  { mode: "TRAVEL", teacher: "Nhà ga ở đâu?", expected: ["ở kia", "bên phải", "bên trái"], natural: "Ở kia.", hint: "ở kia." },
  { mode: "EMERGENCY", teacher: "Bạn cần giúp không?", expected: ["có", "giúp tôi", "tôi cần giúp"], natural: "Có, tôi cần giúp.", hint: "Có." },
]);

PACKS.pl = romanceLike("pl", ["Cześć", "Dzień dobry", "Jak się masz?"], [
  ["cześć", "hi", "cheshch", "Cześć, mam na imię Anna.", "Hi, my name is Anna."],
  ["dzień dobry", "good day", "jen DOB-ri", "Dzień dobry, jak się masz?", "Good day, how are you?"],
  ["dziękuję", "thank you", "jen-KOO-yeh", "Bardzo dziękuję.", "Thank you very much."],
  ["proszę", "please", "PRO-sheh", "Kawę, proszę.", "Coffee, please."],
  ["tak", "yes", "tahk", "Tak, zgadza się.", "Yes, that's right."],
  ["nie", "no", "nyeh", "Nie, dziękuję.", "No, thank you."],
  ["ja", "I", "yah", "Mieszkam w Warszawie.", "I live in Warsaw."],
  ["ty", "you (informal)", "tih", "Jesteś miły.", "You are kind."],
  ["woda", "water", "VO-da", "Poproszę wodę.", "Water, please."],
  ["chleb", "bread", "hlep", "Chleb jest świeży.", "The bread is fresh."],
  ["kawa", "coffee", "KA-va", "Piję kawę.", "I drink coffee."],
  ["dom", "house", "dom", "Nasz dom jest mały.", "Our house is small."],
  ["dworzec", "station", "DVOH-zhets", "Gdzie jest dworzec?", "Where is the station?"],
  ["jeden", "one", "YEH-den", "Mam jedną książkę.", "I have one book."],
  ["dwa", "two", "dva", "Mam dwie siostry.", "I have two sisters."],
  ["dzisiaj", "today", "JEE-shay", "Dzisiaj jest ładna pogoda.", "Today the weather is nice."],
  ["jutro", "tomorrow", "YOO-tro", "Do jutra.", "See you tomorrow."],
  ["pracować", "to work", "pra-TSO-vach", "Pracuję w biurze.", "I work in an office."],
  ["rozumieć", "to understand", "ro-ZOO-myech", "Nie rozumiem.", "I do not understand."],
  ["może", "maybe", "MO-zheh", "Może później.", "Maybe later."],
], [
  { title: "Cases (intro)", level: "A2", rule: "Polish nouns change endings by role. After proszę you often see the accusative: wodę, kawę.", simpleRule: "Objects often take -ę on feminine nouns.", examples: [{ target: "Poproszę wodę.", explanation: "woda → wodę." }], exercise: { prompt: "Accusative of woda in 'please (give me) water' is…", accepted: ["wodę", "wode"], explanation: "wodę." } },
  { title: "ty vs pan/pani", level: "A1", rule: "ty informal; pan/pani formal.", simpleRule: "pan/pani with strangers.", examples: [{ target: "Dzień dobry, panie doktorze.", explanation: "Formal address." }], exercise: { prompt: "Informal 'you' is…", accepted: ["ty"], explanation: "ty." } },
  { title: "Nie negation", level: "A1", rule: "nie before the verb: Nie rozumiem.", simpleRule: "nie + verb.", examples: [{ target: "Nie pracuję dzisiaj.", explanation: "nie before pracuję." }], exercise: { prompt: "Negate rozumiem", accepted: ["nie rozumiem"], explanation: "Nie rozumiem." } },
], [
  { mode: "BEGINNER", teacher: "Cześć! Jak się masz?", expected: ["dobrze", "w porządku", "świetnie"], natural: "Dobrze, dziękuję.", hint: "Dobrze." },
  { mode: "RESTAURANT", teacher: "Co podać do picia?", expected: ["kawę", "wodę", "kawę proszę"], natural: "Kawę, proszę.", hint: "kawę." },
  { mode: "TRAVEL", teacher: "Gdzie jest dworzec?", expected: ["tam", "w prawo", "w lewo"], natural: "Tam.", hint: "tam." },
  { mode: "EMERGENCY", teacher: "Potrzebuje pan pomocy?", expected: ["tak", "tak proszę", "potrzebuję pomocy"], natural: "Tak, potrzebuję pomocy.", hint: "Tak." },
]);

PACKS.sv = romanceLike("sv", ["Hej", "God morgon", "Hur mår du?"], [
  ["hej", "hi", "hay", "Hej, jag heter Eva.", "Hi, my name is Eva."],
  ["god morgon", "good morning", "good MOR-on", "God morgon, hur mår du?", "Good morning, how are you?"],
  ["tack", "thanks", "tahk", "Tack så mycket.", "Thank you very much."],
  ["snälla", "please", "SNEL-la", "En kaffe, snälla.", "A coffee, please."],
  ["ja", "yes", "yah", "Ja, det stämmer.", "Yes, that is right."],
  ["nej", "no", "nay", "Nej, tack.", "No, thank you."],
  ["jag", "I", "yahg", "Jag bor i Stockholm.", "I live in Stockholm."],
  ["du", "you (informal)", "doo", "Du är snäll.", "You are kind."],
  ["vatten", "water", "VAT-ten", "Jag vill ha vatten.", "I want water."],
  ["bröd", "bread", "brurd", "Brödet är färskt.", "The bread is fresh."],
  ["kaffe", "coffee", "KAH-feh", "Jag dricker kaffe.", "I drink coffee."],
  ["hus", "house", "hews", "Vårt hus är litet.", "Our house is small."],
  ["station", "station", "sta-SHOON", "Var är stationen?", "Where is the station?"],
  ["en", "one / a (common)", "en", "Jag har en bok.", "I have a book."],
  ["två", "two", "tvoh", "Jag har två systrar.", "I have two sisters."],
  ["idag", "today", "ee-DAHG", "Idag är vädret fint.", "Today the weather is nice."],
  ["imorgon", "tomorrow", "ee-MOR-on", "Vi ses imorgon.", "See you tomorrow."],
  ["arbeta", "to work", "ar-BAY-ta", "Jag arbetar på ett kontor.", "I work in an office."],
  ["förstå", "to understand", "fur-STOH", "Jag förstår inte.", "I do not understand."],
  ["kanske", "maybe", "KAN-sheh", "Kanske senare.", "Maybe later."],
], [
  { title: "en/ett gender", level: "A1", rule: "Swedish nouns are en (common) or ett (neuter). The article is also a suffix: boken, huset.", simpleRule: "Learn en/ett with every noun.", examples: [{ target: "en bok / ett hus", explanation: "Different genders." }], exercise: { prompt: "The indefinite article for hus is…", accepted: ["ett", "ett hus"], explanation: "ett hus." } },
  { title: "V2 word order", level: "A2", rule: "The finite verb is second: Idag arbetar jag.", simpleRule: "Verb in position 2.", examples: [{ target: "Idag dricker jag kaffe.", explanation: "Idag first, dricker second." }], exercise: { prompt: "Complete: Idag ____ jag. (arbetar)", accepted: ["arbetar", "idag arbetar jag"], explanation: "Idag arbetar jag." } },
  { title: "inte negation", level: "A1", rule: "inte after the verb in main clauses: Jag förstår inte.", simpleRule: "verb + inte.", examples: [{ target: "Jag arbetar inte idag.", explanation: "inte after arbetar." }], exercise: { prompt: "Negate förstår", accepted: ["förstår inte", "jag förstår inte"], explanation: "förstår inte." } },
], [
  { mode: "BEGINNER", teacher: "Hej! Hur mår du?", expected: ["bra", "jag mår bra", "fint"], natural: "Jag mår bra, tack.", hint: "Jag mår bra." },
  { mode: "RESTAURANT", teacher: "Vad vill du dricka?", expected: ["kaffe", "vatten", "en kaffe"], natural: "En kaffe, tack.", hint: "kaffe." },
  { mode: "TRAVEL", teacher: "Var är stationen?", expected: ["där borta", "till höger", "till vänster"], natural: "Där borta.", hint: "där borta." },
  { mode: "EMERGENCY", teacher: "Behöver du hjälp?", expected: ["ja", "ja tack", "jag behöver hjälp"], natural: "Ja, jag behöver hjälp.", hint: "Ja." },
]);

PACKS.el = romanceLike("el", ["Γεια σας", "Καλημέρα", "Τι κάνετε;"], [
  ["γεια", "hi", "ya", "Γεια, με λένε Ελένη.", "Hi, my name is Eleni."],
  ["καλημέρα", "good morning", "ka-lee-ME-ra", "Καλημέρα, τι κάνεις;", "Good morning, how are you?"],
  ["ευχαριστώ", "thank you", "ef-kha-ree-STO", "Ευχαριστώ πολύ.", "Thank you very much."],
  ["παρακαλώ", "please / you're welcome", "pa-ra-ka-LO", "Έναν καφέ, παρακαλώ.", "A coffee, please."],
  ["ναι", "yes", "neh", "Ναι, σωστά.", "Yes, correct."],
  ["όχι", "no", "OH-hee", "Όχι, ευχαριστώ.", "No, thank you."],
  ["εγώ", "I", "e-GHO", "Μένω στην Αθήνα.", "I live in Athens."],
  ["εσύ", "you (informal)", "e-SEE", "Είσαι ευγενικός.", "You are kind."],
  ["νερό", "water", "ne-RO", "Θέλω νερό.", "I want water."],
  ["ψωμί", "bread", "pso-MEE", "Το ψωμί είναι φρέσκο.", "The bread is fresh."],
  ["καφές", "coffee", "ka-FES", "Πίνω καφέ.", "I drink coffee."],
  ["σπίτι", "house", "SPEE-tee", "Το σπίτι μας είναι μικρό.", "Our house is small."],
  ["σταθμός", "station", "stath-MOS", "Πού είναι ο σταθμός;", "Where is the station?"],
  ["ένα", "one", "EH-na", "Έχω ένα βιβλίο.", "I have one book."],
  ["δύο", "two", "THEE-o", "Έχω δύο αδελφές.", "I have two sisters."],
  ["σήμερα", "today", "SEE-me-ra", "Σήμερα ο καιρός είναι καλός.", "Today the weather is nice."],
  ["αύριο", "tomorrow", "AV-ree-o", "Τα λέμε αύριο.", "See you tomorrow."],
  ["δουλεύω", "I work", "thoo-LE-vo", "Δουλεύω σε γραφείο.", "I work in an office."],
  ["καταλαβαίνω", "I understand", "ka-ta-la-VE-no", "Δεν καταλαβαίνω.", "I do not understand."],
  ["ίσως", "maybe", "EE-sos", "Ίσως αργότερα.", "Maybe later."],
], [
  { title: "The Greek alphabet", level: "A1", rule: "Greek uses its own alphabet. Learn sound values: γεια = ya, όχι = ohi.", simpleRule: "Map letters to sounds before grammar.", examples: [{ target: "νερό", explanation: "ν ε ρ ό." }], exercise: { prompt: "Greek for yes is…", accepted: ["ναι"], explanation: "ναι." } },
  { title: "Δεν negation", level: "A1", rule: "δεν before the verb: Δεν καταλαβαίνω.", simpleRule: "δεν + verb.", examples: [{ target: "Δεν δουλεύω σήμερα.", explanation: "δεν before δουλεύω." }], exercise: { prompt: "Negate καταλαβαίνω", accepted: ["δεν καταλαβαίνω"], explanation: "Δεν καταλαβαίνω." } },
  { title: "Articles", level: "A1", rule: "ο/η/το for the; ένας/μία/ένα for a.", simpleRule: "ο σταθμός, το σπίτι.", examples: [{ target: "ο καφές / το νερό", explanation: "Masculine vs neuter." }], exercise: { prompt: "The article for σπίτι is…", accepted: ["το", "το σπίτι"], explanation: "το σπίτι." } },
], [
  { mode: "BEGINNER", teacher: "Γεια! Τι κάνεις;", expected: ["καλά", "μια χαρά", "καλά ευχαριστώ"], natural: "Καλά, ευχαριστώ.", hint: "Καλά." },
  { mode: "RESTAURANT", teacher: "Τι θα πιείτε;", expected: ["καφέ", "νερό", "έναν καφέ"], natural: "Έναν καφέ, παρακαλώ.", hint: "καφέ." },
  { mode: "TRAVEL", teacher: "Πού είναι ο σταθμός;", expected: ["εκεί", "δεξιά", "αριστερά"], natural: "Εκεί.", hint: "εκεί." },
  { mode: "EMERGENCY", teacher: "Χρειάζεστε βοήθεια;", expected: ["ναι", "ναι παρακαλώ", "χρειάζομαι βοήθεια"], natural: "Ναι, χρειάζομαι βοήθεια.", hint: "Ναι." },
]);

PACKS.he = romanceLike("he", ["שלום", "בוקר טוב", "מה שלומך?"], [
  ["שלום", "hello / peace", "sha-LOM", "שלום, קוראים לי נועה.", "Hello, my name is Noa."],
  ["בוקר טוב", "good morning", "BO-ker tov", "בוקר טוב, מה שלומך?", "Good morning, how are you?"],
  ["תודה", "thank you", "to-DA", "תודה רבה.", "Thank you very much."],
  ["בבקשה", "please", "be-va-ka-SHA", "קפה, בבקשה.", "Coffee, please."],
  ["כן", "yes", "ken", "כן, נכון.", "Yes, correct."],
  ["לא", "no", "lo", "לא, תודה.", "No, thank you."],
  ["אני", "I", "a-NEE", "אני גר בתל אביב.", "I live in Tel Aviv."],
  ["אתה", "you (masc.)", "a-TA", "אתה נחמד.", "You are kind."],
  ["מים", "water", "MA-yim", "אני רוצה מים.", "I want water."],
  ["לחם", "bread", "LE-khem", "הלחם טרי.", "The bread is fresh."],
  ["קפה", "coffee", "ka-FE", "אני שותה קפה.", "I drink coffee."],
  ["בית", "house", "BA-yit", "הבית שלנו קטן.", "Our house is small."],
  ["תחנה", "station", "ta-kha-NA", "איפה התחנה?", "Where is the station?"],
  ["אחד", "one (masc.)", "e-KHAD", "יש לי ספר אחד.", "I have one book."],
  ["שתיים", "two (fem.)", "SHTA-yim", "יש לי שתי אחיות.", "I have two sisters."],
  ["היום", "today", "ha-YOM", "היום מזג האוויר יפה.", "Today the weather is nice."],
  ["מחר", "tomorrow", "ma-KHAR", "להתראות מחר.", "See you tomorrow."],
  ["לעבוד", "to work", "la-a-VOD", "אני עובד במשרד.", "I work in an office."],
  ["להבין", "to understand", "le-ha-VEEN", "אני לא מבין.", "I do not understand."],
  ["אולי", "maybe", "u-LAI", "אולי אחר כך.", "Maybe later."],
], [
  { title: "RTL Hebrew script", level: "A1", rule: "Hebrew is written right-to-left. Vowels are often omitted in everyday print.", simpleRule: "Read from the right.", examples: [{ target: "שלום", explanation: "Starts on the right." }], exercise: { prompt: "Hebrew text direction is… (LTR or RTL)", accepted: ["rtl"], explanation: "RTL." } },
  { title: "Gender in you-forms", level: "A1", rule: "אתה masculine you, את feminine you. Verbs agree.", simpleRule: "Match you-form to the listener.", examples: [{ target: "מה שלומך?", explanation: "How are you (gendered suffix)." }], exercise: { prompt: "Masculine informal 'you' is…", accepted: ["אתה"], explanation: "אתה." } },
  { title: "לא negation", level: "A1", rule: "לא before the verb: אני לא מבין.", simpleRule: "לא + verb.", examples: [{ target: "אני לא עובד היום.", explanation: "לא before עובד." }], exercise: { prompt: "Negate מבין", accepted: ["לא מבין", "אני לא מבין", "לא מבינה"], explanation: "לא מבין / לא מבינה." } },
], [
  { mode: "BEGINNER", teacher: "שלום! מה שלומך?", expected: ["טוב", "בסדר", "טוב תודה"], natural: "טוב, תודה.", hint: "טוב, תודה." },
  { mode: "RESTAURANT", teacher: "מה תרצה לשתות?", expected: ["קפה", "מים", "קפה בבקשה"], natural: "קפה, בבקשה.", hint: "קפה." },
  { mode: "TRAVEL", teacher: "איפה התחנה?", expected: ["שם", "ימינה", "שמאלה"], natural: "שם.", hint: "שם." },
  { mode: "EMERGENCY", teacher: "אתה צריך עזרה?", expected: ["כן", "כן בבקשה", "אני צריך עזרה"], natural: "כן, אני צריך עזרה.", hint: "כן." },
]);

PACKS.th = romanceLike("th", ["สวัสดี", "อรุณสวัสดิ์", "สบายดีไหม?"], [
  ["สวัสดี", "hello", "sa-wat-dee", "สวัสดี ฉันชื่อมาลี", "Hello, my name is Malee."],
  ["อรุณสวัสดิ์", "good morning", "a-run sa-wat", "อรุณสวัสดิ์ สบายดีไหม", "Good morning, how are you?"],
  ["ขอบคุณ", "thank you", "khop-khun", "ขอบคุณมาก", "Thank you very much."],
  ["กรุณา", "please", "ka-ru-na", "กาแฟ กรุณา", "Coffee, please."],
  ["ใช่", "yes", "chai", "ใช่ ถูกต้อง", "Yes, correct."],
  ["ไม่", "no / not", "mai", "ไม่ ขอบคุณ", "No, thank you."],
  ["ฉัน", "I", "chan", "ฉันอยู่ในกรุงเทพฯ", "I live in Bangkok."],
  ["คุณ", "you", "khun", "คุณใจดี", "You are kind."],
  ["น้ำ", "water", "nam", "ฉันขอน้ำ", "I would like water."],
  ["ขนมปัง", "bread", "kha-nom pang", "ขนมปังสด", "The bread is fresh."],
  ["กาแฟ", "coffee", "ga-fae", "ฉันดื่มกาแฟ", "I drink coffee."],
  ["บ้าน", "house", "baan", "บ้านเราเล็ก", "Our house is small."],
  ["สถานี", "station", "sa-tha-nee", "สถานีอยู่ที่ไหน", "Where is the station?"],
  ["หนึ่ง", "one", "nueng", "ฉันมีหนังสือหนึ่งเล่ม", "I have one book."],
  ["สอง", "two", "song", "ฉันมีพี่สาวสองคน", "I have two older sisters."],
  ["วันนี้", "today", "wan-nee", "วันนี้สภาพอากาศดี", "Today the weather is nice."],
  ["พรุ่งนี้", "tomorrow", "phrung-nee", "แล้วพบกันพรุ่งนี้", "See you tomorrow."],
  ["ทำงาน", "to work", "tham-ngan", "ฉันทำงานที่สำนักงาน", "I work at an office."],
  ["เข้าใจ", "to understand", "khao-jai", "ฉันไม่เข้าใจ", "I do not understand."],
  ["อาจจะ", "maybe", "aat-ja", "อาจจะทีหลัง", "Maybe later."],
], [
  { title: "Particles ครับ/ค่ะ", level: "A1", rule: "Polite particles: ครับ (male speakers), ค่ะ (female speakers) at the end of sentences.", simpleRule: "Add ครับ or ค่ะ to be polite.", examples: [{ target: "สวัสดีครับ / สวัสดีค่ะ", explanation: "Same greeting, different particle." }], exercise: { prompt: "A common polite particle for male speakers is…", accepted: ["ครับ", "krub", "khrap"], explanation: "ครับ." } },
  { title: "ไม่ negation", level: "A1", rule: "ไม่ before the verb: ไม่เข้าใจ.", simpleRule: "ไม่ + verb.", examples: [{ target: "ฉันไม่ทำงานวันนี้", explanation: "ไม่ before ทำงาน." }], exercise: { prompt: "Negate เข้าใจ", accepted: ["ไม่เข้าใจ", "ฉันไม่เข้าใจ"], explanation: "ไม่เข้าใจ." } },
  { title: "No conjugation", level: "A1", rule: "Thai verbs do not change for person or tense. Add time words.", simpleRule: "Same verb for I/you.", examples: [{ target: "ฉันทำงาน คุณทำงาน", explanation: "ทำงาน stays the same." }], exercise: { prompt: "Thai for I is…", accepted: ["ฉัน", "chan"], explanation: "ฉัน." } },
], [
  { mode: "BEGINNER", teacher: "สวัสดี! สบายดีไหม?", expected: ["สบายดี", "ดี", "สบายดีครับ", "สบายดีค่ะ"], natural: "สบายดี ขอบคุณ", hint: "สบายดี." },
  { mode: "RESTAURANT", teacher: "ต้องการดื่มอะไร?", expected: ["กาแฟ", "น้ำ", "ขอกาแฟ"], natural: "ขอกาแฟ", hint: "กาแฟ." },
  { mode: "TRAVEL", teacher: "สถานีอยู่ที่ไหน?", expected: ["นู่น", "ทางขวา", "ทางซ้าย"], natural: "นู่น", hint: "นู่น." },
  { mode: "EMERGENCY", teacher: "ต้องการความช่วยเหลือไหม?", expected: ["ใช่", "ช่วยด้วย", "ต้องการ"], natural: "ใช่ ช่วยด้วย", hint: "ใช่." },
]);

PACKS.uk = romanceLike("uk", ["Вітаю", "Доброго ранку", "Як справи?"], [
  ["привіт", "hi", "pry-VEET", "Привіт, мене звати Олена.", "Hi, my name is Olena."],
  ["доброго ранку", "good morning", "DOB-ro-ho RAN-koo", "Доброго ранку, як справи?", "Good morning, how are things?"],
  ["дякую", "thank you", "DYA-koo-yu", "Дуже дякую.", "Thank you very much."],
  ["будь ласка", "please", "bood LASK-a", "Каву, будь ласка.", "Coffee, please."],
  ["так", "yes", "tahk", "Так, правильно.", "Yes, correct."],
  ["ні", "no", "nee", "Ні, дякую.", "No, thank you."],
  ["я", "I", "ya", "Я живу в Києві.", "I live in Kyiv."],
  ["ти", "you (informal)", "ty", "Ти добрий.", "You are kind."],
  ["вода", "water", "vo-DA", "Мені воду.", "Water for me."],
  ["хліб", "bread", "khleeb", "Хліб свіжий.", "The bread is fresh."],
  ["кава", "coffee", "KA-va", "Я п’ю каву.", "I drink coffee."],
  ["будинок", "house / building", "boo-DY-nok", "Наш будинок маленький.", "Our house is small."],
  ["вокзал", "station", "vok-ZAL", "Де вокзал?", "Where is the station?"],
  ["один", "one", "o-DYN", "У мене одна книга.", "I have one book."],
  ["два", "two", "dva", "У мене дві сестри.", "I have two sisters."],
  ["сьогодні", "today", "syo-HOD-nee", "Сьогодні гарна погода.", "Today the weather is nice."],
  ["завтра", "tomorrow", "ZAF-tra", "До завтра.", "See you tomorrow."],
  ["працювати", "to work", "pra-tsyu-VA-ty", "Я працюю в офісі.", "I work in an office."],
  ["розуміти", "to understand", "ro-zoo-MEE-ty", "Я не розумію.", "I do not understand."],
  ["можливо", "maybe", "mozh-LY-vo", "Можливо пізніше.", "Maybe later."],
], [
  { title: "No present-tense бути", level: "A1", rule: "Present-tense 'to be' is usually omitted: Я студент.", simpleRule: "I student = I am a student.", examples: [{ target: "Це дім.", explanation: "This (is) a house." }], exercise: { prompt: "Ukrainian for yes is…", accepted: ["так"], explanation: "так." } },
  { title: "ти vs ви", level: "A1", rule: "ти informal; ви formal or plural.", simpleRule: "ви with strangers.", examples: [{ target: "Як ви?", explanation: "Formal how are you." }], exercise: { prompt: "Formal 'you' is…", accepted: ["ви"], explanation: "ви." } },
  { title: "Не negation", level: "A1", rule: "не before the verb: Я не розумію.", simpleRule: "не + verb.", examples: [{ target: "Я не працюю сьогодні.", explanation: "не before працюю." }], exercise: { prompt: "Negate розумію", accepted: ["не розумію", "я не розумію"], explanation: "не розумію." } },
], [
  { mode: "BEGINNER", teacher: "Привіт! Як справи?", expected: ["добре", "нормально", "все добре"], natural: "Добре, дякую.", hint: "Добре." },
  { mode: "RESTAURANT", teacher: "Що будете пити?", expected: ["каву", "воду", "каву будь ласка"], natural: "Каву, будь ласка.", hint: "каву." },
  { mode: "TRAVEL", teacher: "Де вокзал?", expected: ["там", "праворуч", "ліворуч"], natural: "Там.", hint: "там." },
  { mode: "EMERGENCY", teacher: "Вам потрібна допомога?", expected: ["так", "так будь ласка", "потрібна допомога"], natural: "Так, потрібна допомога.", hint: "Так." },
]);

PACKS.fil = romanceLike("fil", ["Kumusta", "Magandang umaga", "Kamusta ka?"], [
  ["kumusta", "hello / how are you", "koo-moos-TAH", "Kumusta, ako si Ana.", "Hello, I am Ana."],
  ["magandang umaga", "good morning", "ma-gan-DANG oo-MA-ga", "Magandang umaga, kamusta ka?", "Good morning, how are you?"],
  ["salamat", "thank you", "sa-LA-mat", "Maraming salamat.", "Thank you very much."],
  ["please", "please", "plees", "Kape, please.", "Coffee, please."],
  ["oo", "yes", "oh-oh", "Oo, tama.", "Yes, correct."],
  ["hindi", "no", "HIN-dee", "Hindi, salamat.", "No, thank you."],
  ["ako", "I", "a-KO", "Nakatira ako sa Maynila.", "I live in Manila."],
  ["ikaw", "you", "ee-KOW", "Mabait ka.", "You are kind."],
  ["tubig", "water", "TOO-big", "Gusto ko ng tubig.", "I want water."],
  ["tinapay", "bread", "tee-na-PAI", "Sariwa ang tinapay.", "The bread is fresh."],
  ["kape", "coffee", "KA-peh", "Umiinom ako ng kape.", "I drink coffee."],
  ["bahay", "house", "BA-high", "Maliit ang bahay namin.", "Our house is small."],
  ["istasyon", "station", "is-tas-YON", "Nasaan ang istasyon?", "Where is the station?"],
  ["isa", "one", "EE-sa", "May isa akong libro.", "I have one book."],
  ["dalawa", "two", "da-LA-wa", "May dalawa akong kapatid.", "I have two siblings."],
  ["ngayon", "today / now", "nga-YON", "Maganda ang panahon ngayon.", "The weather is nice today."],
  ["bukas", "tomorrow", "BOO-kas", "Hanggang bukas.", "Until tomorrow."],
  ["magtrabaho", "to work", "mag-tra-BA-ho", "Nagtatrabaho ako sa opisina.", "I work in an office."],
  ["maintindihan", "to understand", "ma-in-tin-DI-han", "Hindi ko naintindihan.", "I did not understand."],
  ["baka", "maybe", "BA-ka", "Baka mamaya.", "Maybe later."],
], [
  { title: "Ang focus", level: "A2", rule: "Filipino marks the focused noun with ang and often uses verb affixes (mag-, -um-, -in) instead of word-order changes.", simpleRule: "ang marks the topic.", examples: [{ target: "Ang kape ay mainit.", explanation: "The coffee is hot." }], exercise: { prompt: "Filipino for I is…", accepted: ["ako"], explanation: "ako." } },
  { title: "Hindi negation", level: "A1", rule: "hindi before the predicate: Hindi ako nagtatrabaho ngayon.", simpleRule: "hindi + clause.", examples: [{ target: "Hindi ko naintindihan.", explanation: "I did not understand." }], exercise: { prompt: "Negate with the usual particle…", accepted: ["hindi"], explanation: "hindi." } },
  { title: "Po/opo respect", level: "A1", rule: "po and opo add respect when speaking to elders.", simpleRule: "Add po to be polite.", examples: [{ target: "Salamat po.", explanation: "Thank you (respectful)." }], exercise: { prompt: "A respectful yes is…", accepted: ["opo"], explanation: "opo." } },
], [
  { mode: "BEGINNER", teacher: "Kumusta! Kamusta ka?", expected: ["mabuti", "okay", "ayos lang"], natural: "Mabuti, salamat.", hint: "Mabuti." },
  { mode: "RESTAURANT", teacher: "Anong iinumin mo?", expected: ["kape", "tubig", "kape please"], natural: "Kape, please.", hint: "kape." },
  { mode: "TRAVEL", teacher: "Nasaan ang istasyon?", expected: ["doon", "sa kanan", "sa kaliwa"], natural: "Doon.", hint: "doon." },
  { mode: "EMERGENCY", teacher: "Kailangan mo ba ng tulong?", expected: ["oo", "oo po", "kailangan ko ng tulong"], natural: "Oo, kailangan ko ng tulong.", hint: "Oo." },
]);

const extraPacks = new Map<string, LangPack>();

export function getPack(code: string): LangPack {
  const key = code.toLowerCase();
  const found = PACKS[key] ?? extraPacks.get(key);
  if (!found) {
    const err: any = new Error(`No curriculum pack is registered for '${code}'`);
    err.code = "CURRICULUM_MISSING";
    err.status = 400;
    throw err;
  }
  return found;
}

export function registerPack(packInput: LangPack): void {
  extraPacks.set(packInput.code.toLowerCase(), packInput);
}

export function listPackCodes(): string[] {
  return [...Object.keys(PACKS), ...extraPacks.keys()];
}

export function pathForLevel(code: string, level: LlCefrLevel, goal: string | null): LlLearningModule[] {
  const packData = getPack(code);
  const idx = Math.max(0, levelIndex(level === "NOT_STARTED" || level === "BEGINNER" ? "A1" : level));
  const allowed = new Set(LEVEL_ORDER.slice(0, Math.max(1, idx + 1)));
  let modules = packData.modules.filter((m) => allowed.has(m.level) || m.level === "A1" || m.level === "BEGINNER");
  if (goal === "TRAVEL") {
    modules = [...modules].sort((a, b) => Number(b.topic === "places") - Number(a.topic === "places"));
  } else if (goal === "WORK" || goal === "BUSINESS") {
    modules = [...modules].sort((a, b) => Number(b.topic === "verbs") - Number(a.topic === "verbs"));
  }
  return modules.map((m, i) => ({ ...m, order: i, week: Math.floor(i / 3) + 1 }));
}

export function lessonById(code: string, lessonId: string): LlLesson | null {
  return getPack(code).lessons.find((l) => l.id === lessonId) ?? null;
}

export function vocabById(code: string, vocabId: string): LlVocabItem | null {
  return getPack(code).vocab.find((v) => v.id === vocabId) ?? null;
}

export function grammarById(code: string, ruleId: string): LlGrammarRule | null {
  return getPack(code).grammar.find((g) => g.id === ruleId) ?? null;
}

export function assessmentBank(code: string, skill?: LlSkill, maxLevel?: LlCefrLevel): LlAssessmentItem[] {
  const packData = getPack(code);
  const max = maxLevel ? levelIndex(maxLevel) : 99;
  return packData.assessment.filter((q) => {
    if (skill && q.skill !== skill) return false;
    return levelIndex(q.level) <= max;
  });
}

export function conversationBeats(code: string, mode: LlConversationMode): ConversationBeat[] {
  const packData = getPack(code);
  const exact = packData.conversations.filter((c) => c.mode === mode);
  return exact.length ? exact : packData.conversations.filter((c) => c.mode === "BEGINNER");
}

export function acceptedForItem(code: string, item: LlAssessmentItem): string[] {
  const packData = getPack(code);
  if (item.id.startsWith("qg_")) {
    const i = Number(item.id.split("_").pop());
    const seed = packData.grammar[i];
    return seed ? [] : item.targetText ? [item.targetText] : [];
  }
  if (item.targetText) return [item.targetText];
  return [];
}
