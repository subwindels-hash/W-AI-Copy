/**
 * Session 150 — Life Operating Principles Engine: curated rule catalog,
 * Part IV (rules 86–95, Business & Work), Part V (rules 96–103, Digital
 * Life) and Part VI (rules 104–115, Character).
 *
 * Same discipline as the earlier seeds: practical principles, not absolute
 * laws — with educational framing and considerations notes where an
 * absolutist reading is possible.
 */
import type { LifeRule } from "@windels/shared";

interface RuleSeed {
  n: number;
  part: LifeRule["part"];
  title: string;
  principle: string;
  why: string;
  how: string;
  action: string;
  reflection: string;
  considerations?: string;
  tags?: string[];
}

function rule(r: RuleSeed): LifeRule {
  return {
    id: `lp.r${r.n}`,
    number: r.n,
    part: r.part,
    title: r.title,
    principle: r.principle,
    whyItMatters: r.why,
    howToApply: r.how,
    action: r.action,
    reflectionQuestion: r.reflection,
    considerations: r.considerations,
    tags: r.tags ?? [],
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * PART IV — BUSINESS & WORK RULES (86–95)
 * ════════════════════════════════════════════════════════════════════════════ */

const BUSINESS: LifeRule[] = [
  rule({
    n: 86,
    part: "business_work",
    title: "Solve Problems, Don't Just Chase Money",
    principle: "Value creation is the foundation of sustainable business.",
    why: "Money follows value, not the reverse. Businesses that obsess over revenue without solving a real problem eventually run out of customers who care.",
    how: "Define the problem you solve and for whom. Improve the solution continuously. Let revenue be the report card on value, not the goal itself.",
    action: "Today, write down the exact problem your work or business solves — and who feels it.",
    reflection: "Would my customers genuinely miss my product or service if it disappeared?",
    tags: ["business", "value", "problem solving"],
  }),
  rule({
    n: 87,
    part: "business_work",
    title: "Keep Your Word",
    principle: "Trust is an economic asset.",
    why: "In business, trust reduces every transaction cost: negotiations, contracts, credit, referrals. A reputation for keeping your word is worth more than most marketing.",
    how: "Promise only what you can deliver. Deliver what you promised, on time. When circumstances change, communicate early and make it right.",
    action: "Today, deliver one promise early or communicate about one you might miss.",
    reflection: "Would my business partners describe me as someone whose word holds?",
    tags: ["trust", "integrity", "business"],
  }),
  rule({
    n: 88,
    part: "business_work",
    title: "Treat Customers With Respect",
    principle: "Customers are people, not numbers.",
    why: "Every customer is a human with choices and a memory. Respect builds loyalty, referrals and forgiveness; treating people as numbers builds churn and complaints.",
    how: "Listen to complaints fully and fix root causes. Communicate honestly about delays and prices. Thank customers genuinely and specifically.",
    action: "Today, respond to one customer (or colleague) with full attention and respect.",
    reflection: "When was I last a customer treated badly — and what did I do next?",
    tags: ["customers", "respect", "service"],
  }),
  rule({
    n: 89,
    part: "business_work",
    title: "Learn From Competition",
    principle: "Competition can reveal opportunities to improve.",
    why: "Competitors are free market research: they show what customers value and where the market is moving. Ignoring them is expensive; copying them is lazy; learning from them is smart.",
    how: "Study competitors' strengths and weaknesses honestly. Ask why customers choose them. Differentiate on genuine advantage, not imitation.",
    action: "Today, study one competitor and write down one thing they do better than you.",
    reflection: "What would my competitor say is my unfair advantage?",
    tags: ["competition", "business", "improvement"],
  }),
  rule({
    n: 90,
    part: "business_work",
    title: "Do Not Build Blindly",
    principle: "Research the problem before investing heavily in the solution.",
    why: "Most failed ventures fail at the start: a solution built for a problem nobody has, or for customers who cannot pay. Research is cheap; blind building is expensive.",
    how: "Before building, talk to potential customers. Test the smallest version of the solution (a prototype, a pre-order, a pilot). Verify people will pay before scaling.",
    action: "Today, ask one potential customer one real question about your idea.",
    reflection: "What am I building that I have never verified anyone will use or pay for?",
    tags: ["research", "business", "validation"],
  }),
  rule({
    n: 91,
    part: "business_work",
    title: "Measure Results",
    principle: "What gets measured can often be improved.",
    why: "Without measurement, improvement is guesswork: you cannot tell which changes worked. Numbers turn opinions into evidence.",
    how: "Pick a few meaningful metrics (revenue, costs, customers, quality, time) and track them consistently. Review them regularly. Change one variable at a time.",
    action: "Today, write down the three numbers that best measure your work — and their current values.",
    reflection: "What am I managing without measuring?",
    tags: ["measurement", "improvement", "business"],
  }),
  rule({
    n: 92,
    part: "business_work",
    title: "Protect Your Reputation",
    principle: "A profitable opportunity that destroys long-term trust may not be worth it.",
    why: "Reputation compounds slowly and collapses quickly. One exploitative deal can erase years of goodwill — and the profits from it rarely cover the loss.",
    how: "Before accepting a deal, ask: would I be comfortable explaining this to my customers, family and future partners? Run from opportunities that require secrecy or exploitation.",
    action: "Today, review one current practice: would you defend it publicly?",
    reflection: "What am I doing for profit that I would not want publicly known?",
    tags: ["reputation", "integrity", "business"],
  }),
  rule({
    n: 93,
    part: "business_work",
    title: "Hire Character and Competence",
    principle: "Skills matter, but integrity matters too.",
    why: "Competence without integrity is a liability with talent: it produces results until it produces damage. Character is the filter that keeps competence productive.",
    how: "Assess skills with evidence (tests, work samples). Assess character with behaviour (references, how they treat others, how they handle small responsibilities). Hire the combination, not either alone.",
    action: "Today, in any hiring or collaboration decision you influence, weight integrity as heavily as skill.",
    reflection: "What does my own hiring or partnership history reveal about what I actually value?",
    tags: ["hiring", "character", "leadership"],
  }),
  rule({
    n: 94,
    part: "business_work",
    title: "Build Systems",
    principle: "Do not make an organization dependent on one person's memory.",
    why: "An organization that runs on one person's head is a hostage: to their health, mood and departure. Systems turn knowledge into the organization's own asset.",
    how: "Write down processes as they are done. Document decisions, passwords and contacts where appropriate. Train others to run key functions. Automate what repeats.",
    action: "Today, document one process you currently keep only in your head.",
    reflection: "If I were away for a month, what would stop working — and why?",
    tags: ["systems", "organization", "business"],
  }),
  rule({
    n: 95,
    part: "business_work",
    title: "Think Long Term",
    principle: "Sustainable success usually requires patience.",
    why: "Quick wins are often rented from the future — borrowed growth, deferred maintenance, burned trust. Long-term thinking builds assets that keep paying.",
    how: "Make decisions with a 5–10 year frame where possible. Invest in durable assets: people, brand, systems, relationships. Accept slower visible progress for surer foundations.",
    action: "Today, make one decision with the five-year version of your work in mind.",
    reflection: "What short-term gain am I currently renting from my future?",
    tags: ["long-term", "patience", "business"],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * PART V — DIGITAL LIFE RULES (96–103)
 * ════════════════════════════════════════════════════════════════════════════ */

const DIGITAL: LifeRule[] = [
  rule({
    n: 96,
    part: "digital_life",
    title: "Protect Your Passwords",
    principle: "Use strong, unique credentials and appropriate security controls.",
    why: "Passwords are the keys to your digital life — money, identity, work, relationships. A reused password turns one breach into many.",
    how: "Use a password manager to generate strong, unique passwords. Enable two-factor authentication on important accounts. Change credentials after any suspected breach.",
    action: "Today, check your most important account: unique password and two-factor authentication on?",
    reflection: "How many accounts would be at risk if one of my passwords leaked?",
    tags: ["passwords", "security", "digital"],
  }),
  rule({
    n: 97,
    part: "digital_life",
    title: "Think Before You Post",
    principle: "The internet can preserve information for a long time.",
    why: "Posts are permanent in ways they do not look: screenshots, archives and algorithms resurface the past. What seemed funny or necessary today can cost a job, a case or a relationship years later.",
    how: "Before posting, ask: would I defend this in public, to my employer, to my family, in five years? Post as if your future self is watching — because they are.",
    action: "Today, review one thing you have posted and remove anything your future self would regret.",
    reflection: "What have I posted that I would not post today?",
    tags: ["posting", "reputation", "digital"],
  }),
  rule({
    n: 98,
    part: "digital_life",
    title: "Protect Your Digital Identity",
    principle: "Be careful with personal information, financial information, and account access.",
    why: "Your digital identity is the sum of your accounts and data — and identity theft is slow to detect and expensive to fix. Protecting it is mostly prevention.",
    how: "Share personal data only where needed. Review app permissions and connected accounts. Be suspicious of requests for codes, passwords or payments — even from familiar-looking messages.",
    action: "Today, review one account's security settings and remove anything unnecessary.",
    reflection: "What access to my identity have I handed out without remembering?",
    tags: ["identity", "security", "digital"],
  }),
  rule({
    n: 99,
    part: "digital_life",
    title: "Verify Before Sharing",
    principle: "Do not become a distributor of misinformation.",
    why: "Every share extends a message's reach — including false, harmful or manipulated ones. Your share is an endorsement to the people who trust you.",
    how: "Before sharing, check the source, the date and a second independent source. Pause on anything that inflames. When you have shared something false, correct it publicly.",
    action: "Today, verify one thing before sharing it — or correct something you already shared.",
    reflection: "How many things have I shared that I never actually checked?",
    tags: ["misinformation", "verification", "digital"],
  }),
  rule({
    n: 100,
    part: "digital_life",
    title: "Don't Let Social Media Define Your Worth",
    principle: "Online attention is not the same thing as real-world value.",
    why: "Likes, followers and engagement are a game with rigged rules — algorithms, curation and luck. Measuring your worth by them outsources your self-esteem to a feed.",
    how: "Keep a separate record of real value: skills built, people helped, work completed. Limit comparison time on social platforms. Remember you are seeing highlights, not lives.",
    action: "Today, log off one feed and do one real-world thing that creates actual value.",
    reflection: "Whose life am I judging mine against without seeing the full picture?",
    tags: ["social media", "self-worth", "digital"],
  }),
  rule({
    n: 101,
    part: "digital_life",
    title: "Use Technology as a Tool",
    principle: "Technology should increase your capability, not control your entire life.",
    why: "Tools serve goals; when they stop serving, they are just habits with screens. Uncontrolled technology fragments attention, sleep and relationships.",
    how: "Define what you want from each tool and audit whether it delivers. Set boundaries: no-phone times, app limits, notification discipline. Reclaim the first and last hour of your day.",
    action: "Today, put your phone out of reach for one focused hour.",
    reflection: "Who is using whom — do I use my devices, or do they use me?",
    tags: ["technology", "focus", "balance"],
  }),
  rule({
    n: 102,
    part: "digital_life",
    title: "Learn AI",
    principle: "Understand how AI can improve education, business, creativity, research, and productivity.",
    why: "AI is becoming a general-purpose capability, like electricity or the internet. Understanding what it does well — and badly — is becoming a basic skill of the era.",
    how: "Use AI tools hands-on for real tasks: writing, research, coding help, analysis. Learn its limits: it can be confidently wrong. Keep learning as the tools evolve.",
    action: "Today, use an AI tool for one real task and check its output critically.",
    reflection: "What could I do better or faster with AI — and what should I never delegate to it?",
    tags: ["ai", "skills", "digital"],
  }),
  rule({
    n: 103,
    part: "digital_life",
    title: "Keep Human Judgment",
    principle: "AI can assist decisions, but important decisions require appropriate human judgment.",
    why: "AI can summarize, predict and suggest — but important decisions carry values, consequences and accountability that belong to humans. Delegating judgment entirely is how mistakes scale.",
    how: "Use AI for inputs, not verdicts. Verify critical outputs against reliable sources. Take responsibility for decisions you act on, whatever assisted them.",
    action: "Today, question one AI-generated answer before acting on it.",
    reflection: "What decisions am I letting tools make that I should be making?",
    tags: ["ai", "judgment", "decisions"],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * PART VI — CHARACTER RULES (104–115)
 * ════════════════════════════════════════════════════════════════════════════ */

const CHARACTER: LifeRule[] = [
  rule({
    n: 104,
    part: "character",
    title: "Tell the Truth",
    principle: "Integrity begins with honesty.",
    why: "Truth is the load-bearing wall of everything else — trust, reputation, relationships, self-respect. Every lie requires more lies to hold it up.",
    how: "Say the truth kindly and at the right time. Admit what you do not know. When you have lied, correct it quickly. Let honesty be the default, not the exception.",
    action: "Today, be fully honest in one conversation where a comfortable lie was available.",
    reflection: "Where have I let small lies grow into large complications?",
    tags: ["honesty", "integrity", "character"],
  }),
  rule({
    n: 105,
    part: "character",
    title: "Take Responsibility",
    principle: "Own your actions.",
    why: "Responsibility is the seat of control: the person who owns their actions can change them. Blame hands the steering wheel to circumstance.",
    how: "When things go wrong, start with 'what did I do or fail to do?' Make amends where you caused harm. Then fix the system, not just the symptom.",
    action: "Today, take responsibility for one thing you have been blaming elsewhere.",
    reflection: "What am I currently blaming that I actually control?",
    tags: ["responsibility", "accountability", "character"],
  }),
  rule({
    n: 106,
    part: "character",
    title: "Keep Learning",
    principle: "Intelligence is not a finished product.",
    why: "Treating intelligence as fixed turns challenges into threats. Treating it as growable turns challenges into training — and it is mostly true.",
    how: "Take on things slightly beyond your current ability. After setbacks, ask what the task taught you. Praise effort and strategy in yourself and others, not just results.",
    action: "Today, attempt one task slightly beyond your current skill.",
    reflection: "What have I avoided because I believed I 'just can't' do it?",
    tags: ["learning", "growth mindset", "character"],
  }),
  rule({
    n: 107,
    part: "character",
    title: "Treat People With Dignity",
    principle: "Strength and kindness can coexist.",
    why: "Dignity is not earned by status; it is owed to every person. Treating people with dignity costs nothing and builds everything — trust, loyalty, peace.",
    how: "Assume good intent until shown otherwise. Listen to people below you in rank as seriously as above. Keep your word to everyone, not just the powerful.",
    action: "Today, treat one person with deliberate dignity — especially someone who cannot repay it.",
    reflection: "Who do I treat as less important than they are?",
    tags: ["dignity", "respect", "kindness"],
  }),
  rule({
    n: 108,
    part: "character",
    title: "Do Not Abuse Power",
    principle: "The way you treat people who cannot benefit you reveals character.",
    why: "Power is a test: it shows whether your decency was genuine or conditional. People who cannot help you are the mirror that shows your real character.",
    how: "Notice how you treat waiters, drivers, juniors, strangers. Hold yourself to the same standard with everyone. When you have power over someone, protect their dignity.",
    action: "Today, observe how you treat someone who cannot do anything for you — and adjust.",
    reflection: "If my character were judged only by how I treat the powerless, what would the verdict be?",
    tags: ["power", "character", "humility"],
  }),
  rule({
    n: 109,
    part: "character",
    title: "Keep Your Principles Under Pressure",
    principle: "Character is tested when doing the right thing becomes difficult.",
    why: "Easy honesty is not character; expensive honesty is. The decisions made under pressure — when the right thing costs something — are the ones that define you.",
    how: "Decide your non-negotiables before pressure arrives. When a tempting shortcut appears, ask what it costs your integrity. Build support so you are not tested alone.",
    action: "Today, name one principle you will not trade — and one situation that might test it.",
    reflection: "What would I be willing to lose rather than compromise my principles?",
    tags: ["integrity", "principles", "courage"],
  }),
  rule({
    n: 110,
    part: "character",
    title: "Be Grateful",
    principle: "Recognize what is going well while continuing to improve.",
    why: "Gratitude is not complacency — it is accurate accounting. Noticing what works keeps you grounded and motivated; gratitude is also one of the most reliable mood-lifters known to research.",
    how: "Keep a short gratitude practice: name a few specific things daily. Thank people specifically and genuinely. Balance ambition with appreciation for the present.",
    action: "Today, write down three specific things you are grateful for — and tell one person.",
    reflection: "What am I taking for granted that I would deeply miss if it were gone?",
    tags: ["gratitude", "perspective", "wellbeing"],
  }),
  rule({
    n: 111,
    part: "character",
    title: "Stay Curious",
    principle: "Curiosity keeps the mind alive.",
    why: "Curiosity is the appetite that feeds every other virtue of the mind. Losing it is how people become closed, stagnant and easily misled.",
    how: "Ask 'why' and 'how' daily. Follow one genuine question wherever it leads each week. Keep company with curious people and let their questions pull yours.",
    action: "Today, follow one question you have been curious about for at least twenty minutes.",
    reflection: "What was the last thing I was genuinely curious about — and did I follow it?",
    tags: ["curiosity", "learning", "mind"],
  }),
  rule({
    n: 112,
    part: "character",
    title: "Be Useful",
    principle: "Develop yourself so you can contribute something meaningful.",
    why: "Usefulness connects personal growth to the world: skills become service, knowledge becomes help. It is also the most reliable path to a sense of purpose.",
    how: "Ask what the people around you need that you could provide. Build the skill or resource to provide it. Start with small useful acts and grow the scope.",
    action: "Today, do one useful thing for someone that uses your particular strengths.",
    reflection: "What do I have — skill, time, resources — that someone around me needs?",
    tags: ["service", "purpose", "contribution"],
  }),
  rule({
    n: 113,
    part: "character",
    title: "Protect Your Integrity",
    principle: "Do not trade your principles for temporary rewards.",
    why: "Every principle traded for a reward lowers the price of the next trade. Integrity is not a possession you keep; it is a habit you repeat — or lose.",
    how: "Notice small trades before they become large ones. When a reward demands a compromise, decline clearly. Review your week for quiet compromises.",
    action: "Today, identify one small compromise you have been making — and stop it.",
    reflection: "What reward has been big enough for me to trade a principle for?",
    tags: ["integrity", "principles", "character"],
  }),
  rule({
    n: 114,
    part: "character",
    title: "Give Back",
    principle: "Success becomes more meaningful when it creates opportunities for others.",
    why: "Success that ends with you is a dead end; success that opens doors for others becomes a corridor. Giving back converts achievement into legacy and meaning.",
    how: "Give what you have that others need: money, time, knowledge, access, encouragement. Mentor someone behind you on your path. Give in ways that create capability, not dependence.",
    action: "Today, give something — knowledge, time, money, access — to someone who needs it.",
    reflection: "Who is behind me on the path I travelled, and what am I doing for them?",
    tags: ["giving", "legacy", "service"],
  }),
  rule({
    n: 115,
    part: "character",
    title: "Leave a Legacy",
    principle: "Think about what you want your work, relationships, and actions to leave behind.",
    why: "Legacy is the answer to the question 'what was the point?' — decided while you can still influence it. Thinking about it early shapes daily choices toward something that outlasts you.",
    how: "Write what you want people to say about you — in work, family and community — and check your actions against it. Invest in things that outlast you: people, institutions, ideas, values.",
    action: "Today, write one sentence describing the legacy you are building — and do one small thing that serves it.",
    reflection: "If my life ended in ten years, what would I regret not having built?",
    tags: ["legacy", "purpose", "meaning"],
  }),
];

export const LIFE_RULES_PART3: LifeRule[] = [...BUSINESS, ...DIGITAL, ...CHARACTER];
