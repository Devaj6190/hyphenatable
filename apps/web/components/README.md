# UI foundation

Shared tokens, shell and components for every `/c/[companyId]` page. See them all, in both themes, at
`/c/a/styleguide` (dev page, not in the nav).

Sources: style from `docs/plans/design-style-handoff.md` (Host Grotesk, light and dark, motion table), content and
page placement from Shannin's boards, product rules from `AGENTS.md` and `docs/plans/C-product-messaging-demo.md`
sections 4 and 5. Where the style brief and C plan 4.1/4.2 disagree on tokens or font, the style brief wins.

## Rules for page sessions

- Use tokens (`bg-card`, `text-muted-foreground`, `text-link`, `bg-hold-soft`), never hex values. Links use
  `text-link`, not `text-primary` (the primary fill is too dark for text on the dark theme).
- Green brand chrome is never a status. Verified is `<StatusBadge status="verified" />` (icon + word).
  Amber = needs you / held, blue = asked / waiting, red = incomplete sync, errors, destructive actions.
- Every status carries a word, and usually an icon. Never color alone.
- Every page header area and every Company R card shows a `DataLabel`. Every number says where it came from
  (`SourceChip`) and whether it is synthetic.
- Money: integer cents through `<Money cents />`. Never on manager or employee surfaces; `FlagCard` strips
  `affects.dollarsCents` unless the viewer is the owner.
- Never the word "submit" near Gusto. Use "Fill Gusto draft" and "Draft only. PayrollPilot never submits payroll."
- No real names. Ids or fake display names only.
- Next 16 instant navigation: don't `await params` at the top of a page or layout. Read them in a child inside
  `<Suspense>` (see `app/c/[companyId]/page.tsx`) or with `useParams()` in a client component.
- Page title: `<PageHeader title description actions />`. Content width is set by the shell (`max-w-6xl`).

## Routes and nav

| Route | Board | Nav item highlighted |
|---|---|---|
| `/c/[id]` | 1 Home, 1b Home on phone | Home |
| `/c/[id]/inputs` | 2 Inputs and problems | Home |
| `/c/[id]/flags/[flagId]` | 7 Problem detail | Home |
| `/c/[id]/workbook` | 8 Workbook and readiness | Workbook |
| `/c/[id]/workbook/ready` | 3 Payroll ready (Gusto draft filled) | Workbook |
| `/c/[id]/rules` | 9 Rules | Rules |
| `/c/[id]/rules/learned` | 5 What it learned | Rules |
| `/c/[id]/manager` | 11 Manager inbox | Manager |
| `/c/[id]/onboarding` | 4 Onboarding | Onboarding |
| `/c/[id]/audit` | 10 Audit log | Audit |
| `/c/[id]/demo` | 12 Demo panel (404 unless `NEXT_PUBLIC_DEMO_MODE=1`) | Demo |
| `/c/[id]/styleguide` | none (dev) | none |

**Decision: Inputs, Ready and Learned get their own routes but no nav entries.** On Shannin's boards the
Inputs board highlights Home, Ready highlights Workbook and Learned highlights Rules, and none of them is in
her nav. They are reached from links on the parent page ("see all", "See every input", "All 11 rules"). Own
routes keep each page session in its own file. The nav stays at the six C-plan items (plus Demo in demo mode),
so the phone tab bar keeps Shannin's five slots: Home, Rules, Workbook, Audit, More (Manager, Onboarding, Demo).

## Shell

`app/c/[companyId]/layout.tsx` renders `Nav` (left rail at `lg`, bottom tabs below) and `ShellHeader`: fake
company name, cycle period, `DataLabel`, seats line, company switcher, theme toggle and, in demo mode, the
Owner / Manager switch. Company and cycle come from `lib/companies.ts` (fixture copy until `cycles.get` is live).

Role: `useRole()` from `RoleProvider` (cookie `pp_role`, taken from the `c/role-switch` branch unchanged).
Theme: `data-theme="light|dark"` on `<html>`, set before paint by `THEME_SCRIPT` (`lib/theme.ts`). No stored
value means "system", and the script follows system changes live. An explicit choice lives in
`localStorage["pp-theme"]`. Wrap any subtree in `data-theme="dark"` or `data-theme="light"` to force a theme.

## Component APIs

Primitives live in `components/ui/` (shadcn on Base UI, restyled). Domain components live in `components/`.

### `Button` (`@/components/ui/button`)
`variant`: `"primary"` (default) | `"secondary"` | `"quiet"` | `"destructive"`. `default`, `outline`, `ghost`
and `link` are still accepted for existing code. `size`: `"sm"` (32px) | `"default"` (40px) | `"lg"` (44px) |
`"icon"` | `"icon-sm"`. All Base UI button props. Press compresses 1.5%; hover 140ms.

### `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` (`@/components/ui/card`)
`Card` props: `size?: "default" | "sm"`, `interactive?: boolean` (lift on hover; only when the whole card is
one link or button). 16px radius, padding from `--card-spacing`.

### `Badge` (`@/components/ui/badge`)
`tone`: `"neutral" | "brand" | "hold" | "ask" | "ok" | "error" | "strong"`; `variant`: `"soft"` (default) |
`"outline"`; `render` to render as a link. Base for every chip below.

### `StatusBadge`
`{ status: "needs-you" | "held" | "asked" | "verified" | "sync-incomplete" | "closed"; label?: string; className? }`.
`label` changes the word, never the icon or color. `flagStatus[flag.status]` maps a `Flag.status` to
`{ status, label }`.

### `DataLabel`
`{ kind: "synthetic" | "real, anonymized"; detail?: string; className? }`, e.g. `detail="Company A, cycle 5"`.

### `SourceChip`
`{ system: "Jobber" | "QuickBooks" | "Gusto" | "Workbook"; recordId: string; url?: string | null }`. Shows the
record id on hover, click/tap and Enter/Space, with "Open in …" when `url` is set.

### `ConfidenceBadge`
`{ confidence: "certain" | number }`. Renders "rule: certain", or "72% sure" (amber below 0.85, neutral at or
above; green stays reserved for verified).

### `PrecedentBadge`
`{ precedent: Flag["precedent"]; companyId: string }`. "no precedent" (outlined) or the note verbatim, linked
to `/c/[id]/rules#<ruleId>`.

### `AgentChip`
`{ agent: "analyst" | "auditor" | "messenger" | "controller" | "you" | "owner" | "manager"; label?: string }`.
`agentFromActor(event.actor)` maps an `AuditEvent.actor` to a kind.

### `SimulatedChip`
`{ className? }`. Red outline "Simulated", on every message or reply from `demo.simulatedReply`.

### `Money`
`{ cents: number; signed?: boolean; className? }` gives `$1,284.50`, `−$344.25` and, with `signed`,
`+$344.25`. Uses `formatCents` from `lib/money.ts` (check: `bun apps/web/lib/money.check.ts`).

### `Segmented`
`{ value; onValueChange; options: { value, label, icon?, iconOnly? }[]; label: string; size?: "sm" | "default" }`.
A radio group drawn as a pill track. The selection surface slides, and labels stay put. Use it for value pickers
(Owner / Manager, Stage 1 / Stage 2, filters without panels).

### `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` (`@/components/ui/tabs`)
Base UI tabs for panels, with a sliding indicator. `Tabs` takes `value` / `onValueChange` / `defaultValue`.

### `Sheet*`, `Dialog*` (`@/components/ui/sheet`, `@/components/ui/dialog`)
shadcn API, plus `scrim?: "frosted" | "plain"` on `SheetContent` and `DialogContent` (default frosted). Bodies
are always solid. `SheetContent side="bottom"` for phone sheets. Use `render={<Button … />}` on triggers.

### `FlagCard`
```ts
{
  flag: Flag; dataKind: DataKind;
  viewerRole?: "owner" | "manager";    // defaults to useRole(); dollars only for "owner"
  headline?: string;                    // defaults to flag.seen
  affectsLabel?: string;                // "Wages", "Job cost", "Commission"
  agents?: AgentKind[];                 // chips, e.g. ["auditor", "messenger"]
  children?: ReactNode;                 // body: proposed text, match picker, diff
  onApprove?, onEdit?, onDeny?: () => void;   // each button renders only if its handler is set
  approveLabel?: string;                // "Approve and send", "Approve rule"
  pending?: boolean;                    // disables the actions during a mutation
  detailsOpen?: boolean;                // Where / Affects / Check expanded
  href?: string | null;                 // "Open problem" link; null hides it
}
```
Shannin's eight elements: status tag, headline, Where, Precedent, Affects, Check, Approve / Edit / Deny.

### `PageHeader`, `Placeholder`, `ThemeToggle`, `RoleSwitch`, `ShellHeader`, `Nav`
`PageHeader { title; description?; actions? }`. `Placeholder` is the route stub; replace the whole page file.
The other four belong to the shell.

## Tokens

All tokens are in `app/globals.css` and mapped into Tailwind's theme. Spacing is Tailwind's 4px scale.
Radii: `rounded-control` 10px, `rounded-card` 16px, `rounded-overlay` 20px, `rounded-full` for pills.
Shadows: `shadow-card`, `shadow-raised`, `shadow-overlay` (broad and soft in light, tonal with an edge highlight
in dark). Utilities: `grain` (static 1.5–2% noise, on the canvas only), `frosted` (blurred raised surface with an
opaque fallback and reduced-transparency support), `frosted-scrim`, `pressable`.

Motion: `--dur-hover` 140ms, `--dur-press` 100ms, `--dur-tab` 210ms, `--dur-sheet` 280ms, `--dur-archive`
480ms, `--dur-success` 190ms, easing `ease-out-soft`. Use them as `duration-(--dur-tab) ease-out-soft`. Under
`prefers-reduced-motion` they drop to 0 (sheets 120ms fade, no slide), and press scale goes to 1.

### Changes from the style brief, all contrast-checked (WCAG: text 4.5:1, boundaries 3:1)

| Token | Light | Dark | Why |
|---|---|---|---|
| `--input` (control border) | `#7E8F83` (3.4:1 on card) | `#6B8273` (3.9:1) | the decorative divider is too faint for controls |
| `--primary-edge` | = fill | `#4E9A7A` (4.8:1 on card) | the dark primary fill is only 1.8:1 on the card |
| `--link`, `--ring` | `#14543F` (8.9:1) | `#A4D6B5` (9.9:1) | from the brief |
| hold / hold-soft | `#8A5300` / `#FCEFD4` (5.6:1) | `#F1C26A` / `#3A2D12` (8.1:1) | new |
| ask / ask-soft | `#1E4FB0` / `#E5EDFB` (6.4:1) | `#A3C1F7` / `#1C2A45` (7.9:1) | new |
| ok / ok-soft (verified) | `#1C6B36` / `#DFF2E4` (5.6:1) | `#93D7A6` / `#1C3A26` (7.4:1) | new |
| destructive / soft | `#B42318` / `#FDEBE8` (5.7:1) | `#F7A396` / `#421E1A` (7.4:1) | new; the destructive button fill is `#B42318` with white (6.6:1) in both themes |
| agents (analyst, auditor, messenger) | 6.6 / 5.5 / 6.0:1 | 7.9 / 7.8 / 7.8:1 | new |

Every other brief value is used as given. Primary text and secondary text pass on every surface (secondary
text is at least 5.2:1 light and 7.0:1 dark).

## Font

Host Grotesk v1.002 variable (wght 300–800, roman and italic), from Element Type's GitHub release
(`github.com/Element-Type/HostGrotesk`). Files and `OFL.txt` are in `app/fonts/`, loaded by `next/font/local`.
The font has **no `tnum` feature**, but its default digits are all the same width (650 units) and lining, so
amounts already line up. `tabular-nums` is set anyway for the fallback fonts.

## Not built here

The cycle archive rack (the signature interaction) waits for a page that places it. `StageTracker`,
`NeedsYouList`, `Counts`, `LiveFeed`, `AuditRow`, `RuleCard` and `CorrectionDiff` belong to the page
sessions that use them. `ApprovalSheet`, `FlagDetail` and `FlagsList` (from C-06) only picked up the new tokens.

21st.dev MCP was not connected in this session, so every component starts from
shadcn (Base UI) and is normalized to these tokens.
