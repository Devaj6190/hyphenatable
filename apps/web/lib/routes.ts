// Every /c/[companyId] href in one place, so a route rename is one edit. Pure, safe on server and client.
// `/c/[id]/manager` is inside sent SMS links and engine tests: never rename it.

export type CompanyTab = "people" | "profile" | "rules";

const base = (companyId: string) => `/c/${companyId}`;

export const routes = {
  home: base,
  company: (companyId: string, tab?: CompanyTab, hash?: string) =>
    `${base(companyId)}/company${tab ? `?tab=${tab}` : ""}${hash ? `#${encodeURIComponent(hash)}` : ""}`,
  workbook: (companyId: string) => `${base(companyId)}/workbook`,
  workbookReady: (companyId: string) => `${base(companyId)}/workbook/ready`,
  audit: (companyId: string) => `${base(companyId)}/audit`,
  manager: (companyId: string) => `${base(companyId)}/manager`,
  onboarding: (companyId: string) => `${base(companyId)}/onboarding`,
  demo: (companyId: string) => `${base(companyId)}/demo`,
  inputs: (companyId: string) => `${base(companyId)}/inputs`,
  flag: (companyId: string, flagId: string) =>
    `${base(companyId)}/flags/${encodeURIComponent(flagId)}`,
  /** A rule now lives under Company → Rules; `/rules` redirects there. */
  rule: (companyId: string, ruleId: string) =>
    `${base(companyId)}/company?tab=rules#${encodeURIComponent(ruleId)}`,
};
