// What the server hands the Company page (lib/server/views/company.ts). Already redacted for the viewer: for a
// manager every pay field below is null, so a client component has no amount to leak. Amounts arrive as text the
// server built from stored cents; the UI formats nothing and computes nothing.

/** Ready: nothing open about this person. Look: a check needs a person. Blocked: can't be paid as is. */
export type PersonTone = "ready" | "look" | "blocked" | "info";

export type PayKind = "hourly" | "salary" | "venmo";

/** One of the Jobber / Gusto / Rule tiles in the detail panel. `value` is "$26.00/h", "$67,600/yr", "none"… */
export type RateTile = {
  system: "jobber" | "gusto" | "rule";
  value: string;
  /** This tile disagrees with what RollPay pays from. */
  warn: boolean;
  /** Where the value came from: a record or rule id. */
  source: string | null;
};

export type PayHistoryLine = {
  /** Cycle id, or "now" for the current cycle. */
  id: string;
  period: string;
  text: string;
  /** Past payroll record ids behind the line. */
  recordIds: string[];
};

export type CompanyPerson = {
  id: string;
  displayName: string;
  initials: string;
  /** "Field · hourly", "Manager · salary", "Inactive · hourly". */
  roleLabel: string;
  kind: PayKind;
  foundIn: { jobber: boolean; gusto: boolean; venmo: boolean };
  /** Sum of this cycle's Jobber time entries, before checks. Null when the person has none on record. */
  hours: number | null;
  hourEntryIds: string[];
  tone: PersonTone;
  /** "Ready", "Doesn't match", "No pay rate", "Venmo"… */
  label: string;
  needsLook: boolean;
  /** Open person-level flags this viewer may see (the checks behind `label`). */
  flagIds: string[];
  /** Other open flags about this person's hours this viewer may see (they live on Home). */
  otherFlagIds: string[];
  /** One plain sentence for the detail panel. The owner's may state amounts; the manager's never does. */
  note: string;
  /** Owner only (null for a manager). */
  pay: {
    main: string;
    /** Only when something is off. */
    sub: string | null;
    tiles: RateTile[];
    /** The rule a rate change replaces, if there is one. */
    ruleId: string | null;
    history: PayHistoryLine[];
  } | null;
};

export type SettingCard = {
  id:
    | "schedule"
    | "timezone"
    | "overtime"
    | "longShift"
    | "payChange"
    | "margin";
  label: string;
  text: string;
  /** Editable number, with its unit ("h a week"). Null for settings that come from Gusto. */
  value: number | null;
  unit: string;
  source: string;
};

export type ConnectedApp = {
  system: "jobber" | "qbo" | "gusto";
  name: string;
  what: string;
  /** "85 of 85 entries"; "75 of 76" when incomplete. */
  count: string;
  complete: boolean;
  syncRunIds: string[];
};

/** What onboarding read from past cycles: record counts only, never amounts. */
export type HistoryRead = {
  system: "jobber" | "gusto" | "venmo";
  label: string;
  pulled: number;
  /** Null when no count was checked against the source. */
  expected: number | null;
  complete: boolean;
  detail: string;
};

export type CompanyViewData = {
  people: CompanyPerson[];
  settings: SettingCard[];
  routing: {
    ruleId: string;
    jobFacts: { id: string; name: string } | null;
    money: { id: string; name: string } | null;
  } | null;
  employeesMayBeTexted: boolean | null;
  apps: ConnectedApp[];
  /** Past (closed) cycles read at onboarding, and what was read from them. */
  history: { cycles: number; period: string | null; reads: HistoryRead[] };
  /** When the current cycle's last sync finished (ISO). */
  syncedAt: string | null;
  canSeePay: boolean;
  sources: {
    roster: string;
    flags: string;
    hours: string;
    payrolls: string;
    settings: string;
  };
};
