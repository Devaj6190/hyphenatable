// Sealed M2 grading on a synthetic runbook key and synthetic proposed rules (invented ids and statements).
import { execFileSync } from "node:child_process";
import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
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
import { seal, unseal, unsealAny, unsealOpenssl } from "../lib/seal";
import { freeze, type ProposedRule, ProposedRules } from "../m2-freeze";
import {
  checkFrozen,
  describeCounts,
  llmJudge,
  runGrade,
  toGrading,
} from "../m2-grade";
import { differing, gradeRules, type KeyRule } from "../m2-match";
import { m2 } from "../m2-rules";

const PASS = "correct horse battery staple";
const key: KeyRule[] = [
  // the owner did not state the multiplier: only null (or leaving it out) matches
  {
    id: "RB-01",
    ruleType: "overtime_policy",
    params: { weeklyHours: 40, multiplier: null, workweek: "Monday-Sunday" },
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
  }),
  rule("p2", "long_shift_threshold", { hours: 10.2 }),
  rule("p3", "pay_rate", { workerId: "r:w:x1", rateCents: 2400 }),
  rule("p4", "expense_account_kind", { account: "Fuel", kind: "overhead" }),
];

/** What `openssl enc -aes-256-cbc -pbkdf2 -iter N [-a]` writes. */
function opensslEnc(
  plain: Buffer,
  pass: string,
  iter: number,
  base64 = false,
): Buffer {
  const salt = randomBytes(8);
  const k = pbkdf2Sync(pass, salt, iter, 48, "sha256");
  const c = createCipheriv(
    "aes-256-cbc",
    k.subarray(0, 32),
    k.subarray(32, 48),
  );
  const out = Buffer.concat([
    Buffer.from("Salted__"),
    salt,
    c.update(plain),
    c.final(),
  ]);
  return base64 ? Buffer.from(`${out.toString("base64")}\n`) : out;
}
const isJson = (b: Buffer) => {
  try {
    JSON.parse(b.toString("utf8"));
    return true;
  } catch {
    return false;
  }
};

describe("sealing", () => {
  test("our envelope: round trip; wrong passphrase or a changed byte fails; short passphrases refused", () => {
    const s = seal(Buffer.from("secret key"), PASS);
    expect(unseal(s, PASS).toString()).toBe("secret key");
    expect(() => unseal(s, `${PASS}!`)).toThrow(/wrong passphrase/);
    expect(() =>
      unseal(
        { ...s, data: Buffer.from("x".repeat(10)).toString("base64") },
        PASS,
      ),
    ).toThrow(/wrong passphrase/);
    expect(() => seal(Buffer.from("x"), "short")).toThrow(/12 characters/);
    expect(JSON.stringify(s)).not.toContain("secret");
  });
  test("openssl enc -aes-256-cbc -pbkdf2: default 10000 or 200000 iterations, binary or base64; wrong passphrase fails", () => {
    const plain = Buffer.from(JSON.stringify(key));
    for (const [iter, b64] of [
      [10000, false],
      [200000, true],
    ] as const)
      expect(
        unsealOpenssl(
          opensslEnc(plain, PASS, iter, b64),
          PASS,
          isJson,
        ).toString(),
      ).toBe(plain.toString());
    expect(
      unsealAny(opensslEnc(plain, PASS, 10000), PASS, isJson).toString(),
    ).toBe(plain.toString());
    expect(() =>
      unsealOpenssl(opensslEnc(plain, PASS, 10000), "wrong pass", isJson),
    ).toThrow(/cannot unseal/);
    expect(
      unsealOpenssl(
        opensslEnc(plain, PASS, 5000),
        PASS,
        isJson,
        [5000],
      ).toString(),
    ).toBe(plain.toString());
    expect(() =>
      unsealOpenssl(Buffer.from("plain text"), PASS, isJson),
    ).toThrow(/Salted__/);
  });
  test("a file made by the real openssl binary, when it supports -pbkdf2", () => {
    const dir = mkdtempSync(join(tmpdir(), "m2-openssl-"));
    try {
      const inPath = join(dir, "k.json");
      const outPath = join(dir, "k.json.enc");
      writeFileSync(inPath, JSON.stringify(key));
      try {
        execFileSync(
          "openssl",
          [
            "enc",
            "-aes-256-cbc",
            "-pbkdf2",
            "-salt",
            "-in",
            inPath,
            "-out",
            outPath,
            "-pass",
            "env:M2_TEST_PASS",
          ],
          {
            env: { ...process.env, M2_TEST_PASS: PASS },
            stdio: "ignore",
          },
        );
      } catch {
        return; // no openssl, or one without -pbkdf2: covered by the synthetic files above
      }
      expect(
        JSON.parse(unsealAny(readFileSync(outPath), PASS, isJson).toString()),
      ).toEqual(key);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
  const proposals = [
    {
      type: "overtime_policy",
      params: { weeklyHours: 40, multiplier: null, workweek: "Monday-Sunday" },
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
  const rows = [
    {
      _id: "k17abc",
      companyId: "r",
      type: "overtime_policy",
      params: { weeklyHours: 40, workweek: "Monday-Sunday" },
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
  test("Proposals get ids by position; Rule rows keep their _id; both grade on type + params", async () => {
    expect(
      freeze(Buffer.from(JSON.stringify(proposals)), new Date()).count,
    ).toBe(2);
    expect(freeze(Buffer.from(JSON.stringify(rows)), new Date()).count).toBe(2);
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
      ["RB-01", "match", "proposal-1"], // multiplier null = null
      ["RB-02", "not_learned", null],
      ["RB-03", "match", "proposal-2"],
    ]);
    const gr = await gradeRules(key, r);
    expect(
      gr.rules.slice(0, 3).map((x) => [x.keyId, x.verdict, x.proposedId]),
    ).toEqual([
      ["RB-01", "match", "k17abc"], // multiplier left out = a question, not a value
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
  test("an unstated (null) key param: any stated value is not a match", () => {
    expect(differing(key[0], proposed[0])).toEqual(["multiplier"]);
    expect(
      differing(
        key[0],
        rule("x", "overtime_policy", {
          weeklyHours: 40,
          multiplier: null,
          workweek: "Monday-Sunday",
        }),
      ),
    ).toEqual([]);
    expect(
      differing(
        key[0],
        rule("x", "overtime_policy", {
          weeklyHours: 40,
          workweek: "Monday-Sunday",
        }),
      ),
    ).toEqual([]);
  });
  test("headline on typed rules only: recall, precision, wrong values; 'other' apart as needs human review", async () => {
    const r = await gradeRules(key, proposed);
    expect(
      r.rules.map((x) => [x.keyId, x.verdict, x.proposedId, x.differingParams]),
    ).toEqual([
      ["RB-01", "differs", "p1", ["multiplier"]],
      ["RB-02", "match", "p2", []], // 10.2 vs 10 within 0.25 h
      ["RB-03", "differs", "p3", ["rateCents"]],
      ["RB-04", "not_learned", null, []],
      ["RB-05", "needs_human_review", null, []],
    ]);
    expect(r.extraProposedIds).toEqual(["p4"]);
    expect(r.counts).toEqual({
      typed: {
        total: 4,
        match: 1,
        differs: 2,
        notLearned: 1,
        extra: 1,
        recall: { num: 1, den: 4, value: 0.25 },
        precision: { num: 1, den: 4, value: 0.25 },
      },
      other: { total: 1, needsReview: 1, suggested: 0 },
    });
    expect(describeCounts(r.counts, false)).toEqual([
      "M2 (typed rules, headline): 1 of 4 match (recall 25%); 2 wrong value; 1 not learned; 1 extra proposed; precision 25% (1/4)",
      'M2 ("other" statements, not in the headline): 1 need human review (no ANTHROPIC_API_KEY: no judge suggestions)',
      "per-rule detail written under data/private/r/ (m2-grade-<time>.json)",
    ]);
  });
  test("a judge only suggests for 'other' rules; the verdict stays human review and the headline is unchanged", async () => {
    const r = await gradeRules(key, proposed, async () => ({
      verdict: "match",
      proposedId: "p4",
      differingParams: [],
    }));
    expect(r.rules.find((x) => x.keyId === "RB-05")).toMatchObject({
      verdict: "needs_human_review",
      suggestedProposedId: "p4",
    });
    expect(r.counts.other.suggested).toBe(1);
    expect(r.counts.typed.match).toBe(1);
    const bad = await gradeRules(key, proposed, async () => ({
      verdict: "match",
      proposedId: "nope",
      differingParams: [],
    }));
    expect(bad.counts.other.suggested).toBe(0);
  });
  test("the model judge gets types and params only; a scrub failure sends nothing", async () => {
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
    // biome-ignore lint/suspicious/noExplicitAny: a minimal stand-in for the Anthropic client
    const judge = llmJudge(client as any);
    const named = proposed.map((p) =>
      p.id === "p4"
        ? rule("p4", "expense_account_kind", { accountName: "Fuel" })
        : p,
    );
    await gradeRules(key, named, judge);
    expect(sent).toEqual([]);
    await gradeRules(key, proposed, judge);
    expect(sent.length).toBe(1);
    for (const k of key) expect(sent[0]).not.toContain(k.statement);
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
    opensslEnc(Buffer.from(JSON.stringify(key)), PASS, 10000),
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
    await expect(
      runGrade({
        rulesPath,
        keyPath,
        freezePath,
        outDir: priv,
        passphrase: "wrong pass",
        now,
      }),
    ).rejects.toThrow(/cannot unseal/);
  });
  test("an openssl-sealed key: counts out; detail and typed rule-grading.json in the private dir; M2 reads them", async () => {
    const c = await runGrade({
      rulesPath,
      keyPath,
      freezePath,
      outDir: priv,
      passphrase: PASS,
      now,
      writeGrading: true,
    });
    expect(c.typed).toMatchObject({
      total: 4,
      match: 1,
      differs: 2,
      notLearned: 1,
      extra: 1,
    });
    expect(readdirSync(priv).sort()).toEqual([
      "m2-grade-2026-10-25T01-02-03-000Z.json",
      "rule-grading.json",
    ]);
    expect(m2(join(priv, "rule-grading.json"))).toEqual({
      status: "measured",
      total: 4,
      match: 1,
      differ: 2,
      notLearned: 1,
    });
    expect(toGrading({ rules: [], extraProposedIds: [], counts: c })).toEqual(
      [],
    );
  });
});
