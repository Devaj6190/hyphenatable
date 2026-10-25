// Sealed M2 grading on a synthetic runbook key and synthetic proposed rules (invented ids and statements).
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { REPO } from "../lib/io";
import { seal, unseal } from "../lib/seal";
import { freeze, type ProposedRule, ProposedRules } from "../m2-freeze";
import { checkFrozen, llmJudge, runGrade, toGrading } from "../m2-grade";
import { gradeRules, type KeyRule } from "../m2-match";
import { m2 } from "../m2-rules";

const PASS = "correct horse battery staple";
const key: KeyRule[] = [
  {
    id: "RB-01",
    ruleType: "overtime_policy",
    params: { weeklyHours: 40, multiplier: 1.5, workweek: "Monday-Sunday" },
    statement: "Overtime after 40 hours, Monday to Sunday.",
    scope: "all hourly",
    sourceSection: "2.1",
  },
  {
    id: "RB-02",
    ruleType: "long_shift_threshold",
    params: { hours: 10 },
    statement: "Shifts over 10 hours get a look.",
    scope: "field",
    sourceSection: "2.4",
  },
  {
    id: "RB-03",
    ruleType: "pay_rate",
    params: { workerId: "r:w:x1", rateCents: 2500 },
    statement: "Crew rate is $25.",
    scope: "r:w:x1",
    sourceSection: "3.1",
  },
  {
    id: "RB-04",
    ruleType: "venmo_rate",
    params: { workerId: "r:w:x2", rateCents: 2000 },
    statement: "Helper paid $20 by Venmo.",
    scope: "r:w:x2",
    sourceSection: "3.2",
  },
  {
    id: "RB-05",
    ruleType: "other",
    params: { topic: "rain days" },
    statement: "Rain days are not paid.",
    scope: "all",
    sourceSection: "5.0",
  },
];
const rule = (
  id: string,
  type: string,
  params: Record<string, unknown>,
): ProposedRule => ({
  id,
  type,
  params,
  confidence: 0.9,
  evidence: ["r:c:1"],
  shape: "rule",
});
const proposed: ProposedRule[] = [
  rule("p1", "overtime_policy", {
    weeklyHours: 40,
    multiplier: 1.5,
    workweek: "monday-sunday",
    dailyHours: null,
  }),
  rule("p2", "long_shift_threshold", { hours: 10.2 }),
  rule("p3", "pay_rate", { workerId: "r:w:x1", rateCents: 2400 }),
  rule("p4", "expense_account_kind", { accountName: "Fuel", kind: "overhead" }),
];

describe("sealing", () => {
  test("round trip; a wrong passphrase or a changed byte fails; short passphrases refused", () => {
    const s = seal(Buffer.from("secret key"), PASS);
    expect(unseal(s, PASS).toString()).toBe("secret key");
    expect(() => unseal(s, `${PASS}!`)).toThrow(/wrong passphrase/);
    const tampered = {
      ...s,
      data: Buffer.from("x".repeat(10)).toString("base64"),
    };
    expect(() => unseal(tampered, PASS)).toThrow(
      /wrong passphrase or the file was changed/,
    );
    expect(() => seal(Buffer.from("x"), "short")).toThrow(/12 characters/);
    expect(JSON.stringify(s)).not.toContain("secret");
  });
});

describe("freezing", () => {
  const bytes = Buffer.from(JSON.stringify(proposed));
  test("hash and count; rules without evidence or with duplicate ids are refused", () => {
    const f = freeze(bytes, new Date("2026-10-25T00:00:00.000Z"));
    expect(f).toMatchObject({ count: 4, frozenAt: "2026-10-25T00:00:00.000Z" });
    expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() =>
      freeze(
        Buffer.from(JSON.stringify([{ ...proposed[0], evidence: [] }])),
        new Date(),
      ),
    ).toThrow(/no evidence/);
    expect(() =>
      freeze(
        Buffer.from(JSON.stringify([proposed[0], proposed[0]])),
        new Date(),
      ),
    ).toThrow(/duplicate/);
  });
  test("grading refuses a rules file that changed after freezing", () => {
    const f = freeze(bytes, new Date());
    expect(() => checkFrozen(bytes, f)).not.toThrow();
    expect(() => checkFrozen(Buffer.from(`${bytes} `), f)).toThrow(
      /changed after it was frozen/,
    );
  });
});

describe("both onboarding shapes: Proposals (lessons/history.ts) and Rule rows", () => {
  // Proposal = { type, params, statement, evidence, seenInCycles, ofCycles, confidence } — no id.
  const proposals = [
    {
      type: "overtime_policy",
      params: { weeklyHours: 40, multiplier: 1.5, workweek: "Monday-Sunday" },
      statement: "OT after 40 h",
      evidence: ["r:c:1", "r:c:2"],
      seenInCycles: 3,
      ofCycles: 3,
      confidence: 0.95,
    },
    {
      type: "pay_rate",
      params: { workerId: "r:w:x1", rateCents: 2500 },
      statement: "rate",
      evidence: ["r:c:3"],
      seenInCycles: 3,
      ofCycles: 3,
      confidence: 0.9,
    },
  ];
  // Convex `rules` rows: _id, type, params, provenance.evidence, backtest.
  const rows = [
    {
      _id: "k17abc",
      companyId: "r",
      type: "overtime_policy",
      params: { weeklyHours: 40, multiplier: 1.5, workweek: "Monday-Sunday" },
      status: "active",
      source: "history",
      provenance: {
        lessonId: null,
        flagId: null,
        answeredBy: null,
        approvedBy: "u1",
        approvedAt: null,
        evidence: ["r:c:1"],
      },
      backtest: { cycles: 3, agree: 3, disagree: 0 },
      confidence: 0.95,
    },
    {
      _id: "k17def",
      companyId: "r",
      type: "long_shift_threshold",
      params: { hours: 10 },
      status: "active",
      source: "history",
      provenance: {
        lessonId: null,
        flagId: null,
        answeredBy: null,
        approvedBy: "u1",
        approvedAt: null,
        evidence: ["r:c:4"],
      },
      backtest: null,
      confidence: 0.8,
    },
  ];
  test("Proposals get ids by position; Rule rows keep their _id; both freeze and grade on type + params", async () => {
    const pBytes = Buffer.from(JSON.stringify(proposals));
    const rBytes = Buffer.from(JSON.stringify(rows));
    expect(freeze(pBytes, new Date()).count).toBe(2);
    expect(freeze(rBytes, new Date()).count).toBe(2);
    const p = ProposedRules.parse(proposals);
    expect(p.map((x) => [x.id, x.shape, x.evidence.length])).toEqual([
      ["proposal-1", "proposal", 2],
      ["proposal-2", "proposal", 1],
    ]);
    const r = ProposedRules.parse(rows);
    expect(r.map((x) => [x.id, x.shape])).toEqual([
      ["k17abc", "rule"],
      ["k17def", "rule"],
    ]);
    const gp = await gradeRules(key, p);
    expect(
      gp.rules.slice(0, 3).map((x) => [x.keyId, x.verdict, x.proposedId]),
    ).toEqual([
      ["RB-01", "match", "proposal-1"],
      ["RB-02", "not_learned", null],
      ["RB-03", "match", "proposal-2"],
    ]);
    const gr = await gradeRules(key, r);
    expect(
      gr.rules.slice(0, 3).map((x) => [x.keyId, x.verdict, x.proposedId]),
    ).toEqual([
      ["RB-01", "match", "k17abc"],
      ["RB-02", "match", "k17def"],
      ["RB-03", "not_learned", null],
    ]);
  });
  test("a Proposal without evidence is refused", () => {
    expect(() =>
      ProposedRules.parse([{ ...proposals[0], evidence: [] }]),
    ).toThrow(/no evidence/);
  });
});

describe("matching", () => {
  test("deterministic first: match within tolerance, differs names the param; the rest need a human without a judge", async () => {
    const r = await gradeRules(key, proposed);
    expect(
      r.rules.map((x) => [x.keyId, x.verdict, x.proposedId, x.differingParams]),
    ).toEqual([
      ["RB-01", "match", "p1", []],
      ["RB-02", "match", "p2", []], // 10.2 vs 10 within 0.25 h
      ["RB-03", "differs", "p3", ["rateCents"]],
      ["RB-04", "needs_human_review", null, []],
      ["RB-05", "needs_human_review", null, []],
    ]);
    expect(r.extraProposedIds).toEqual(["p4"]);
    expect(r.counts).toEqual({
      total: 5,
      match: 2,
      differs: 1,
      notLearned: 0,
      needsReview: 2,
      extra: 1,
    });
  });
  test("with a judge; a judge pointing at an unknown proposal is sent to human review", async () => {
    const r = await gradeRules(key, proposed, async (i) =>
      i.key.id === "RB-05"
        ? { verdict: "match", proposedId: "p4", differingParams: [] }
        : { verdict: "not_learned", proposedId: null, differingParams: [] },
    );
    expect(r.counts).toEqual({
      total: 5,
      match: 3,
      differs: 1,
      notLearned: 1,
      needsReview: 0,
      extra: 0,
    });
    // RB-04 is judged first and leaves p4 unused, so RB-05 can take it.
    expect(r.rules.find((x) => x.keyId === "RB-05")).toMatchObject({
      verdict: "match",
      proposedId: "p4",
      by: "judge",
    });
    const bad = await gradeRules(key, proposed, async () => ({
      verdict: "match",
      proposedId: "nope",
      differingParams: [],
    }));
    expect(bad.counts.needsReview).toBe(2);
  });
  test("no proposals left → not learned", async () => {
    const r = await gradeRules(key, proposed.slice(0, 3));
    expect(r.rules.find((x) => x.keyId === "RB-05")?.verdict).toBe(
      "not_learned",
    );
  });
  test("the model judge gets types and params only, never the runbook statement", async () => {
    const sent: string[] = [];
    const client = {
      messages: {
        create: async (body: { messages: { content: unknown }[] }) => {
          sent.push(String(body.messages[0].content));
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  verdict: "not_learned",
                  proposedId: null,
                  differingParams: [],
                }),
              },
            ],
            stop_reason: "end_turn",
            usage: { input_tokens: 1, output_tokens: 1 },
          };
        },
      },
    };
    // A proposal with a name-like key ("accountName") fails the engine's model-input scrub: nothing is sent,
    // and those key rules go to a person.
    // biome-ignore lint/suspicious/noExplicitAny: a minimal stand-in for the Anthropic client
    const judge = llmJudge(client as any);
    const blocked = await gradeRules(key, proposed, judge);
    expect(sent).toEqual([]);
    expect(blocked.counts.needsReview).toBe(2);
    const clean = proposed.map((p) =>
      p.id === "p4"
        ? rule("p4", "expense_account_kind", {
            account: "Fuel",
            kind: "overhead",
          })
        : p,
    );
    const r = await gradeRules(key, clean, judge);
    expect(sent.length).toBe(2);
    for (const s of sent)
      for (const k of key) expect(s).not.toContain(k.statement);
    expect(r.counts.notLearned).toBe(2);
  });
});

describe("runGrade: frozen rules, sealed key, detail only under data/private/", () => {
  mkdirSync(join(REPO, "data/private"), { recursive: true });
  const priv = mkdtempSync(join(REPO, "data/private/", "_m2-selftest-"));
  const work = mkdtempSync(join(tmpdir(), "m2-"));
  afterAll(() => {
    rmSync(priv, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  });
  const rulesPath = join(work, "proposed.json");
  const keyPath = join(work, "runbook-key.json.enc");
  const freezePath = join(work, "m2-freeze.json");
  writeFileSync(rulesPath, JSON.stringify(proposed, null, 2));
  writeFileSync(
    keyPath,
    JSON.stringify(seal(Buffer.from(JSON.stringify(key)), PASS)),
  );
  const now = new Date("2026-10-25T01:02:03.000Z");
  test("refuses without a freeze file, and outside data/private/", async () => {
    await expect(
      runGrade({
        rulesPath,
        keyPath,
        freezePath,
        outDir: priv,
        passphrase: PASS,
        now,
      }),
    ).rejects.toThrow(/run m2-freeze/);
    writeFileSync(
      freezePath,
      JSON.stringify(freeze(readFileSync(rulesPath), now)),
    );
    await expect(
      runGrade({
        rulesPath,
        keyPath,
        freezePath,
        outDir: work,
        passphrase: PASS,
        now,
      }),
    ).rejects.toThrow(/data\/private/);
  });
  test("counts out; detail and rule-grading.json in the private dir; M2 reads the counts", async () => {
    const c = await runGrade({
      rulesPath,
      keyPath,
      freezePath,
      outDir: priv,
      passphrase: PASS,
      now,
      writeGrading: true,
    });
    expect(c).toEqual({
      total: 5,
      match: 2,
      differs: 1,
      notLearned: 0,
      needsReview: 2,
      extra: 1,
    });
    expect(readdirSync(priv).sort()).toEqual([
      "m2-grade-2026-10-25T01-02-03-000Z.json",
      "rule-grading.json",
    ]);
    expect(m2(join(priv, "rule-grading.json"))).toEqual({
      status: "measured",
      total: 3,
      match: 2,
      differ: 1,
      notLearned: 0,
    });
    expect(toGrading({ rules: [], extraProposedIds: [], counts: c })).toEqual(
      [],
    );
  });
});
