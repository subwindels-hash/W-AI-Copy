/**
 * Authored B2 workplace extras. Words and grammar here are written by hand —
 * the teacher never invents B2 content or a C1/C2 ceiling.
 */
import type { LlCefrLevel } from "@windels/shared/languageLearning";
import type { ConversationBeat, GrammarSeed, Lexeme, WritingPrompt } from "./curriculum.js";

export interface B2Extra {
  lexemes: Lexeme[];
  grammar: GrammarSeed[];
  conversations: ConversationBeat[];
  writing: WritingPrompt[];
}

function work(
  word: string,
  translation: string,
  pronunciation: string,
  example: string,
  exampleTranslation: string,
): Lexeme {
  return {
    word, translation, pronunciation, example, exampleTranslation,
    category: "work",
    difficulty: "B2",
  };
}

function extra(code: string, rows: Array<[string, string, string, string, string]>, grammar: GrammarSeed, teacher: string, expected: string[], natural: string, writingPrompt: string, starter: string[]): B2Extra {
  void code;
  return {
    lexemes: rows.map((r) => work(r[0], r[1], r[2], r[3], r[4])),
    grammar: [grammar],
    conversations: [
      { mode: "BUSINESS", teacher, expected, natural, hint: natural },
      {
        mode: "JOB_INTERVIEW",
        teacher: teacher,
        expected,
        natural,
        hint: "Answer with a workplace phrase from the B2 list.",
      },
    ],
    writing: [{
      id: `wr_${code}_b2`,
      prompt: writingPrompt,
      starterVocab: starter,
      level: "B2",
    }],
  };
}

export const B2_EXTRAS: Record<string, B2Extra> = {
  nl: extra("nl", [
    ["overeenkomst", "agreement", "oh-ver-AYN-komst", "We ondertekenen de overeenkomst morgen.", "We sign the agreement tomorrow."],
    ["verantwoordelijk", "responsible", "ver-ANT-woor-duh-luk", "Ik ben verantwoordelijk voor dit project.", "I am responsible for this project."],
    ["voorstel", "proposal", "voor-STEL", "Kunt u het voorstel toelichten?", "Can you explain the proposal?"],
    ["bijeenkomst", "meeting", "buh-YAYN-komst", "De bijeenkomst begint om tien uur.", "The meeting starts at ten."],
    ["deadline", "deadline", "DEED-layn", "De deadline is vrijdag.", "The deadline is Friday."],
  ], {
    title: "Subordinate-clause verb-final order",
    level: "B2",
    rule: "After omdat, hoewel, terwijl and dat the finite verb moves to the end: 'Ik blijf thuis omdat ik moet werken.'",
    simpleRule: "In omdat/hoewel clauses the verb goes last.",
    examples: [{ target: "Hoewel de deadline krap is, maken we het af.", explanation: "hoewel-clause; is stays at the end of that clause." }],
    exercise: { prompt: "Complete: Ik bel later omdat ik ____. (must work)", accepted: ["moet werken", "ik moet werken"], explanation: "Modal + infinitive at the end: moet werken." },
  }, "Kunt u het voorstel toelichten?", ["ja", "natuurlijk", "het voorstel is", "ik ben verantwoordelijk"], "Natuurlijk, ik ben verantwoordelijk voor het voorstel.",
  "Write 4–6 sentences about a workplace deadline and who is responsible.",
  ["overeenkomst", "verantwoordelijk", "deadline"]),

  es: extra("es", [
    ["acuerdo", "agreement", "ah-KWER-do", "Firmamos el acuerdo mañana.", "We sign the agreement tomorrow."],
    ["responsable", "responsible", "res-pon-SAH-bleh", "Soy responsable de este proyecto.", "I am responsible for this project."],
    ["propuesta", "proposal", "pro-PWEHS-tah", "¿Puede explicar la propuesta?", "Can you explain the proposal?"],
    ["reunión", "meeting", "reh-oo-NYON", "La reunión empieza a las diez.", "The meeting starts at ten."],
    ["plazo", "deadline", "PLAH-so", "El plazo es el viernes.", "The deadline is Friday."],
  ], {
    title: "Subjunctive after expressions of will",
    level: "B2",
    rule: "After querer que, es importante que, and similar phrases, use the present subjunctive: 'Quiero que termines el informe.'",
    simpleRule: "querer que + subjunctive.",
    examples: [{ target: "Es importante que llegues a la reunión.", explanation: "llegues, not llegas." }],
    exercise: { prompt: "Complete: Quiero que tú ____ el acuerdo. (firmar)", accepted: ["firmes", "quiero que tú firmes el acuerdo"], explanation: "firmes is the present subjunctive of firmar." },
  }, "¿Puede explicar la propuesta?", ["sí", "claro", "la propuesta es", "soy responsable"], "Claro, soy responsable de la propuesta.",
  "Write 4–6 sentences about a meeting and a deadline at work.",
  ["acuerdo", "responsable", "plazo"]),

  it: extra("it", [
    ["accordo", "agreement", "ak-KOR-do", "Firmiamo l'accordo domani.", "We sign the agreement tomorrow."],
    ["responsabile", "responsible", "res-pon-SAH-bee-leh", "Sono responsabile di questo progetto.", "I am responsible for this project."],
    ["proposta", "proposal", "pro-POS-tah", "Può spiegare la proposta?", "Can you explain the proposal?"],
    ["riunione", "meeting", "ree-oo-NYO-neh", "La riunione inizia alle dieci.", "The meeting starts at ten."],
    ["scadenza", "deadline", "ska-DEN-tsa", "La scadenza è venerdì.", "The deadline is Friday."],
  ], {
    title: "Congiuntivo after penso che",
    level: "B2",
    rule: "After penso che / credo che Italian uses the subjunctive: 'Penso che la scadenza sia venerdì.'",
    simpleRule: "penso che + congiuntivo.",
    examples: [{ target: "Credo che sia responsabile lui.", explanation: "sia, not è." }],
    exercise: { prompt: "Complete: Penso che la proposta ____ buona. (essere)", accepted: ["sia", "penso che la proposta sia buona"], explanation: "sia is the present subjunctive of essere." },
  }, "Può spiegare la proposta?", ["sì", "certo", "la proposta è", "sono responsabile"], "Certo, sono responsabile della proposta.",
  "Write 4–6 sentences about a workplace agreement and a deadline.",
  ["accordo", "responsabile", "scadenza"]),

  fr: extra("fr", [
    ["accord", "agreement", "ah-KOR", "Nous signons l'accord demain.", "We sign the agreement tomorrow."],
    ["responsable", "responsible", "res-pon-SAB-luh", "Je suis responsable de ce projet.", "I am responsible for this project."],
    ["proposition", "proposal", "pro-po-zee-SYOHN", "Pouvez-vous expliquer la proposition ?", "Can you explain the proposal?"],
    ["réunion", "meeting", "ray-ew-NYOHN", "La réunion commence à dix heures.", "The meeting starts at ten."],
    ["délai", "deadline", "day-LEH", "Le délai est vendredi.", "The deadline is Friday."],
  ], {
    title: "Subjunctive after il faut que",
    level: "B2",
    rule: "After il faut que, il est important que use the subjunctive: 'Il faut que vous finissiez le rapport.'",
    simpleRule: "il faut que + subjunctive.",
    examples: [{ target: "Il faut que je sois à la réunion.", explanation: "sois, not suis." }],
    exercise: { prompt: "Complete: Il faut que tu ____ l'accord. (signer)", accepted: ["signes", "il faut que tu signes l'accord"], explanation: "signes is present subjunctive of signer." },
  }, "Pouvez-vous expliquer la proposition ?", ["oui", "bien sûr", "la proposition est", "je suis responsable"], "Bien sûr, je suis responsable de la proposition.",
  "Write 4–6 sentences about a meeting and who is responsible for the deadline.",
  ["accord", "responsable", "délai"]),

  de: extra("de", [
    ["Vereinbarung", "agreement", "fer-INE-bah-roong", "Wir unterschreiben die Vereinbarung morgen.", "We sign the agreement tomorrow."],
    ["verantwortlich", "responsible", "fer-ANT-vort-likh", "Ich bin für dieses Projekt verantwortlich.", "I am responsible for this project."],
    ["Vorschlag", "proposal", "FORE-shlahk", "Können Sie den Vorschlag erläutern?", "Can you explain the proposal?"],
    ["Besprechung", "meeting", "buh-SHPREKH-oong", "Die Besprechung beginnt um zehn.", "The meeting starts at ten."],
    ["Frist", "deadline", "frist", "Die Frist ist Freitag.", "The deadline is Friday."],
  ], {
    title: "weil / obwohl verb-final",
    level: "B2",
    rule: "After weil and obwohl the finite verb is last: 'Ich bleibe im Büro, weil die Frist knapp ist.'",
    simpleRule: "weil/obwohl: verb at the end.",
    examples: [{ target: "Obwohl die Frist knapp ist, schaffen wir es.", explanation: "ist ends the obwohl-clause." }],
    exercise: { prompt: "Complete: Ich rufe später an, weil ich ____. (must work = arbeiten muss)", accepted: ["arbeiten muss", "weil ich arbeiten muss"], explanation: "Modal last in the weil-clause: arbeiten muss." },
  }, "Können Sie den Vorschlag erläutern?", ["ja", "natürlich", "der vorschlag ist", "ich bin verantwortlich"], "Natürlich, ich bin für den Vorschlag verantwortlich.",
  "Write 4–6 sentences about a Besprechung and a Frist.",
  ["Vereinbarung", "verantwortlich", "Frist"]),

  en: extra("en", [
    ["agreement", "agreement", "uh-GREE-ment", "We sign the agreement tomorrow.", "We sign the agreement tomorrow."],
    ["responsible", "responsible", "ri-SPON-suh-bul", "I am responsible for this project.", "I am responsible for this project."],
    ["proposal", "proposal", "pruh-POH-zul", "Can you explain the proposal?", "Can you explain the proposal?"],
    ["meeting", "meeting", "MEE-ting", "The meeting starts at ten.", "The meeting starts at ten."],
    ["deadline", "deadline", "DED-line", "The deadline is Friday.", "The deadline is Friday."],
  ], {
    title: "Reported speech (backshift)",
    level: "B2",
    rule: "When reporting a past statement, tenses often shift back: 'The deadline is Friday' → She said the deadline was Friday.",
    simpleRule: "Reporting verb in the past → shift the inner verb back.",
    examples: [{ target: "He said he was responsible for the proposal.", explanation: "am → was after said." }],
    exercise: { prompt: "Report: 'The meeting starts at ten.' She said the meeting ____ at ten.", accepted: ["started", "she said the meeting started at ten"], explanation: "starts → started after said." },
  }, "Can you explain the proposal?", ["yes", "of course", "the proposal is", "i am responsible"], "Of course, I am responsible for the proposal.",
  "Write 4–6 sentences about a workplace deadline and who is responsible.",
  ["agreement", "responsible", "deadline"]),

  pt: extra("pt", [
    ["acordo", "agreement", "ah-KOR-doo", "Assinamos o acordo amanhã.", "We sign the agreement tomorrow."],
    ["responsável", "responsible", "hes-pon-SAH-vel", "Sou responsável por este projeto.", "I am responsible for this project."],
    ["proposta", "proposal", "pro-POS-tah", "Pode explicar a proposta?", "Can you explain the proposal?"],
    ["reunião", "meeting", "heh-oo-NYOWNG", "A reunião começa às dez.", "The meeting starts at ten."],
    ["prazo", "deadline", "PRAH-zoo", "O prazo é sexta-feira.", "The deadline is Friday."],
  ], {
    title: "Subjunctive after é importante que",
    level: "B2",
    rule: "After é importante que / quero que Portuguese uses the present subjunctive: 'É importante que você chegue à reunião.'",
    simpleRule: "é importante que + subjunctive.",
    examples: [{ target: "Quero que termines o relatório.", explanation: "termines, not terminas." }],
    exercise: { prompt: "Complete: É importante que você ____ o acordo. (assinar)", accepted: ["assine", "é importante que você assine o acordo"], explanation: "assine is present subjunctive of assinar." },
  }, "Pode explicar a proposta?", ["sim", "claro", "a proposta é", "sou responsável"], "Claro, sou responsável pela proposta.",
  "Write 4–6 sentences about a reunião and a prazo.",
  ["acordo", "responsável", "prazo"]),

  ar: extra("ar", [
    ["اتفاق", "agreement", "it-ti-FAQ", "نوقّع الاتفاق غدا.", "We sign the agreement tomorrow."],
    ["مسؤول", "responsible", "mas-OOL", "أنا مسؤول عن هذا المشروع.", "I am responsible for this project."],
    ["اقتراح", "proposal", "iq-ti-RAH", "هل يمكنك شرح الاقتراح؟", "Can you explain the proposal?"],
    ["اجتماع", "meeting", "ij-ti-MAA", "يبدأ الاجتماع في الساعة العاشرة.", "The meeting starts at ten."],
    ["موعد نهائي", "deadline", "MAW-id ni-HAA-ee", "الموعد النهائي يوم الجمعة.", "The deadline is Friday."],
  ], {
    title: "إضافة المصدر بعد أنْ",
    level: "B2",
    rule: "أنْ + المضارع المنصوب often works like an infinitive: أريد أن أشرح الاقتراح.",
    simpleRule: "أنْ + verb after want/must.",
    examples: [{ target: "يجب أن أصل إلى الاجتماع.", explanation: "أن + أصل." }],
    exercise: { prompt: "Complete: أريد أن ____ الاتفاق. (أوقّع)", accepted: ["أوقع", "أوقّع", "أريد أن أوقع الاتفاق", "أريد أن أوقّع الاتفاق"], explanation: "أريد أن أوقّع الاتفاق." },
  }, "هل يمكنك شرح الاقتراح؟", ["نعم", "طبعا", "الاقتراح هو", "أنا مسؤول"], "نعم، أنا مسؤول عن الاقتراح.",
  "اكتب ٤–٦ جمل عن اجتماع عمل وموعد نهائي.",
  ["اتفاق", "مسؤول", "موعد نهائي"]),

  zh: extra("zh", [
    ["协议", "agreement", "xié yì", "我们明天签协议。", "We sign the agreement tomorrow."],
    ["负责", "to be responsible", "fù zé", "这个项目由我负责。", "I am responsible for this project."],
    ["提案", "proposal", "tí àn", "你能解释一下这个提案吗？", "Can you explain this proposal?"],
    ["会议", "meeting", "huì yì", "会议十点开始。", "The meeting starts at ten."],
    ["截止日期", "deadline", "jié zhǐ rì qī", "截止日期是星期五。", "The deadline is Friday."],
  ], {
    title: "把 construction for disposing of an object",
    level: "B2",
    rule: "把 places the object before the verb when the object is disposed of: 请把提案发给我.",
    simpleRule: "把 + object + verb.",
    examples: [{ target: "请把协议放在桌子上。", explanation: "协议 is moved before 放." }],
    exercise: { prompt: "Complete: 请____提案发给我。", accepted: ["把", "请把提案发给我"], explanation: "把 marks the disposed object." },
  }, "你能解释一下这个提案吗？", ["可以", "当然", "这个提案是", "我负责"], "当然，这个提案由我负责。",
  "写 4–6 句关于会议和截止日期的话。",
  ["协议", "负责", "截止日期"]),

  ja: extra("ja", [
    ["契約", "contract / agreement", "kei-yaku", "明日契約に署名します。", "We sign the contract tomorrow."],
    ["責任", "responsibility", "se-ki-nin", "このプロジェクトは私の責任です。", "This project is my responsibility."],
    ["提案", "proposal", "tei-an", "提案を説明していただけますか。", "Could you explain the proposal?"],
    ["会議", "meeting", "kai-gi", "会議は十時に始まります。", "The meeting starts at ten."],
    ["締め切り", "deadline", "shi-me-ki-ri", "締め切りは金曜日です。", "The deadline is Friday."],
  ], {
    title: "〜ていただけますか polite request",
    level: "B2",
    rule: "ていただけますか is a polite request: 提案を説明していただけますか.",
    simpleRule: "verb-te + いただけますか.",
    examples: [{ target: "契約を確認していただけますか。", explanation: "Polite request to check the contract." }],
    exercise: { prompt: "The polite request ending after て is…", accepted: ["いただけますか", "ていただけますか"], explanation: "ていただけますか." },
  }, "提案を説明していただけますか。", ["はい", "もちろん", "提案は", "私の責任です"], "はい、この提案は私の責任です。",
  "締め切りと会議について 4〜6 文書いてください。",
  ["契約", "責任", "締め切り"]),

  ko: extra("ko", [
    ["계약", "contract", "gye-yak", "내일 계약서에 서명합니다.", "We sign the contract tomorrow."],
    ["책임", "responsibility", "chaek-im", "이 프로젝트는 제 책임입니다.", "This project is my responsibility."],
    ["제안", "proposal", "je-an", "제안을 설명해 주시겠어요?", "Could you explain the proposal?"],
    ["회의", "meeting", "hoe-ui", "회의는 열 시에 시작합니다.", "The meeting starts at ten."],
    ["마감", "deadline", "ma-gam", "마감은 금요일입니다.", "The deadline is Friday."],
  ], {
    title: "-(으)면 conditionals",
    level: "B2",
    rule: "-(으)면 marks a condition: 마감이 금요일이면 오늘 끝내야 합니다.",
    simpleRule: "stem + (으)면 = if.",
    examples: [{ target: "시간이 있으면 회의에 오세요.", explanation: "있으면 = if there is time." }],
    exercise: { prompt: "The conditional ending after a vowel is often…", accepted: ["면", "으면", "-면"], explanation: "면 / 으면." },
  }, "제안을 설명해 주시겠어요?", ["네", "물론이죠", "제안은", "제 책임입니다"], "네, 이 제안은 제 책임입니다.",
  "회의와 마감에 대해 4–6문장을 쓰세요.",
  ["계약", "책임", "마감"]),

  ru: extra("ru", [
    ["соглашение", "agreement", "sa-gla-SHE-ni-ye", "Мы подписываем соглашение завтра.", "We sign the agreement tomorrow."],
    ["ответственный", "responsible", "at-VET-stven-ny", "Я ответственный за этот проект.", "I am responsible for this project."],
    ["предложение", "proposal", "pred-la-ZHE-ni-ye", "Можете объяснить предложение?", "Can you explain the proposal?"],
    ["собрание", "meeting", "sa-BRA-ni-ye", "Собрание начинается в десять.", "The meeting starts at ten."],
    ["срок", "deadline", "srok", "Срок — пятница.", "The deadline is Friday."],
  ], {
    title: "чтобы + past (purpose)",
    level: "B2",
    rule: "Purpose clauses use чтобы + past-looking form: 'Я остаюсь, чтобы закончить отчёт.'",
    simpleRule: "чтобы + verb to express purpose.",
    examples: [{ target: "Я звоню, чтобы объяснить предложение.", explanation: "чтобы + infinitive/past form." }],
    exercise: { prompt: "The purpose conjunction is…", accepted: ["чтобы"], explanation: "чтобы." },
  }, "Можете объяснить предложение?", ["да", "конечно", "предложение", "я ответственный"], "Конечно, я ответственный за предложение.",
  "Напишите 4–6 предложений о собрании и сроке.",
  ["соглашение", "ответственный", "срок"]),

  hi: extra("hi", [
    ["समझौता", "agreement", "sam-JHAU-ta", "हम कल समझौते पर हस्ताक्षर करेंगे।", "We will sign the agreement tomorrow."],
    ["ज़िम्मेदार", "responsible", "zim-me-DAAR", "मैं इस परियोजना के लिए ज़िम्मेदार हूँ।", "I am responsible for this project."],
    ["प्रस्ताव", "proposal", "pras-TAAV", "क्या आप प्रस्ताव समझा सकते हैं?", "Can you explain the proposal?"],
    ["बैठक", "meeting", "BAI-thak", "बैठक दस बजे शुरू होती है।", "The meeting starts at ten."],
    ["समय सीमा", "deadline", "sa-MAY see-ma", "समय सीमा शुक्रवार है।", "The deadline is Friday."],
  ], {
    title: "चाहिए / ज़रूरी है कि",
    level: "B2",
    rule: "Obligation often uses चाहिए or ज़रूरी है: 'रिपोर्ट आज पूरी करनी चाहिए.'",
    simpleRule: "verb + चाहिए for should/must.",
    examples: [{ target: "बैठक में समय पर आना चाहिए।", explanation: "आना चाहिए = should come." }],
    exercise: { prompt: "Hindi 'should' after a verb is often…", accepted: ["चाहिए"], explanation: "चाहिए." },
  }, "क्या आप प्रस्ताव समझा सकते हैं?", ["हाँ", "जी हाँ", "प्रस्ताव", "मैं ज़िम्मेदार हूँ"], "हाँ, मैं इस प्रस्ताव के लिए ज़िम्मेदार हूँ।",
  "कार्यस्थल की बैठक और समय सीमा पर 4–6 वाक्य लिखें।",
  ["समझौता", "ज़िम्मेदार", "समय सीमा"]),

  tr: extra("tr", [
    ["anlaşma", "agreement", "an-LASH-ma", "Anlaşmayı yarın imzalıyoruz.", "We sign the agreement tomorrow."],
    ["sorumlu", "responsible", "so-ROOM-loo", "Bu projeden ben sorumluyum.", "I am responsible for this project."],
    ["öneri", "proposal", "ö-ne-REE", "Öneriyi açıklayabilir misiniz?", "Can you explain the proposal?"],
    ["toplantı", "meeting", "to-plan-TUH", "Toplantı saat onda başlıyor.", "The meeting starts at ten."],
    ["son tarih", "deadline", "son ta-REEH", "Son tarih cuma.", "The deadline is Friday."],
  ], {
    title: "-(y)Abil possibility",
    level: "B2",
    rule: "Ability/possibility uses -abil/-ebil: açıklayabilir misiniz?",
    simpleRule: "verb + abil/ebil = can.",
    examples: [{ target: "Toplantıya gelebilirim.", explanation: "I can come to the meeting." }],
    exercise: { prompt: "The ability suffix in 'açıklayabilir' is…", accepted: ["abil", "ebilir", "-abil"], explanation: "-abil / -ebil." },
  }, "Öneriyi açıklayabilir misiniz?", ["evet", "tabii", "öneri", "ben sorumluyum"], "Tabii, bu öneriden ben sorumluyum.",
  "Bir toplantı ve son tarih hakkında 4–6 cümle yazın.",
  ["anlaşma", "sorumlu", "son tarih"]),

  sw: extra("sw", [
    ["makubaliano", "agreement", "ma-koo-ba-li-A-no", "Tunatia saini makubaliano kesho.", "We sign the agreement tomorrow."],
    ["kuwajibika", "to be responsible", "koo-wa-ji-BEE-ka", "Mimi ninawajibika kwa mradi huu.", "I am responsible for this project."],
    ["pendekezo", "proposal", "pen-de-KE-zo", "Unaweza kueleza pendekezo?", "Can you explain the proposal?"],
    ["mkutano", "meeting", "m-koo-TA-no", "Mkutano unaanza saa nne.", "The meeting starts at ten."],
    ["tarehe ya mwisho", "deadline", "ta-RE-he ya MWEE-sho", "Tarehe ya mwisho ni Ijumaa.", "The deadline is Friday."],
  ], {
    title: "Relative -amba-",
    level: "B2",
    rule: "amba- relatives specify a noun: mradi ambao ninawajibika nao.",
    simpleRule: "amba- + agreement = who/which.",
    examples: [{ target: "pendekezo ambalo nilieleza", explanation: "the proposal which I explained." }],
    exercise: { prompt: "Swahili for meeting is…", accepted: ["mkutano"], explanation: "mkutano." },
  }, "Unaweza kueleza pendekezo?", ["ndiyo", "sawa", "pendekezo", "ninawajibika"], "Ndiyo, ninawajibika kwa pendekezo hili.",
  "Andika sentensi 4–6 kuhusu mkutano na tarehe ya mwisho.",
  ["makubaliano", "kuwajibika", "tarehe ya mwisho"]),

  yo: extra("yo", [
    ["àdéhùn", "agreement", "ah-DEH-hoon", "A óò fọwọ́ sí àdéhùn lọ́la.", "We will sign the agreement tomorrow."],
    ["ojúṣe", "responsibility", "o-JOO-sheh", "Èmi ni ó ní ojúṣe fún iṣẹ́ yìí.", "I have responsibility for this work."],
    ["àbá", "proposal", "ah-BAH", "Ṣé o lè ṣàlàyé àbá náà?", "Can you explain the proposal?"],
    ["ìpàdé", "meeting", "ee-pah-DEH", "Ìpàdé bẹ̀rẹ̀ ní agogo mẹ́wàá.", "The meeting starts at ten."],
    ["òpin àkókò", "deadline", "aw-pin ah-KAW-kaw", "Òpin àkókò ni ọjọ́ Ẹtì.", "The deadline is Friday."],
  ], {
    title: "Focus ní / ni",
    level: "B2",
    rule: "ni/ní marks focus: Èmi ni ó ní ojúṣe — It is I who has the responsibility.",
    simpleRule: "X ni Y = it is X that Y.",
    examples: [{ target: "Àbá ni a ń sọ̀rọ̀ nípa rẹ̀.", explanation: "It is the proposal we are talking about." }],
    exercise: { prompt: "Yoruba for meeting is…", accepted: ["ìpàdé", "ipade"], explanation: "ìpàdé." },
  }, "Ṣé o lè ṣàlàyé àbá náà?", ["bẹẹni", "béèni", "àbá", "ojúṣe"], "Bẹ́ẹ̀ni, èmi ni ó ní ojúṣe fún àbá náà.",
  "Kọ gbólóhùn 4–6 nípa ìpàdé àti òpin àkókò.",
  ["àdéhùn", "ojúṣe", "òpin àkókò"]),

  ig: extra("ig", [
    ["nkwekọrịta", "agreement", "n-kwe-kaw-REE-ta", "Anyị ga-etinye aka na nkwekọrịta echi.", "We will sign the agreement tomorrow."],
    ["ọrụ", "work / duty", "AW-roo", "Ọrụ a bụ nke m.", "This duty is mine."],
    ["atụmatụ", "proposal / plan", "a-TOO-ma-too", "Ị nwere ike ịkọwa atụmatụ a?", "Can you explain this proposal?"],
    ["nzukọ", "meeting", "n-ZOO-kaw", "Nzukọ na-amalite n'elekere iri.", "The meeting starts at ten."],
    ["oge njedebe", "deadline", "o-geh n-je-DEH-beh", "Oge njedebe bụ Fraịde.", "The deadline is Friday."],
  ], {
    title: "Relative nke",
    level: "B2",
    rule: "nke introduces a relative: atụmatụ nke m kọwara.",
    simpleRule: "nke = which/that/of.",
    examples: [{ target: "ọrụ nke anyị kwuru", explanation: "the work that we mentioned." }],
    exercise: { prompt: "Igbo for meeting is…", accepted: ["nzukọ", "nzuko"], explanation: "nzukọ." },
  }, "Ị nwere ike ịkọwa atụmatụ a?", ["ee", "ee biko", "atụmatụ", "ọrụ m"], "Ee, ọ bụ ọrụ m ịkọwa atụmatụ a.",
  "Dee ahịrịokwu 4–6 banyere nzukọ na oge njedebe.",
  ["nkwekọrịta", "ọrụ", "oge njedebe"]),

  ha: extra("ha", [
    ["yarjejeniya", "agreement", "yar-je-je-NEE-ya", "Za mu sanya hannu kan yarjejeniya gobe.", "We will sign the agreement tomorrow."],
    ["alhaki", "responsibility", "al-HA-kee", "Ni ke da alhakin wannan aiki.", "I have responsibility for this work."],
    ["shawara", "proposal / advice", "sha-WA-ra", "Za ka iya bayyana shawarar?", "Can you explain the proposal?"],
    ["taro", "meeting", "TA-ro", "Taro yana farawa da ƙarfe goma.", "The meeting starts at ten."],
    ["ƙarshen lokaci", "deadline", "KAR-shen lo-KA-chee", "Ƙarshen lokaci shine Jumma'a.", "The deadline is Friday."],
  ], {
    title: "da / wanda relatives",
    level: "B2",
    rule: "wanda/wadda introduce relatives: aikin da nake da alhakinsa.",
    simpleRule: "wanda = who/which.",
    examples: [{ target: "shawarar da muka tattauna", explanation: "the proposal that we discussed." }],
    exercise: { prompt: "Hausa for meeting is…", accepted: ["taro"], explanation: "taro." },
  }, "Za ka iya bayyana shawarar?", ["eh", "i", "shawara", "alhaki"], "Eh, ni ke da alhakin wannan shawara.",
  "Rubuta jimloli 4–6 game da taro da ƙarshen lokaci.",
  ["yarjejeniya", "alhaki", "ƙarshen lokaci"]),

  af: extra("af", [
    ["ooreenkoms", "agreement", "OOR-een-koms", "Ons onderteken die ooreenkoms môre.", "We sign the agreement tomorrow."],
    ["verantwoordelik", "responsible", "fer-ANT-woor-duh-lik", "Ek is verantwoordelik vir hierdie projek.", "I am responsible for this project."],
    ["voorstel", "proposal", "FOOR-stel", "Kan u die voorstel verduidelik?", "Can you explain the proposal?"],
    ["vergadering", "meeting", "fer-GAH-duh-ring", "Die vergadering begin om tien.", "The meeting starts at ten."],
    ["sperdatum", "deadline", "SPER-dah-tum", "Die sperdatum is Vrydag.", "The deadline is Friday."],
  ], {
    title: "omdat / hoewel verb-final feel",
    level: "B2",
    rule: "omdat and hoewel introduce reason/concession: 'Ek bly, omdat die sperdatum naby is.'",
    simpleRule: "omdat = because; hoewel = although.",
    examples: [{ target: "Hoewel die sperdatum naby is, maak ons dit klaar.", explanation: "hoewel + clause." }],
    exercise: { prompt: "Afrikaans for because is often…", accepted: ["omdat"], explanation: "omdat." },
  }, "Kan u die voorstel verduidelik?", ["ja", "natuurlik", "die voorstel", "ek is verantwoordelik"], "Natuurlik, ek is verantwoordelik vir die voorstel.",
  "Skryf 4–6 sinne oor 'n vergadering en 'n sperdatum.",
  ["ooreenkoms", "verantwoordelik", "sperdatum"]),

  zu: extra("zu", [
    ["isivumelwano", "agreement", "ee-see-voo-meh-LWA-no", "Sizoyisayina isivumelwano kusasa.", "We will sign the agreement tomorrow."],
    ["umthwalo", "responsibility", "oom-TWA-lo", "Nginomthwalo walo msebenzi.", "I have the responsibility for this work."],
    ["isiphakamiso", "proposal", "ee-see-pha-ka-MEE-so", "Ungasicacisa isiphakamiso?", "Can you explain the proposal?"],
    ["umhlangano", "meeting", "oom-hlan-GA-no", "Umhlangano uqala ngehora leshumi.", "The meeting starts at ten."],
    ["umnqamulajuqu", "deadline", "oom-nqa-moo-la-JOO-koo", "Umnqamulajuqu nguLwesihlanu.", "The deadline is Friday."],
  ], {
    title: "Relative concord",
    level: "B2",
    rule: "Zulu relatives agree with the noun class: umsebenzi engiwuphethe.",
    simpleRule: "The relative matches the noun prefix.",
    examples: [{ target: "isiphakamiso esichaziwe", explanation: "the proposal that was explained." }],
    exercise: { prompt: "Zulu for meeting is…", accepted: ["umhlangano"], explanation: "umhlangano." },
  }, "Ungasicacisa isiphakamiso?", ["yebo", "yebo ngicela", "isiphakamiso", "umthwalo"], "Yebo, nginomthwalo walesi siphakamiso.",
  "Bhala imisho engu-4 kuya ku-6 ngomhlangano nomnqamulajuqu.",
  ["isivumelwano", "umthwalo", "umnqamulajuqu"]),

  id: extra("id", [
    ["perjanjian", "agreement", "per-jan-JEE-an", "Kami menandatangani perjanjian besok.", "We sign the agreement tomorrow."],
    ["bertanggung jawab", "responsible", "ber-tang-GOONG ja-wab", "Saya bertanggung jawab atas proyek ini.", "I am responsible for this project."],
    ["usulan", "proposal", "oo-SOO-lan", "Bisakah Anda menjelaskan usulan ini?", "Can you explain this proposal?"],
    ["rapat", "meeting", "RA-pat", "Rapat mulai pukul sepuluh.", "The meeting starts at ten."],
    ["tenggat", "deadline", "TENG-gat", "Tenggatnya hari Jumat.", "The deadline is Friday."],
  ], {
    title: "agar / supaya purpose",
    level: "B2",
    rule: "agar and supaya introduce purpose: Saya tinggal agar laporan selesai.",
    simpleRule: "agar/supaya = so that.",
    examples: [{ target: "Saya menelepon supaya usulan jelas.", explanation: "supaya + clause." }],
    exercise: { prompt: "Indonesian purpose words include…", accepted: ["agar", "supaya", "agar / supaya"], explanation: "agar or supaya." },
  }, "Bisakah Anda menjelaskan usulan ini?", ["ya", "tentu", "usulan", "saya bertanggung jawab"], "Tentu, saya bertanggung jawab atas usulan ini.",
  "Tulis 4–6 kalimat tentang rapat dan tenggat.",
  ["perjanjian", "bertanggung jawab", "tenggat"]),

  vi: extra("vi", [
    ["thỏa thuận", "agreement", "thwa thwun", "Chúng tôi ký thỏa thuận vào ngày mai.", "We sign the agreement tomorrow."],
    ["chịu trách nhiệm", "responsible", "chew trach nhiem", "Tôi chịu trách nhiệm về dự án này.", "I am responsible for this project."],
    ["đề xuất", "proposal", "deh soo-ut", "Bạn có thể giải thích đề xuất không?", "Can you explain the proposal?"],
    ["cuộc họp", "meeting", "kuok hop", "Cuộc họp bắt đầu lúc mười giờ.", "The meeting starts at ten."],
    ["hạn chót", "deadline", "han chot", "Hạn chót là thứ Sáu.", "The deadline is Friday."],
  ], {
    title: "để purpose",
    level: "B2",
    rule: "để introduces purpose: Tôi ở lại để hoàn thành báo cáo.",
    simpleRule: "để = in order to.",
    examples: [{ target: "Tôi gọi để giải thích đề xuất.", explanation: "để + verb." }],
    exercise: { prompt: "Vietnamese for 'in order to' is often…", accepted: ["để", "de"], explanation: "để." },
  }, "Bạn có thể giải thích đề xuất không?", ["có", "được", "đề xuất", "tôi chịu trách nhiệm"], "Có, tôi chịu trách nhiệm về đề xuất này.",
  "Viết 4–6 câu về cuộc họp và hạn chót.",
  ["thỏa thuận", "chịu trách nhiệm", "hạn chót"]),

  pl: extra("pl", [
    ["porozumienie", "agreement", "po-ro-zoo-MYE-nye", "Podpisujemy porozumienie jutro.", "We sign the agreement tomorrow."],
    ["odpowiedzialny", "responsible", "od-po-vye-DZAL-ny", "Jestem odpowiedzialny za ten projekt.", "I am responsible for this project."],
    ["propozycja", "proposal", "pro-po-ZIT-sya", "Czy może pan wyjaśnić propozycję?", "Can you explain the proposal?"],
    ["zebranie", "meeting", "ze-BRA-nye", "Zebranie zaczyna się o dziesiątej.", "The meeting starts at ten."],
    ["termin", "deadline", "TER-meen", "Termin to piątek.", "The deadline is Friday."],
  ], {
    title: "żeby purpose",
    level: "B2",
    rule: "żeby introduces purpose: Zostaję, żeby skończyć raport.",
    simpleRule: "żeby = so that / in order to.",
    examples: [{ target: "Dzwonię, żeby wyjaśnić propozycję.", explanation: "żeby + infinitive/past." }],
    exercise: { prompt: "Polish purpose conjunction is often…", accepted: ["żeby", "zeby"], explanation: "żeby." },
  }, "Czy może pan wyjaśnić propozycję?", ["tak", "oczywiście", "propozycja", "jestem odpowiedzialny"], "Oczywiście, jestem odpowiedzialny za tę propozycję.",
  "Napisz 4–6 zdań o zebraniu i terminie.",
  ["porozumienie", "odpowiedzialny", "termin"]),

  sv: extra("sv", [
    ["överenskommelse", "agreement", "ö-ver-ens-KOM-el-se", "Vi skriver under överenskommelsen imorgon.", "We sign the agreement tomorrow."],
    ["ansvarig", "responsible", "an-SVA-rig", "Jag är ansvarig för det här projektet.", "I am responsible for this project."],
    ["förslag", "proposal", "fur-SLAHG", "Kan du förklara förslaget?", "Can you explain the proposal?"],
    ["möte", "meeting", "MÖ-te", "Mötet börjar klockan tio.", "The meeting starts at ten."],
    ["deadline", "deadline", "DEED-lain", "Deadlinen är på fredag.", "The deadline is Friday."],
  ], {
    title: "för att purpose",
    level: "B2",
    rule: "för att introduces purpose: Jag stannar för att bli klar med rapporten.",
    simpleRule: "för att = in order to.",
    examples: [{ target: "Jag ringer för att förklara förslaget.", explanation: "för att + infinitive." }],
    exercise: { prompt: "Swedish 'in order to' is…", accepted: ["för att", "for att"], explanation: "för att." },
  }, "Kan du förklara förslaget?", ["ja", "visst", "förslaget", "jag är ansvarig"], "Visst, jag är ansvarig för förslaget.",
  "Skriv 4–6 meningar om ett möte och en deadline.",
  ["överenskommelse", "ansvarig", "deadline"]),

  el: extra("el", [
    ["συμφωνία", "agreement", "sim-fo-NEE-a", "Υπογράφουμε τη συμφωνία αύριο.", "We sign the agreement tomorrow."],
    ["υπεύθυνος", "responsible", "ee-PEF-thi-nos", "Είμαι υπεύθυνος για αυτό το έργο.", "I am responsible for this project."],
    ["πρόταση", "proposal", "PRO-ta-si", "Μπορείτε να εξηγήσετε την πρόταση;", "Can you explain the proposal?"],
    ["συνάντηση", "meeting", "si-NAN-di-si", "Η συνάντηση αρχίζει στις δέκα.", "The meeting starts at ten."],
    ["προθεσμία", "deadline", "pro-thes-MEE-a", "Η προθεσμία είναι την Παρασκευή.", "The deadline is Friday."],
  ], {
    title: "για να purpose",
    level: "B2",
    rule: "για να introduces purpose: Μένω για να τελειώσω την έκθεση.",
    simpleRule: "για να = in order to.",
    examples: [{ target: "Τηλεφωνώ για να εξηγήσω την πρόταση.", explanation: "για να + verb." }],
    exercise: { prompt: "Greek 'in order to' is…", accepted: ["για να", "gia na"], explanation: "για να." },
  }, "Μπορείτε να εξηγήσετε την πρόταση;", ["ναι", "βέβαια", "η πρόταση", "είμαι υπεύθυνος"], "Βέβαια, είμαι υπεύθυνος για την πρόταση.",
  "Γράψε 4–6 προτάσεις για μια συνάντηση και μια προθεσμία.",
  ["συμφωνία", "υπεύθυνος", "προθεσμία"]),

  he: extra("he", [
    ["הסכם", "agreement", "hes-KEM", "אנחנו חותמים על ההסכם מחר.", "We sign the agreement tomorrow."],
    ["אחראי", "responsible", "a-kha-RAI", "אני אחראי לפרויקט הזה.", "I am responsible for this project."],
    ["הצעה", "proposal", "hats-a-AH", "אתה יכול להסביר את ההצעה?", "Can you explain the proposal?"],
    ["פגישה", "meeting", "pgi-SHAH", "הפגישה מתחילה בעשר.", "The meeting starts at ten."],
    ["מועד אחרון", "deadline", "mo-ED a-kha-RON", "המועד האחרון הוא יום שישי.", "The deadline is Friday."],
  ], {
    title: "כדי purpose",
    level: "B2",
    rule: "כדי introduces purpose: אני נשאר כדי לסיים את הדוח.",
    simpleRule: "כדי = in order to.",
    examples: [{ target: "אני מתקשר כדי להסביר את ההצעה.", explanation: "כדי + infinitive." }],
    exercise: { prompt: "Hebrew 'in order to' is often…", accepted: ["כדי"], explanation: "כדי." },
  }, "אתה יכול להסביר את ההצעה?", ["כן", "בטח", "ההצעה", "אני אחראי"], "כן, אני אחראי להצעה.",
  "כתוב 4–6 משפטים על פגישת עבודה ומועד אחרון.",
  ["הסכם", "אחראי", "מועד אחרון"]),

  th: extra("th", [
    ["ข้อตกลง", "agreement", "khor tok long", "เราจะเซ็นข้อตกลงพรุ่งนี้", "We will sign the agreement tomorrow."],
    ["รับผิดชอบ", "responsible", "rap phit chop", "ฉันรับผิดชอบโครงการนี้", "I am responsible for this project."],
    ["ข้อเสนอ", "proposal", "khor sa-noe", "คุณอธิบายข้อเสนอได้ไหม", "Can you explain the proposal?"],
    ["การประชุม", "meeting", "kaan pra-chum", "การประชุมเริ่มสิบโมง", "The meeting starts at ten."],
    ["กำหนดส่ง", "deadline", "kam-not song", "กำหนดส่งคือวันศุกร์", "The deadline is Friday."],
  ], {
    title: "เพื่อ purpose",
    level: "B2",
    rule: "เพื่อ introduces purpose: ฉันอยู่ต่อเพื่อทำให้รายงานเสร็จ.",
    simpleRule: "เพื่อ = in order to.",
    examples: [{ target: "ฉันโทรเพื่ออธิบายข้อเสนอ", explanation: "เพื่อ + verb." }],
    exercise: { prompt: "Thai 'in order to' is often…", accepted: ["เพื่อ", "pheua"], explanation: "เพื่อ." },
  }, "คุณอธิบายข้อเสนอได้ไหม", ["ได้", "ได้ครับ", "ข้อเสนอ", "ฉันรับผิดชอบ"], "ได้ ฉันรับผิดชอบข้อเสนอนี้",
  "เขียน 4–6 ประโยคเกี่ยวกับการประชุมและกำหนดส่ง",
  ["ข้อตกลง", "รับผิดชอบ", "กำหนดส่ง"]),

  uk: extra("uk", [
    ["угода", "agreement", "oo-HO-da", "Ми підписуємо угоду завтра.", "We sign the agreement tomorrow."],
    ["відповідальний", "responsible", "vid-po-vi-DAL-ny", "Я відповідальний за цей проєкт.", "I am responsible for this project."],
    ["пропозиція", "proposal", "pro-po-ZY-tsi-ya", "Можете пояснити пропозицію?", "Can you explain the proposal?"],
    ["зустріч", "meeting", "ZUS-trich", "Зустріч починається о десятій.", "The meeting starts at ten."],
    ["термін", "deadline", "TER-min", "Термін — п’ятниця.", "The deadline is Friday."],
  ], {
    title: "щоб purpose",
    level: "B2",
    rule: "щоб introduces purpose: Я лишаюся, щоб закінчити звіт.",
    simpleRule: "щоб = so that / in order to.",
    examples: [{ target: "Я телефоную, щоб пояснити пропозицію.", explanation: "щоб + infinitive." }],
    exercise: { prompt: "Ukrainian purpose conjunction is often…", accepted: ["щоб"], explanation: "щоб." },
  }, "Можете пояснити пропозицію?", ["так", "звичайно", "пропозиція", "я відповідальний"], "Звичайно, я відповідальний за цю пропозицію.",
  "Напишіть 4–6 речень про зустріч і термін.",
  ["угода", "відповідальний", "термін"]),

  fil: extra("fil", [
    ["kasunduan", "agreement", "ka-soon-DOO-an", "Pipirmahan namin ang kasunduan bukas.", "We will sign the agreement tomorrow."],
    ["responsable", "responsible", "res-pon-SA-bleh", "Ako ang responsable sa proyektong ito.", "I am responsible for this project."],
    ["mungkahi", "proposal", "moong-KA-hee", "Maaari mo bang ipaliwanag ang mungkahi?", "Can you explain the proposal?"],
    ["pulong", "meeting", "POO-long", "Magsisimula ang pulong ng alas-diyes.", "The meeting starts at ten."],
    ["deadline", "deadline", "DED-line", "Biyernes ang deadline.", "The deadline is Friday."],
  ], {
    title: "para / upang purpose",
    level: "B2",
    rule: "para and upang introduce purpose: Mananatili ako para tapusin ang ulat.",
    simpleRule: "para/upang = in order to.",
    examples: [{ target: "Tumawag ako para ipaliwanag ang mungkahi.", explanation: "para + verb." }],
    exercise: { prompt: "Filipino purpose words include…", accepted: ["para", "upang", "para / upang"], explanation: "para or upang." },
  }, "Maaari mo bang ipaliwanag ang mungkahi?", ["oo", "oo po", "mungkahi", "ako ang responsable"], "Oo, ako ang responsable sa mungkahing ito.",
  "Sumulat ng 4–6 pangungusap tungkol sa pulong at deadline.",
  ["kasunduan", "responsable", "deadline"]),
};

export const CURRICULUM_CEILING: LlCefrLevel = "B2";
