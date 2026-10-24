// Placeholder "What did we miss?" questions until onboarding.questions is live. Each one is written
// from past payroll lines the fixture rules don't explain; the ids are those Gusto lines.
export type MissedQuestion = {
  id: string;
  companyId: string;
  text: string;
  options: string[];
  evidence: string[];
  relatedRuleIds: string[];
};

export const MISSED_SOURCE =
  "placeholder, written from data/fixtures/a/pastPayrolls.json";

export const missedQuestions: MissedQuestion[] = [
  {
    id: "a-oq-01",
    companyId: "a",
    text: "Casey Lindqvist got an off-cycle commission in cycles 1 and 3, but not in 2 or 4. When is commission paid?",
    options: [
      "When they quote a job in person",
      "Only on landscape lighting jobs",
      "Something else",
    ],
    evidence: ["a-pp-106", "a-pp-310"],
    relatedRuleIds: ["a-rule-09", "a-rule-15"],
  },
  {
    id: "a-oq-02",
    companyId: "a",
    text: "Dakota Brennan got an off-cycle bonus in every past cycle. Is that the 10% share of job profit?",
    options: ["Yes, it’s the split", "No, it’s something else", "Not sure"],
    evidence: ["a-pp-112", "a-pp-211", "a-pp-319", "a-pp-411"],
    relatedRuleIds: ["a-rule-11"],
  },
  {
    id: "a-oq-03",
    companyId: "a",
    text: "In cycle 3, Emerson Vale got cash tips by Venmo while the crew’s tips went through Gusto. How should Venmo workers get tips?",
    options: [
      "By Venmo, with their hours",
      "Through Gusto like everyone",
      "Something else",
    ],
    evidence: ["a-pp-317"],
    relatedRuleIds: ["a-rule-10"],
  },
];
