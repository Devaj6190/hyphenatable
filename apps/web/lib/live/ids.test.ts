import { describe, expect, test } from "vitest";
import {
  companyKeyOf,
  type EnvIds,
  fromEnv,
  fromRoster,
  looksLikeConvexId,
  type Roster,
  resolveLive,
} from "./ids";

const roster: Roster = {
  demoMode: true,
  companies: [
    {
      id: "coA",
      name: "Company A (synthetic landscaping crew)",
      kind: "synthetic",
    },
    { id: "coB", name: "Company B (synthetic HVAC)", kind: "synthetic" },
  ],
  workers: [
    {
      id: "wA-owner",
      companyId: "coA",
      displayName: "Skyler Ashford",
      role: "owner",
      managerId: null,
    },
    {
      id: "wA-lead",
      companyId: "coA",
      displayName: "Dakota Brennan",
      role: "manager",
      managerId: "wA-owner",
    },
    {
      id: "wA-f1",
      companyId: "coA",
      displayName: "Casey Lindqvist",
      role: "field",
      managerId: "wA-lead",
    },
    {
      id: "wA-f2",
      companyId: "coA",
      displayName: "Rowan Castillo",
      role: "field",
      managerId: "wA-lead",
    },
    {
      id: "wB-owner",
      companyId: "coB",
      displayName: "Other Owner",
      role: "owner",
      managerId: null,
    },
  ],
};
const noEnv: EnvIds = {
  companyKey: "a",
  companyId: "",
  ownerId: "",
  managerId: "",
};
const env: EnvIds = {
  companyKey: "a",
  companyId: "envCo",
  ownerId: "envOwner",
  managerId: "envMgr",
};

describe("finding the viewers by role, not by pasted ids", () => {
  test("the company key is the letter in its name", () => {
    expect(companyKeyOf("Company A (synthetic landscaping crew)")).toBe("a");
    expect(companyKeyOf("Company R (anonymized)")).toBe("r");
    expect(companyKeyOf("Acme Landscaping")).toBeNull();
  });

  test("owner is the company's owner worker; manager is the manager worker", () => {
    const ctx = fromRoster(roster, "a");
    expect(ctx?.ids).toEqual({
      companyId: "coA",
      ownerId: "wA-owner",
      managerId: "wA-lead",
    });
    expect(ctx?.via).toBe("roster.list");
  });

  test("only that company's workers count, and their names come along", () => {
    const ctx = fromRoster(roster, "a");
    expect(ctx?.names).toEqual({
      "wA-owner": "Skyler Ashford",
      "wA-lead": "Dakota Brennan",
      "wA-f1": "Casey Lindqvist",
      "wA-f2": "Rowan Castillo",
    });
    expect(fromRoster(roster, "b")?.ids.ownerId).toBe("wB-owner");
  });

  test("with several managers, the one with the most reports is the crew lead", () => {
    const more: Roster = {
      ...roster,
      workers: [
        ...roster.workers,
        {
          id: "wA-m2",
          companyId: "coA",
          displayName: "Second Manager",
          role: "manager",
          managerId: "wA-owner",
        },
      ],
    };
    expect(fromRoster(more, "a")?.ids.managerId).toBe("wA-lead");
  });

  test("no manager leaves managerId null, so manager views stay on fixtures; no owner means nothing", () => {
    const noMgr: Roster = {
      ...roster,
      workers: roster.workers.filter((w) => w.role !== "manager"),
    };
    expect(fromRoster(noMgr, "a")?.ids.managerId).toBeNull();
    const noOwner: Roster = {
      ...roster,
      workers: roster.workers.filter((w) => w.role !== "owner"),
    };
    expect(fromRoster(noOwner, "a")).toBeNull();
    expect(fromRoster(roster, "z")).toBeNull();
  });
});

describe("env ids are a fallback", () => {
  test("they apply to their own company key only, and only when all three are set", () => {
    expect(fromEnv(env, "a")?.ids).toEqual({
      companyId: "envCo",
      ownerId: "envOwner",
      managerId: "envMgr",
    });
    expect(fromEnv(env, "b")).toBeNull();
    expect(fromEnv({ ...env, managerId: "" }, "a")).toBeNull();
    expect(fromEnv(noEnv, "a")).toBeNull();
  });

  test("the roster wins over the env ids", () => {
    const s = resolveLive({ roster }, env, "a");
    expect(s.status === "ready" && s.ctx.via).toBe("roster.list");
    expect(s.status === "ready" && s.ctx.ids.ownerId).toBe("wA-owner");
  });

  test("when the roster is not deployed, the env ids are used and the screen is told why", () => {
    const s = resolveLive({ error: "Server Error" }, env, "a");
    expect(s.status).toBe("ready");
    if (s.status === "ready") {
      expect(s.ctx.via).toBe("env");
      expect(s.note).toMatch(/roster\.list is not available/);
    }
  });

  test("an empty roster (DEMO_MODE off) falls back too, and says so", () => {
    const s = resolveLive(
      { roster: { demoMode: false, companies: [], workers: [] } },
      env,
      "a",
    );
    expect(s.status === "ready" && s.note).toMatch(/DEMO_MODE=1/);
  });

  test("neither available: unavailable, with the reason", () => {
    const s = resolveLive({ error: "Server Error" }, noEnv, "a");
    expect(s.status).toBe("unavailable");
    if (s.status === "unavailable")
      expect(s.reason).toMatch(/NEXT_PUBLIC_LIVE_\* ids are not set/);
  });
});

describe("what may be sent to Convex as an id", () => {
  test("Convex row ids pass; fixture ids and junk do not", () => {
    expect(looksLikeConvexId("jx75e9dy04f7teyny81kbvae6x8gxhkv")).toBe(true);
    expect(looksLikeConvexId("a-flag-04")).toBe(false);
    expect(looksLikeConvexId("")).toBe(false);
    expect(looksLikeConvexId("JX75E9DY04F7TEYNY81KBVAE6X8GXHKV")).toBe(false);
  });
});
