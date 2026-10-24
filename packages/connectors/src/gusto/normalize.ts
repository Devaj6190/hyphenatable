// Gusto demo responses -> Worker (gusto block) and GustoPayroll. Pure.
// Ids: gusto:employee:<uuid>, gusto:contractor:<uuid>, gusto:payroll:<uuid>. Money strings -> cents (toCents).
// A rate is taken only from one unambiguous job + compensation; otherwise null (never pick, never default).

import { toCents } from "../money.ts";
import type { Worker } from "../types.ts";

export interface RawCompensation {
  uuid: string;
  rate: string;
  payment_unit: string;
  flsa_status: string;
  effective_date?: string;
}
export interface RawJob {
  uuid: string;
  title?: string | null;
  primary?: boolean;
  current_compensation_uuid?: string | null;
  compensations?: RawCompensation[];
}
export interface RawEmployee {
  uuid: string;
  first_name: string;
  last_name: string;
  terminated?: boolean;
  onboarded?: boolean;
  onboarding_status?: string;
  jobs?: RawJob[];
}
export interface RawContractor {
  uuid: string;
  type: "Individual" | "Business";
  wage_type: "Fixed" | "Hourly";
  hourly_rate?: string | null;
  is_active?: boolean;
  first_name?: string | null;
  last_name?: string | null;
  business_name?: string | null;
  onboarded?: boolean;
}
export interface RawPayrollComp {
  employee_uuid: string;
  excluded?: boolean;
  gross_pay?: string | null;
  net_pay?: string | null;
  hourly_compensations?: {
    name: string;
    hours: string;
    amount?: string | null;
    job_uuid?: string | null;
  }[];
  fixed_compensations?: {
    name: string;
    amount: string;
    job_uuid?: string | null;
  }[];
}
export interface RawPayroll {
  payroll_uuid?: string;
  uuid?: string;
  processed: boolean;
  off_cycle?: boolean;
  off_cycle_reason?: string | null;
  check_date?: string;
  pay_period?: {
    start_date: string;
    end_date: string;
    pay_schedule_uuid?: string | null;
  };
  totals?: { gross_pay?: string | null } | null;
  employee_compensations?: RawPayrollComp[];
}

/** Section 6 has no payroll table: this is the read-side record for onboarding, CHK-22, M4 and the draft writer. */
export interface GustoPayroll {
  id: string;
  companyId: string;
  sourceId: string;
  processed: boolean;
  payrollType: "regular" | "off_cycle";
  offCycleReason: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  checkDate: string | null;
  grossCents: number | null;
  /** null when the payroll was listed but not fetched in detail (unprocessed list). */
  employees:
    | {
        workerId: string;
        employeeUuid: string;
        excluded: boolean;
        grossCents: number | null;
        netCents: number | null;
        hourly: {
          name: string;
          hours: number;
          amountCents: number | null;
          jobUuid: string | null;
        }[];
        fixed: {
          name: string;
          amountCents: number | null;
          jobUuid: string | null;
        }[];
      }[]
    | null;
}

const hoursOf = (s: string): number => {
  const n = Number(s);
  if (s.trim() === "" || !Number.isFinite(n))
    throw new Error(`Gusto hours not a number: ${JSON.stringify(s)}`);
  return n;
};

export const employeeRef = (uuid: string) => `gusto:employee:${uuid}`;
export const contractorRef = (uuid: string) => `gusto:contractor:${uuid}`;

function payTypeOf(c: RawCompensation | null): Worker["payType"] {
  if (!c) return null;
  if (/commission only/i.test(c.flsa_status)) return "commission";
  if (c.payment_unit === "Hour") return "hourly";
  if (["Year", "Month", "Week", "Paycheck"].includes(c.payment_unit))
    return "salary";
  return null;
}

/** The job to read a rate from: the primary one, or the only one. Several and none primary -> null. */
function soleJob(jobs: RawJob[]): RawJob | null {
  const primary = jobs.filter((j) => j.primary);
  if (primary.length === 1) return primary[0] ?? null;
  return jobs.length === 1 ? (jobs[0] ?? null) : null;
}

/** The job's current compensation by current_compensation_uuid, else the only one. */
function currentComp(job: RawJob | null): RawCompensation | null {
  const comps = job?.compensations ?? [];
  const byId = comps.find((c) => c.uuid === job?.current_compensation_uuid);
  if (byId) return byId;
  return comps.length === 1 ? (comps[0] ?? null) : null;
}

export function normalizeEmployee(e: RawEmployee, companyId: string): Worker {
  const job = soleJob(e.jobs ?? []);
  const comp = currentComp(job);
  return {
    id: employeeRef(e.uuid),
    companyId,
    // Gusto demo-company names are generated fakes; Company R never connects to Gusto.
    displayName: `${e.first_name} ${e.last_name}`.trim(),
    role: null,
    payType: payTypeOf(comp),
    status: e.terminated ? "inactive" : "active",
    managerId: null,
    contactRef: null,
    jobber: null,
    gusto: {
      employeeUuid: e.uuid,
      contractorUuid: null,
      jobUuid: job?.uuid ?? null,
      rateCents: comp ? toCents(comp.rate) : null,
      paymentUnit: comp?.payment_unit ?? null,
      flsaStatus: comp?.flsa_status ?? null,
      onboarded: e.onboarded ?? null,
    },
    venmoRateCents: null,
  };
}

export function normalizeContractor(
  c: RawContractor,
  companyId: string,
): Worker {
  const name =
    c.type === "Business"
      ? (c.business_name ?? "")
      : `${c.first_name ?? ""} ${c.last_name ?? ""}`;
  return {
    id: contractorRef(c.uuid),
    companyId,
    displayName: name.trim(),
    // A Gusto contractor is not a Venmo contractor; payType comes from config.
    role: null,
    payType: null,
    status: c.is_active === false ? "inactive" : "active",
    managerId: null,
    contactRef: null,
    jobber: null,
    gusto: {
      employeeUuid: null,
      contractorUuid: c.uuid,
      jobUuid: null,
      rateCents: c.wage_type === "Hourly" ? toCents(c.hourly_rate) : null,
      paymentUnit: c.wage_type === "Hourly" ? "Hour" : null,
      flsaStatus: null,
      onboarded: c.onboarded ?? null,
    },
    venmoRateCents: null,
  };
}

export function normalizePayroll(
  p: RawPayroll,
  companyId: string,
): GustoPayroll {
  const uuid = p.payroll_uuid ?? p.uuid;
  if (!uuid) throw new Error("Gusto payroll without a uuid");
  return {
    id: `gusto:payroll:${uuid}`,
    companyId,
    sourceId: uuid,
    processed: p.processed,
    payrollType: p.off_cycle ? "off_cycle" : "regular",
    offCycleReason: p.off_cycle_reason ?? null,
    periodStart: p.pay_period?.start_date ?? null,
    periodEnd: p.pay_period?.end_date ?? null,
    checkDate: p.check_date ?? null,
    grossCents: toCents(p.totals?.gross_pay),
    employees: p.employee_compensations
      ? p.employee_compensations.map((c) => ({
          workerId: employeeRef(c.employee_uuid),
          employeeUuid: c.employee_uuid,
          excluded: c.excluded ?? false,
          grossCents: toCents(c.gross_pay),
          netCents: toCents(c.net_pay),
          hourly: (c.hourly_compensations ?? []).map((h) => ({
            name: h.name,
            hours: hoursOf(h.hours),
            amountCents: toCents(h.amount),
            jobUuid: h.job_uuid ?? null,
          })),
          fixed: (c.fixed_compensations ?? []).map((f) => ({
            name: f.name,
            amountCents: toCents(f.amount),
            jobUuid: f.job_uuid ?? null,
          })),
        }))
      : null,
  };
}
