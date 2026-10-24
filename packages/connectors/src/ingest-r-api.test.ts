// ingest-r --source jobber-api on the recorded Jobber fixtures (fake names standing in for real ones).
import { mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TOKEN_PATH, JobberClient, R_ACCOUNT_TOKEN_PATH, jobberTokenPath } from "./jobber/client.ts";
import { fakeJobberFetch, fixtures, memoryTokenStore } from "./jobber/__tests__/fakeJobber.ts";
import { ingestRFromJobber, R_PRIVATE_DIR, rJobberClient } from "./ingest-r.ts";

const fakeClient = () =>
  new JobberClient({
    clientId: "cid", clientSecret: "cs", fetchImpl: fakeJobberFetch(fixtures()).fetch, sleepImpl: async () => {},
    tokenStore: memoryTokenStore({ accessToken: null, accessTokenExpiresAt: null, refreshToken: "fake-rt" }),
  });
const privateDir = async () => {
  const d = join(await mkdtemp(join(tmpdir(), "pp-rapi-")), "r");
  await mkdir(d, { recursive: true });
  return d;
};
const ingest = async (dir: string, dryRun = false) =>
  ingestRFromJobber({ privateDir: dir, timezone: "America/Los_Angeles", from: "2026-10-11", to: "2026-10-24", client: fakeClient(), dryRun, now: () => new Date("2026-10-24T12:00:00Z") });

describe("ingest-r --source jobber-api", () => {
  it("anonymizes every object, nulls free text, keeps ids and money, and writes only to out/", async () => {
    const dir = await privateDir();
    const c = await ingest(dir);
    expect(c).toMatchObject({ workers: 4, timeEntries: 5, jobs: 2, visits: 1, quotes: 1, invoices: 1, payments: 2, expenses: 2 });
    expect(c.syncRuns.every((s) => s.complete)).toBe(true);
    expect(c.outPath?.startsWith(join(dir, "out"))).toBe(true);
    const out = await readFile(c.outPath as string, "utf8");

    // names, titles, labels, descriptions and notes from the fixtures are all gone
    for (const s of ["Morgan", "Avery", "Reed", "Jordan", "Ellis", "Sam", "Okafor", "Lee", "Spring cleanup", "Hedge trim", "Shop cleanup", "Mulch", "Dump fee", "transfer station", "fake note"]) {
      expect(out).not.toMatch(new RegExp(`\\b${s}\\b`));
    }
    const p = JSON.parse(out);
    expect(p.namesAnonymized).toBe(true);
    expect(p.records.timeEntries.every((e: { label: unknown }) => e.label === null)).toBe(true);
    expect(p.records.expenses.every((x: { description: unknown; vendor: unknown }) => x.description === null && x.vendor === null)).toBe(true);
    expect(p.records.jobs.map((j: { title: string; jobNumber: number }) => [j.title, j.jobNumber])).toEqual([["Job J001", 1], ["Job J002", 2]]);
    // traceability and amounts survive
    expect(p.records.timeEntries[0]).toMatchObject({ companyId: "r", sourceId: "Z2lkOi8vSm9iYmVyL1RpbWVTaGVldEVudHJ5LzUwMDE=", durationSec: 30600, approved: true });
    expect(p.records.expenses[0]).toMatchObject({ amountCents: 21437, accountName: "Materials", reimbursementStatus: "PENDING_REIMBURSEMENT" });
    expect(p.records.workers[2].jobber).toMatchObject({ userId: "Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMw==", labourRateCents: 3115 });

    // every real token the anonymizer recorded is absent, and the list exists for the repo grep
    const tokens = (await readFile(join(dir, "real-tokens.txt"), "utf8")).trim().split("\n");
    expect(tokens).toEqual(expect.arrayContaining(["morgan", "avery", "reed", "okafor"]));
    for (const t of tokens) expect(out.toLowerCase()).not.toMatch(new RegExp(`\\b${t}\\b`));
  });

  it("one person keeps one pseudonym across the API pull and later runs", async () => {
    const dir = await privateDir();
    const first = JSON.parse(await readFile((await ingest(dir)).outPath as string, "utf8"));
    const second = JSON.parse(await readFile((await ingest(dir)).outPath as string, "utf8"));
    expect(second.records.workers.map((w: { displayName: string }) => w.displayName)).toEqual(first.records.workers.map((w: { displayName: string }) => w.displayName));
  });

  it("dry run writes nothing but the salt", async () => {
    const dir = await privateDir();
    expect((await ingest(dir, true)).outPath).toBeNull();
    expect(await readdir(dir)).toEqual(["salt"]);
  });

  it("Company R's token file is its own, never the trial account's", () => {
    expect(R_ACCOUNT_TOKEN_PATH).toBe(join(R_PRIVATE_DIR, "jobber-token.json"));
    expect(R_ACCOUNT_TOKEN_PATH).not.toBe(DEFAULT_TOKEN_PATH);
    expect(jobberTokenPath("r")).toBe(R_ACCOUNT_TOKEN_PATH);
    expect(jobberTokenPath("trial")).toBe(DEFAULT_TOKEN_PATH);
    const env = { JOBBER_CLIENT_ID: "x", JOBBER_CLIENT_SECRET: "y" };
    expect(() => rJobberClient(join(DEFAULT_TOKEN_PATH, ".."), env)).toThrow(/must not use the trial/);
    expect(rJobberClient(R_PRIVATE_DIR, env)).toBeInstanceOf(JobberClient);
  });
});
