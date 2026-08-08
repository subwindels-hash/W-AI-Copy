/**
 * Session 141 — Religion Knowledge catalog: meta, builders and family
 * default templates.
 *
 * The catalog is versioned and expandable without limit (§1: the knowledge
 * base deliberately has no fixed target count — new verified traditions are
 * added through the submission pipeline in §18).
 *
 * NEUTRALITY in the content itself:
 *   - Contested origins are labelled ("traditional dating", "disputed").
 *   - Traditions are described from their own self-understanding first, with
 *     academic framing second; indigenous names are preserved as the primary
 *     names where that is the community's usage.
 *   - No record claims superiority, and none treats followers as uniform.
 */
import type {
  ReligionConfidence,
  ReligionFamily,
  ReligionRecord,
  ReligionSource,
} from "@windels/shared";

/** Bump when the curated catalog changes. */
export const RELIGION_CATALOG_VERSION = "2026.08.141.1";

/** Date every catalog record was last reviewed into the catalog. */
export const RELIGION_REVIEW_DATE = "2026-08-08";

export const SRC_ENCYCLOPEDIA: ReligionSource = { label: "Encyclopaedia Britannica", url: "https://www.britannica.com", type: "academic" };
export const SRC_WORLD_HISTORY: ReligionSource = { label: "World History Encyclopedia", url: "https://www.worldhistory.org", type: "academic" };
export const SRC_PEW: ReligionSource = { label: "Pew Research Center — Religion & Public Life", url: "https://www.pewresearch.org/religion", type: "academic" };
export const SRC_UN: ReligionSource = { label: "United Nations", url: "https://www.un.org", type: "academic" };
export const SRC_OLJP: ReligionSource = { label: "Oxford Learner's / academic religious studies literature", type: "academic" };

/** Family-level default templates — accurate generalizations; specific
 *  records override with their own content. */
const FAMILY_TEMPLATES: Record<ReligionFamily, {
  spiritualBeings: string;
  cosmology: string;
  creationBelief: string;
  humanity: string;
  meditation: string;
  rituals: string;
  religiousLaw: string;
  oralTraditions: string;
}> = {
  abrahamic: {
    spiritualBeings: "Angels and, in some traditions, other spiritual beings; a single supreme God is central.",
    cosmology: "The created universe is the work of the one God; time is linear, with a beginning and an expected consummation.",
    creationBelief: "The universe is created by the one God; traditions recount creation in scripture (e.g. the Book of Genesis in the Hebrew Bible).",
    humanity: "Humans are created by God, capable of good and accountable for their choices.",
    meditation: "Contemplation and devotional reflection take varied forms across the traditions.",
    rituals: "Rites of passage (birth, coming of age, marriage, death), communal worship and holy-day observances.",
    religiousLaw: "Moral and ritual law plays a central role; the content differs substantially between the traditions (e.g. Torah, Sharia, canon law).",
    oralTraditions: "Alongside scriptures, each tradition preserves extensive oral tradition, commentary and preaching.",
  },
  dharmic: {
    spiritualBeings: "The divine is understood variously — as one ultimate reality, many deities, or non-theistic principles — depending on the tradition.",
    cosmology: "Cycles of cosmic ages (kalpas/yugas) recur; time is cyclical across vast epochs.",
    creationBelief: "The cosmos arises, dissolves and re-arises in cycles; creation stories differ between traditions.",
    humanity: "Humans are beings in the cycle of birth, death and rebirth (saṃsāra), capable of liberation.",
    meditation: "Meditation is a central practice across the Dharmic traditions.",
    rituals: "Daily worship (pūjā), rites of passage (saṃskāras), pilgrimage and festival observances.",
    religiousLaw: "Duty and ethical conduct (dharma) are central; specific codes differ between traditions.",
    oralTraditions: "Vast oral traditions of recitation, commentary and teaching; scriptures were long transmitted orally.",
  },
  iranian: {
    spiritualBeings: "A supreme deity with attendant spiritual beings (e.g. yazatas in Zoroastrianism); dualistic struggle between good and evil is central.",
    cosmology: "The world is a battlefield between truth/order and falsehood/chaos, moving toward a final renewal.",
    creationBelief: "Creation is the work of the good deity, opposed by the evil spirit from the beginning.",
    humanity: "Humans are free moral agents whose choices align them with good or evil.",
    meditation: "Reflective prayer and ritual contemplation are practiced.",
    rituals: "Fire-centred rituals, purity rites and seasonal festivals.",
    religiousLaw: "Purity and ethical rules (e.g. the Zoroastrian triad of good thoughts, words, deeds).",
    oralTraditions: "Ancient oral transmission of hymns and liturgy (e.g. the Gathas).",
  },
  east_asian: {
    spiritualBeings: "Varies: impersonal principles (Dao, Tian), deities and ancestors, kami, and bodhisattvas across the traditions.",
    cosmology: "The cosmos is an ordered whole in which humanity participates; yin–yang dynamics and cyclic views recur.",
    creationBelief: "Cosmogonic accounts differ; some traditions emphasize eternal process rather than a single creation event.",
    humanity: "Humans are inherently part of nature and society, perfectible through cultivation.",
    meditation: "Meditation and self-cultivation are central in Daoist, Confucian and Buddhist-influenced practice.",
    rituals: "Ancestor rites, seasonal festivals, temple and household worship.",
    religiousLaw: "Ethical codes and propriety (li), precepts and communal norms rather than a single codified law.",
    oralTraditions: "Rich oral and commentarial traditions alongside classical texts.",
  },
  african_traditional: {
    spiritualBeings: "A supreme creator deity, often remote, with a rich world of divinities, spirits and ancestors who mediate daily life.",
    cosmology: "The visible world and the spirit world are interwoven; ancestors remain present and active.",
    creationBelief: "Distinct creation narratives per tradition, often involving a supreme being and divine messengers.",
    humanity: "Persons are embodied, communal and connected to ancestors and the land.",
    meditation: "Reflection and divination-based contemplation; trance and possession are important in some traditions.",
    rituals: "Life-cycle rites, initiation, sacrifice, divination, festivals and ancestor veneration.",
    religiousLaw: "Customary moral and ritual codes, taboos and communal norms transmitted by elders.",
    oralTraditions: "Central — myths, proverbs, praise poetry and rituals transmitted orally; writing is not the primary medium.",
  },
  african_diaspora: {
    spiritualBeings: "African deities preserved and reinterpreted in the Americas, often paired with Catholic saints; ancestors remain central.",
    cosmology: "The spirit world, ancestors and the living are interwoven; the traditions adapted African cosmologies to new worlds.",
    creationBelief: "Creation narratives carried from African homelands and adapted in diaspora.",
    humanity: "Persons are shaped by community, ancestors and spiritual forces.",
    meditation: "Contemplation occurs within ritual, drumming and possession ceremonies.",
    rituals: "Possession ceremonies, drumming and dance, offerings, initiation and healing rites.",
    religiousLaw: "Communal norms, taboos and initiation requirements govern practice.",
    oralTraditions: "Songs, myths and ritual knowledge transmitted orally within houses/communities.",
  },
  indigenous_american: {
    spiritualBeings: "Creator figures, spirits of nature, culture heroes and ancestors; relationships with the land are central.",
    cosmology: "Multiple layered worlds (sky, earth, underworld) connected by a central axis; creation accounts are diverse.",
    creationBelief: "Distinct creation narratives per people, often involving emergence, transformation and culture heroes.",
    humanity: "Humans are relatives within a living world of other-than-human persons.",
    meditation: "Vision seeking, ceremony and contemplative practice take diverse forms.",
    rituals: "Ceremonial cycles, sweat lodges, dances, healing rites, offerings and rites of passage.",
    religiousLaw: "Communal ceremonial rules and responsibilities transmitted by elders and knowledge keepers.",
    oralTraditions: "Oral tradition is the primary repository — stories, songs, ceremonies and place-based knowledge.",
  },
  oceanian: {
    spiritualBeings: "Creator beings, culture heroes, ancestral spirits and nature spirits; the land and sea are alive with meaning.",
    cosmology: "The cosmos is often traced through genealogies connecting gods, ancestors, people, land and sea.",
    creationBelief: "Distinct creation and emergence narratives per people, sung and told across generations.",
    humanity: "People are connected by kinship to ancestors, land and the spirit world.",
    meditation: "Contemplative and ceremonial practice within community life.",
    rituals: "Ceremonies of birth, initiation, marriage, death, harvest and navigation.",
    religiousLaw: "Customary law and taboo (e.g. tapu) transmitted by elders.",
    oralTraditions: "Central — genealogies, chants, songs and narratives are the primary record.",
  },
  ancient: {
    spiritualBeings: "Pantheons of deities with specialized domains, plus spirits, demons and ancestors, varying by culture.",
    cosmology: "Cosmogonies differ per civilization; many describe a primordial chaos ordered by divine action.",
    creationBelief: "Distinct creation narratives (e.g. Egyptian, Mesopotamian, Greek) preserved in texts and art.",
    humanity: "Humans were often understood as created to serve the gods, with the afterlife varying by culture.",
    meditation: "Prayer, incubation and ritual contemplation existed; meditation as such is rarely attested.",
    rituals: "Temple sacrifice, festivals, purification, divination and funerary rites.",
    religiousLaw: "Cultic rules and purity regulations governed temples and civic religion.",
    oralTraditions: "Myths and rituals transmitted orally long before being written; much is known only through texts and archaeology.",
  },
  new_religious_movement: {
    spiritualBeings: "Varies by movement; many reinterpret older concepts of God, spirits or impersonal reality.",
    cosmology: "Varies; several movements teach progressive revelation, spiritual evolution or cosmic cycles.",
    creationBelief: "Varies by movement; many adopt or reinterpret the creation accounts of parent traditions.",
    humanity: "Varies; many movements emphasize human spiritual potential and progress.",
    meditation: "Meditation and prayer are central in several movements.",
    rituals: "Worship services, festivals and rites of passage adapted or newly formed.",
    religiousLaw: "Ethical codes and community norms; varies widely.",
    oralTraditions: "Founders' teachings are often recorded in writing; oral transmission matters in many communities.",
  },
  humanistic: {
    spiritualBeings: "Generally none; humanism is non-theistic.",
    cosmology: "The natural world as understood by science.",
    creationBelief: "The universe and life are understood through scientific accounts; creation myths are treated as cultural heritage.",
    humanity: "Humans are self-responsible beings whose dignity and flourishing are the highest value.",
    meditation: "Reflective practice and mindfulness are adopted by many humanists.",
    rituals: "Humanist ceremonies (naming, weddings, funerals) affirm meaning without supernatural claims.",
    religiousLaw: "Secular ethics and human-rights frameworks.",
    oralTraditions: "Speeches, essays and community traditions; no revealed scripture.",
  },
  other: {
    spiritualBeings: "Varies; see the record's own content.",
    cosmology: "Varies; see the record's own content.",
    creationBelief: "Varies; see the record's own content.",
    humanity: "Varies; see the record's own content.",
    meditation: "Varies; see the record's own content.",
    rituals: "Varies; see the record's own content.",
    religiousLaw: "Varies; see the record's own content.",
    oralTraditions: "Varies; see the record's own content.",
  },
};

export interface SeedInput {
  id: string;
  name: string;
  altNames?: string[];
  indigenousNames?: ReligionRecord["indigenousNames"];
  namesByLanguage?: Record<string, string[]>;
  family: ReligionFamily;
  category: ReligionRecord["category"];
  status: ReligionRecord["status"];
  theism: ReligionRecord["theism"];
  region: string[];
  ethnicGroups?: string[];
  originLabel: string;
  originYear?: number | null;
  founder?: string[];
  keyFigures?: string[];
  centralTeachings: string;
  deityConcept: string;
  spiritualBeings?: string;
  cosmology?: string;
  creationBelief?: string;
  humanity?: string;
  afterlife: string;
  salvation: string;
  morality?: string;
  worship: string;
  prayer: string;
  meditation?: string;
  rituals?: string;
  festivals?: string[];
  sacredPlaces?: string[];
  symbols?: string[];
  religiousLeaders: string;
  religiousLaw?: string;
  sacredTexts?: string[];
  oralTraditions?: string;
  branches?: string[];
  denominations?: string[];
  schools?: string[];
  historicalDevelopment: string;
  modernStatus: string;
  distribution: string;
  relatedReligions?: string[];
  differences?: string;
  similarities?: string;
  sources?: ReligionSource[];
  confidence?: ReligionConfidence;
  lastReviewed?: string;
  summary: string;
  simple: string;
  advanced?: string;
  researchNote?: string;
  controversialNote?: string;
  expansionNote?: string;
}

/** Build a complete standardized ReligionRecord, filling family-level
 *  defaults for fields the specific record does not override. */
export function buildReligion(input: SeedInput): ReligionRecord {
  const tpl = FAMILY_TEMPLATES[input.family];
  return {
    id: input.id,
    name: input.name,
    altNames: input.altNames ?? [],
    indigenousNames: input.indigenousNames ?? [],
    namesByLanguage: input.namesByLanguage ?? {},
    family: input.family,
    category: input.category,
    status: input.status,
    theism: input.theism,
    region: input.region,
    ethnicGroups: input.ethnicGroups ?? [],
    originLabel: input.originLabel,
    originYear: input.originYear ?? null,
    founder: input.founder ?? [],
    keyFigures: input.keyFigures ?? [],
    centralTeachings: input.centralTeachings,
    deityConcept: input.deityConcept,
    spiritualBeings: input.spiritualBeings ?? tpl.spiritualBeings,
    cosmology: input.cosmology ?? tpl.cosmology,
    creationBelief: input.creationBelief ?? tpl.creationBelief,
    humanity: input.humanity ?? tpl.humanity,
    afterlife: input.afterlife,
    salvation: input.salvation,
    morality: input.morality ?? "",
    worship: input.worship,
    prayer: input.prayer,
    meditation: input.meditation ?? tpl.meditation,
    rituals: input.rituals ?? tpl.rituals,
    festivals: input.festivals ?? [],
    sacredPlaces: input.sacredPlaces ?? [],
    symbols: input.symbols ?? [],
    religiousLeaders: input.religiousLeaders,
    religiousLaw: input.religiousLaw ?? tpl.religiousLaw,
    sacredTexts: input.sacredTexts ?? [],
    oralTraditions: input.oralTraditions ?? tpl.oralTraditions,
    branches: input.branches ?? [],
    denominations: input.denominations ?? [],
    schools: input.schools ?? [],
    historicalDevelopment: input.historicalDevelopment,
    modernStatus: input.modernStatus,
    distribution: input.distribution,
    relatedReligions: input.relatedReligions ?? [],
    differences: input.differences ?? "See the related traditions' entries; the differences are recorded in each tradition's own account.",
    similarities: input.similarities ?? "See the related traditions' entries; shared family features are recorded in the family records.",
    sources: input.sources ?? [SRC_ENCYCLOPEDIA],
    confidence: input.confidence ?? "well_supported",
    lastReviewed: input.lastReviewed ?? RELIGION_REVIEW_DATE,
    summary: input.summary,
    simple: input.simple,
    advanced: input.advanced,
    researchNote: input.researchNote,
    controversialNote: input.controversialNote,
    expansionNote: input.expansionNote,
  };
}

/** The 12 major families with display metadata. */
export const RELIGION_FAMILY_META = [
  { family: "abrahamic", label: "Abrahamic traditions", description: "Traditions tracing spiritual lineage to Abraham: Judaism, Christianity, Islam, Baháʼí Faith, Samaritanism, Druze, Mandaeism, Rastafari and Yazidism." },
  { family: "dharmic", label: "Dharmic traditions", description: "Traditions originating in the Indian subcontinent: Hinduism, Buddhism, Jainism and Sikhism." },
  { family: "iranian", label: "Iranian traditions", description: "Traditions of the Iranian world: Zoroastrianism, Manichaeism and related movements." },
  { family: "east_asian", label: "East Asian traditions", description: "Taoism, Confucianism, Chinese folk religion, Shinto, Korean and Vietnamese traditions, Tengrism and Bon." },
  { family: "african_traditional", label: "African traditional religions", description: "Indigenous religious traditions of the African continent, region by region and people by people." },
  { family: "african_diaspora", label: "African diaspora traditions", description: "Traditions carried to the Americas and preserved: Vodou, Santería/Lucumí, Candomblé and related movements." },
  { family: "indigenous_american", label: "Indigenous American traditions", description: "Documented traditions of North, Central and South America, the Caribbean and the Arctic." },
  { family: "oceanian", label: "Oceanian & Australian traditions", description: "Aboriginal Australian, Māori, Polynesian, Melanesian, Micronesian and Hawaiian traditions." },
  { family: "ancient", label: "Historical & ancient religions", description: "Religions no longer widely practiced or historically transformed: Egyptian, Mesopotamian, Greek, Roman, Norse, Celtic, Slavic and more." },
  { family: "new_religious_movement", label: "Modern religions & new religious movements", description: "Movements founded from the 19th century onward." },
  { family: "humanistic", label: "Non-theistic & humanistic movements", description: "Secular, humanistic and non-theistic belief systems." },
  { family: "other", label: "Other traditions", description: "Traditions that do not fall under the other families." },
] as const;
