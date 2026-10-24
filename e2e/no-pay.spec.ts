import { expect, type Page, test } from "@playwright/test";
import flags from "../apps/web/app/_fixtures/flags.json";
import { companies } from "../apps/web/lib/companies";
import { ROLE_COOKIE } from "../apps/web/lib/role";

// C-14: the manager view never shows a pay amount. Owner view is the control: the same pages do show amounts,
// so a pass in manager mode means amounts were removed, not that the page failed to render them.
const PAY = /\$\d/;

const companyIds = Object.keys(companies);
const flagPages = flags.map((f) => `/c/${f.companyId}/flags/${f.id}`);
const managerPages = [
  ...companyIds.flatMap((id) => [`/c/${id}`, `/c/${id}/manager`]),
  ...flagPages,
];

async function viewAs(
  page: Page,
  role: "owner" | "manager",
  url: string | undefined,
) {
  await page.context().addCookies([{ name: ROLE_COOKIE, value: role, url }]);
}

// Waits until the page is past the loading shell, then returns what a person would see.
async function visibleText(page: Page, path: string): Promise<string> {
  await page.goto(path);
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

  test("shows pay amounts on the owner home", async ({ page }) => {
    const text = await visibleText(page, "/c/a");
    expect(text).not.toContain("Manager view.");
    expect(text).toMatch(PAY);
  });

  for (const path of flagPages) {
    test(`shows the pay amount on ${path}`, async ({ page }) => {
      expect(await visibleText(page, path)).toMatch(PAY);
    });
  }
});
