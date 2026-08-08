/**
 * Session 151 — Verbatim spec pinning for the Life Operating Principles
 * Engine: all 115 rules' titles and principles exactly as written in the
 * spec ("Rules of Life — To Become Unstoppable"). Guards against wording
 * drift in the curated catalog — the spec text is the source of truth.
 *
 * Also pins the 13 coaching-area labels, the 12 philosophy phrases and the
 * classification edge cases fixed in Session 151 (family, giving-up and
 * career-negotiation probes).
 */
import { describe, it, expect } from "vitest";
import { LifePrinciplesService } from "./lifePrinciples.service.js";
import { LIFE_COACHING_AREAS, LIFE_PHILOSOPHY_PAIRS } from "@windels/shared";

const EXPECTED: Array<[number, string, string]> = [
  [1, "Stay Alert", "Do not assume that bad things cannot happen to you. Stay aware, prepared, humble, and adaptable."],
  [2, "Know Your Worth", "Do not allow other people's opinions to determine your value."],
  [3, "Control Your Emotions", "Feel your emotions, but do not automatically allow them to make your decisions."],
  [4, "Think Before You React", "A moment of anger can create consequences that last for years."],
  [5, "Protect Your Peace", "Not every argument deserves your attention."],
  [6, "Stay Humble", "Success should increase your responsibility, not your arrogance."],
  [7, "Build Confidence Without Becoming Arrogant", "Know what you can do while remaining willing to learn."],
  [8, "Do Not Live for Approval", "You do not need everybody to understand your journey."],
  [9, "Learn From Failure", "Failure is information. Study what went wrong, make the correction, and continue."],
  [10, "Never Stop Growing", "Your education should not end when school ends."],
  [11, "Start Your Day With Intention", "Wake up and know what matters most that day."],
  [12, "Take Care of Your Body", "Exercise, rest, eat responsibly, hydrate, and maintain your health."],
  [13, "Read and Learn", "Spend part of your day learning something that improves your mind or your future."],
  [14, "Do the Difficult Things", "Growth often requires doing what is uncomfortable."],
  [15, "Keep Promises to Yourself", "Self-discipline begins when your actions match your decisions."],
  [16, "Avoid Unnecessary Distractions", "Protect your attention from things that consume time without creating value."],
  [17, "Be Consistent", "Small actions repeated over time can produce extraordinary results."],
  [18, "Do Not Wait for Motivation", "Build systems and habits that continue working when motivation disappears."],
  [19, "Rest Without Giving Up", "Rest is not failure. Recovery is part of sustained performance."],
  [20, "Finish What Matters", "Do not become addicted to starting things while avoiding completion."],
  [21, "Learn Valuable Skills", "Develop skills that create value for yourself and others."],
  [22, "Learn How Money Works", "Understand income, expenses, saving, debt, investing, taxes, risk, and business."],
  [23, "Learn to Communicate", "Your ability to explain, listen, negotiate, and understand people is a powerful life skill."],
  [24, "Ask Questions", "Never be ashamed to say, 'I don't know.'"],
  [25, "Learn From People", "Everyone you meet can teach you something."],
  [26, "Learn From History", "Study what happened before you make decisions about what comes next."],
  [27, "Learn to Think Critically", "Do not believe something simply because someone said it confidently."],
  [28, "Verify Important Information", "Check evidence before making important decisions."],
  [29, "Become Adaptable", "The world changes. Your ability to learn and adapt is an advantage."],
  [30, "Teach What You Learn", "Knowledge becomes more valuable when you use it to help others."],
  [31, "Spend Less Than You Earn", "A foundation of financial stability is controlling the gap between income and expenses."],
  [32, "Save Before You Spend Everything", "Build financial reserves for emergencies and future opportunities."],
  [33, "Avoid Unnecessary Debt", "Understand the cost and consequences before borrowing."],
  [34, "Build Multiple Sources of Value", "Develop skills, businesses, investments, or other legitimate sources of income where appropriate."],
  [35, "Do Not Chase Quick Money", "If something sounds too good to be true, investigate before committing your money."],
  [36, "Protect Your Money", "Use secure financial practices and understand financial risks."],
  [37, "Invest in Yourself", "Skills, education, health, relationships, and experience can produce long-term value."],
  [38, "Make Your Money Serve Your Goals", "Money is a tool. Define what you want it to accomplish."],
  [39, "Do Not Compare Your Wealth to Someone Else's", "You rarely know another person's full financial situation."],
  [40, "Pursue Financial Freedom Responsibly", "Build wealth without sacrificing integrity, health, relationships, or lawful conduct."],
  [41, "You Do Not Have to Announce Every Plan", "Some goals are better developed before they are publicly announced."],
  [42, "Protect Sensitive Information", "Not everyone needs access to your personal, financial, business, or private information."],
  [43, "Do Not Display Every Weakness Publicly", "Vulnerability can be healthy, but sensitive information should be shared with people you trust."],
  [44, "Let Results Speak", "You do not have to prove every plan before it becomes reality."],
  [45, "Think Strategically", "Before making a major move, consider the consequences, alternatives, risks, and timing."],
  [46, "Set Boundaries", "Learn to say 'no' without hatred and 'yes' without resentment."],
  [47, "Be Careful Who You Trust", "Trust should be built through consistent behavior, not words alone."],
  [48, "Do Not Confuse Privacy With Isolation", "Protecting your privacy does not mean refusing all meaningful relationships."],
  [49, "Protect Your Reputation", "Your character and credibility can take years to build and moments to damage."],
  [50, "Keep Your Next Move Purposeful", "Privacy should serve strategy—not deception."],
  [51, "Wake Up With a Mission", "Have something meaningful you are working toward."],
  [52, "Move Your Body", "Regular physical activity supports physical and mental wellbeing."],
  [53, "Drink Enough Water", "Maintain healthy hydration according to your individual needs."],
  [54, "Read Regularly", "Give your mind new information every day or week."],
  [55, "Stay Humble", "Never become too successful to learn."],
  [56, "Learn High-Value Skills", "Develop abilities that solve real problems."],
  [57, "Save Money", "Build financial resilience."],
  [58, "Protect Your Peace", "Choose carefully what deserves your time and emotional energy."],
  [59, "Ignore Unproductive Criticism", "Listen to useful feedback. Ignore criticism that exists only to destroy."],
  [60, "Build Before You Brag", "Let your work develop before seeking applause."],
  [61, "Speak With Purpose", "Say what needs to be said. Listen before responding."],
  [62, "Forgive Yourself for Past Mistakes", "Accept responsibility, learn the lesson, and stop allowing yesterday to control tomorrow."],
  [63, "Help Without Needing Applause", "Do good because it is valuable, not merely because people are watching."],
  [64, "Trust the Process—but Check the Process", "Patience is important, but blindly repeating a broken strategy is not."],
  [65, "Keep Trying", "Persistence matters, but persistence should include learning and adaptation."],
  [66, "Choose Your Environment Carefully", "Your surroundings can influence your habits, expectations, and decisions."],
  [67, "Surround Yourself With People Who Challenge You to Grow", "Good relationships can expand your perspective."],
  [68, "Don't Let One Failure Define You", "One event is not your entire story."],
  [69, "Don't Let One Success Define You", "Yesterday's achievement does not guarantee tomorrow's."],
  [70, "Compete With Your Previous Self", "Measure growth against who you were before."],
  [71, "Make Decisions Based on Long-Term Consequences", "Ask what today's decision could create months or years from now."],
  [72, "Be Reliable", "When you say you will do something, make a serious effort to do it."],
  [73, "Respect Other People", "Strength does not require humiliation of others."],
  [74, "Leave People Better Than You Found Them", "Use your knowledge, position, and resources constructively."],
  [75, "Keep Going—but Know When to Change Direction", "Quitting a bad strategy is not the same as giving up on your purpose."],
  [76, "Listen Before You Judge", "You do not know everything about another person's situation."],
  [77, "Communicate Clearly", "Do not expect people to understand what you never explained."],
  [78, "Respect Boundaries", "Your boundaries matter, and other people's boundaries matter too."],
  [79, "Choose Character Over Appearance", "People reveal themselves through consistent behavior."],
  [80, "Do Not Manipulate People", "Build relationships through honesty and mutual respect."],
  [81, "Do Not Confuse Love With Control", "Healthy relationships allow people to retain dignity and individuality."],
  [82, "Apologize When You Are Wrong", "An apology is not weakness."],
  [83, "Forgive Without Forgetting the Lesson", "Forgiveness does not require repeating the same mistake."],
  [84, "Walk Away From Destructive Relationships When Necessary", "Protecting yourself can sometimes require distance."],
  [85, "Celebrate Other People's Success", "Someone else's success does not automatically reduce yours."],
  [86, "Solve Problems, Don't Just Chase Money", "Value creation is the foundation of sustainable business."],
  [87, "Keep Your Word", "Trust is an economic asset."],
  [88, "Treat Customers With Respect", "Customers are people, not numbers."],
  [89, "Learn From Competition", "Competition can reveal opportunities to improve."],
  [90, "Do Not Build Blindly", "Research the problem before investing heavily in the solution."],
  [91, "Measure Results", "What gets measured can often be improved."],
  [92, "Protect Your Reputation", "A profitable opportunity that destroys long-term trust may not be worth it."],
  [93, "Hire Character and Competence", "Skills matter, but integrity matters too."],
  [94, "Build Systems", "Do not make an organization dependent on one person's memory."],
  [95, "Think Long Term", "Sustainable success usually requires patience."],
  [96, "Protect Your Passwords", "Use strong, unique credentials and appropriate security controls."],
  [97, "Think Before You Post", "The internet can preserve information for a long time."],
  [98, "Protect Your Digital Identity", "Be careful with personal information, financial information, and account access."],
  [99, "Verify Before Sharing", "Do not become a distributor of misinformation."],
  [100, "Don't Let Social Media Define Your Worth", "Online attention is not the same thing as real-world value."],
  [101, "Use Technology as a Tool", "Technology should increase your capability, not control your entire life."],
  [102, "Learn AI", "Understand how AI can improve education, business, creativity, research, and productivity."],
  [103, "Keep Human Judgment", "AI can assist decisions, but important decisions require appropriate human judgment."],
  [104, "Tell the Truth", "Integrity begins with honesty."],
  [105, "Take Responsibility", "Own your actions."],
  [106, "Keep Learning", "Intelligence is not a finished product."],
  [107, "Treat People With Dignity", "Strength and kindness can coexist."],
  [108, "Do Not Abuse Power", "The way you treat people who cannot benefit you reveals character."],
  [109, "Keep Your Principles Under Pressure", "Character is tested when doing the right thing becomes difficult."],
  [110, "Be Grateful", "Recognize what is going well while continuing to improve."],
  [111, "Stay Curious", "Curiosity keeps the mind alive."],
  [112, "Be Useful", "Develop yourself so you can contribute something meaningful."],
  [113, "Protect Your Integrity", "Do not trade your principles for temporary rewards."],
  [114, "Give Back", "Success becomes more meaningful when it creates opportunities for others."],
  [115, "Leave a Legacy", "Think about what you want your work, relationships, and actions to leave behind."],
];

describe("Session 151 — spec-verbatim rule pinning", () => {
  it("all 115 titles and principles match the spec text exactly", () => {
    for (const [n, title, principle] of EXPECTED) {
      const r = LifePrinciplesService.getRuleByNumber(n);
      expect(r, `rule ${n} exists`).not.toBeNull();
      expect(r!.title, `rule ${n} title`).toBe(title);
      expect(r!.principle, `rule ${n} principle`).toBe(principle);
    }
  });

  it("the 13 coaching-area labels match the spec exactly", () => {
    const labels = LIFE_COACHING_AREAS.map((a) => a.label);
    expect(labels).toEqual([
      "Discipline", "Money", "Career", "Business", "Relationships", "Leadership",
      "Education", "Personal growth", "Mental resilience", "Health habits",
      "Digital life", "Spirituality", "Decision-making",
    ]);
  });

  it("the 12 philosophy phrases match the spec exactly", () => {
    const phrases = LIFE_PHILOSOPHY_PAIRS.map((p) => p.phrase);
    expect(phrases).toEqual([
      "Discipline without cruelty.",
      "Confidence without arrogance.",
      "Privacy without paranoia.",
      "Ambition without greed.",
      "Success without disrespect.",
      "Strength without oppression.",
      "Forgiveness without abandoning boundaries.",
      "Persistence without refusing to adapt.",
      "Technology without losing humanity.",
      "Knowledge without arrogance.",
      "Freedom with responsibility.",
      "Power with accountability.",
    ]);
  });
});

describe("Session 151 — coaching classification edge cases", () => {
  const cases: Array<[string, string]> = [
    ["How do I become a better father?", "relationships"],
    ["How can I be a better mother to my kids?", "relationships"],
    ["How do I become a better parent?", "relationships"],
    ["My son is struggling at school", "relationships"],
    ["I feel like giving up on my dreams", "mental_resilience"],
    ["I feel hopeless about the future", "mental_resilience"],
    ["How do I negotiate a raise with my boss?", "career"],
    ["I got fired from my job", "career"],
  ];
  it.each(cases)("classifies %j into %s", (text, expected) => {
    const res = LifePrinciplesService.ask({ question: text });
    expect(res.area.id, text).toBe(expected);
    expect(res.classification!.score).toBeGreaterThan(0);
    expect(res.rules!.length).toBeGreaterThan(0);
  });
});
