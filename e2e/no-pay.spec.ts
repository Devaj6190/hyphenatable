import { expect, type Page, test } from "@playwright/test";
import flags from "../apps/web/app/_fixtures/flags.json";
import { companies } from "../apps/web/lib/companies";
import { ROLE_COOKIE } from "../apps/web/lib/role";

// C-14: the manager view never shows a pay amount, and never even loads one. Owner view is the control: the
// same pages do show the amounts, so a pass in manager mode means they were removed, not that nothing rendered.
const PAY = /\$\d/;

const companyIds = Object.keys(companies);
const flagPages = flags.map((f) => `/c/${f.companyId}/flags/${f.id}`);
const managerPages = [
  ...companyIds.flatMap((id) => [`/c/${id}`, `/c/${id}/manager`]),
  ...flagPages,
];

// Every pay amount in the fixtures, in each form it could leak as: raw cents (18400), formatted the way
// <Money> renders it ($184.00) and without the sign (184.00, 1,234.50 and 1234.50).
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const amounts = flags.flatMap((f) => {
  const cents = f.affects.dollarsCents;
  if (cents === null) return [];
  const formatted = usd.format(cents / 100);
  const plain = formatted.slice(1);
  return [
    {
      flagId: f.id,
      formatted,
      forms: [
        ...new Set([String(cents), formatted, plain, plain.replace(/,/g, "")]),
      ],
    },
  ];
});
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Digit boundaries, so 18400 doesn't match inside 184001 or 2184.00.
const patterns = amounts.flatMap(({ flagId, forms }) =>
  forms.map((form) => ({
    flagId,
    form,
    re: new RegExp(`(?<![\\d.,])${escapeRegExp(form)}(?![\\d])`),
  })),
);

function findLeaks(sources: { where: string; body: string }[]): string[] {
  return sources.flatMap(({ where, body }) =>
    patterns
      .filter(({ re }) => re.test(body))
      .map(({ flagId, form }) => `${where}: "${form}" (${flagId})`),
  );
}

const TEXTUAL = /html|javascript|json|text|x-component/;

// Starts recording every response body the page loads; call the result after navigation to get them.
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
  await expect(page.getByText("PayrollPilot").first()).toBeVisible();
  await expect(page.getByText("Loading…")).toHaveCount(0);
  return page.locator("body").innerText();
}

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
      const leaks = findLeaks([
        { where: "visible text", body: text },
        { where: "page.content()", body: await page.content() },
        ...(await responses()),
      ]);
      expect(leaks, `pay amounts reached the manager's browser`).toEqual([]);
    });
  }

  test("links to every fixture flag that exists", async ({ page }) => {
    await visibleText(page, "/c/a");
    const hrefs = await page
      .locator('a[href*="/flags/"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    expect(new Set(hrefs)).toEqual(new Set(flagPages));
  });
});

test.describe("owner view (control)", () => {
  test.beforeEach(({ page, baseURL }) => viewAs(page, "owner", baseURL));

  test("shows every fixture pay amount on the owner home", async ({ page }) => {
    const text = await visibleText(page, "/c/a");
    expect(text).not.toContain("Manager view.");
    for (const { formatted } of amounts) expect(text).toContain(formatted);
  });

  for (const { flagId, formatted } of amounts) {
    const path = flagPages.find((p) => p.endsWith(`/${flagId}`)) as string;
    test(`shows ${formatted} on ${path}`, async ({ page }) => {
      expect(await visibleText(page, path)).toContain(formatted);
    });
  }
});
