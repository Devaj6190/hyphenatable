import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

// The manager view never shows a pay amount, and never even loads one. The owner view is the control: the same
// pages do show amounts, so a pass in manager mode means they were removed, not that nothing rendered.
const PAY = /\$\d/;
// A dollar amount as money is written. Used on script payloads and responses, where React's flight data is full of
// reference markers like "$9" and "$a" that /\$\d/ would flag.
const MONEY = /\$\d[\d,]*\.\d{2}/;
const ROLE_COOKIE = "pp_role";
const FIXTURES = join(__dirname, "../apps/web/app/_fixtures");

type Flag = {
  id: string;
  companyId: string;
  routeTo: string;
  affects: { dollarsCents: number | null };
};
const readJson = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
const flags: Flag[] = [
  ...readJson("flags.json"),
  ...readJson("flags.owner-routed.json"),
];
const flagPath = (f: Flag) => `/c/${f.companyId}/flags/${f.id}`;
const companyIds = [...new Set(flags.map((f) => f.companyId))];

// Every cent value under a *Cents key in any fixture file, with the keys it appears under.
function collectCents(value: unknown, out: Map<number, string>, key = "") {
  if (typeof value === "number" && key.endsWith("Cents") && value >= 1000)
    out.set(value, key);
  else if (Array.isArray(value))
    for (const v of value) collectCents(v, out, key);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) collectCents(v, out, k);
}
const cents = new Map<number, string>();
for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith(".json")))
  collectCents(readJson(file), cents);

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Formatted ($184.00, +$184.00) and plain (184.00, 1,234.50, 1234.50) amounts are matched anywhere, on digit
// boundaries so 184.00 doesn't match inside 2184.00. Raw cents (18400) are matched where data carries them, next
// to a *Cents key in JSON or flight payloads: a bare 2000 is also in every bundle and stylesheet.
const patterns = [...cents].flatMap(([value, key]) => {
  const formatted = usd.format(value / 100);
  const plain = formatted.slice(1);
  const forms = new Set([formatted, plain, plain.replace(/,/g, "")]);
  return [
    ...[...forms].map((form) => ({
      key,
      form,
      re: new RegExp(`(?<![\\d.,])${escapeRegExp(form)}(?![\\d])`),
    })),
    {
      key,
      form: String(value),
      re: new RegExp(`Cents\\W{1,6}${value}(?!\\d)`),
    },
  ];
});

function findLeaks(sources: { where: string; body: string }[]): string[] {
  return sources.flatMap(({ where, body }) =>
    patterns
      .filter(({ re }) => re.test(body))
      .map(({ key, form }) => `${where}: "${form}" (${key})`),
  );
}

const TEXTUAL = /html|javascript|json|text|x-component/;

// Starts recording every textual response body the page loads; call the result after navigation to get them.
function recordResponses(page: Page) {
  const bodies: Promise<{ where: string; body: string } | null>[] = [];
  page.on("response", (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (!TEXTUAL.test(type)) return;
    const { pathname, search } = new URL(response.url());
    bodies.push(
      response
        .text()
        .then((body) => ({ where: `${pathname}${search}`, body }))
        .catch(() => null), // redirects and aborted requests have no body
    );
  });
  return async () =>
    (await Promise.all(bodies)).filter((b): b is NonNullable<typeof b> => !!b);
}

async function viewAs(
  page: Page,
  role: "owner" | "manager",
  url: string | undefined,
) {
  await page.context().addCookies([{ name: ROLE_COOKIE, value: role, url }]);
}

// Waits until the page is past the loading shell and the network is quiet, then returns what a person would see.
async function visibleText(page: Page, path: string): Promise<string> {
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(page.getByText("Loading…")).toHaveCount(0);
  return page.locator("body").innerText();
}

const managerFlags = flags.filter((f) => f.routeTo === "manager");
const managerPages = [
  ...companyIds.flatMap((id) => [`/c/${id}`, `/c/${id}/manager`]),
  ...managerFlags.map(flagPath),
];

test("fixtures hold pay amounts to look for", () => {
  expect(cents.size).toBeGreaterThan(0);
  expect(flags.some((f) => f.affects.dollarsCents !== null)).toBe(true);
});

test.describe("manager view", () => {
  test.beforeEach(({ page, baseURL }) => viewAs(page, "manager", baseURL));

  for (const path of managerPages) {
    test(`shows no pay amount on ${path}`, async ({ page }) => {
      const text = await visibleText(page, path);
      expect(text).toContain("Manager view. Pay amounts are never shown here.");
      expect(text).not.toMatch(PAY);
    });

    test(`loads no fixture pay amount on ${path}`, async ({ page }) => {
      const responses = recordResponses(page);
      const text = await visibleText(page, path);
      const content = await page.content();
      // Rendered markup (scripts removed) must not have /\$\d/ at all; the full page and every response must have
      // no money-shaped text.
      expect(content.replace(/<script[\s\S]*?<\/script>/g, "")).not.toMatch(
        PAY,
      );
      expect(content).not.toMatch(MONEY);
      const loaded = await responses();
      const leaks = findLeaks([
        { where: "visible text", body: text },
        { where: "page.content()", body: content },
        ...loaded,
      ]);
      for (const { where, body } of loaded)
        expect(body, `money-shaped text in ${where}`).not.toMatch(MONEY);
      expect(leaks, "pay amounts reached the manager's browser").toEqual([]);
    });
  }
});

test.describe("owner view (control)", () => {
  test.beforeEach(({ page, baseURL }) => viewAs(page, "owner", baseURL));

  test("shows fixture pay amounts on the owner home", async ({ page }) => {
    const text = await visibleText(page, `/c/${companyIds[0]}`);
    expect(text).not.toContain("Manager view.");
    expect(text).toMatch(PAY);
    // The workbook totals card renders a fixture total, so the manager-side scan above can find real amounts.
    expect(
      findLeaks([{ where: "owner home", body: text }]).length,
    ).toBeGreaterThan(0);
  });

  test("shows a flag's own pay amount on its flag page", async ({ page }) => {
    const shown: string[] = [];
    for (const f of flags.filter((f) => f.affects.dollarsCents !== null)) {
      const formatted = usd.format((f.affects.dollarsCents as number) / 100);
      const text = await visibleText(page, flagPath(f));
      if (text.includes(formatted)) shown.push(f.id);
    }
    expect(shown.length).toBeGreaterThan(0);
  });
});
