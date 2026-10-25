import type { Flag, Rule } from "../schemas";
import { dollars, inPeriod, recordFlag } from "./flag";
import type { Check, CheckInput } from "./types";

/** A payment taken on a quote (a deposit) that is recorded as an invoice's final payment. */
export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const co = input.company.id;
  const invoices = new Map(
    input.invoices.filter((i) => i.companyId === co).map((i) => [i.id, i]),
  );
  const quotes = new Map(
    input.quotes.filter((q) => q.companyId === co).map((q) => [q.id, q]),
  );
  const payments = [
    ...new Map(
      input.payments.filter((p) => p.companyId === co).map((p) => [p.id, p]),
    ).values(),
  ];
  return payments
    .filter(
      (p) =>
        p.kind === "final" &&
        p.quoteId !== null &&
        p.invoiceId !== null &&
        inPeriod(input, p.entryDate),
    )
    .map((p) => {
      const inv = invoices.get(p.invoiceId as string);
      const quote = quotes.get(p.quoteId as string);
      const jobId = inv?.jobId ?? quote?.jobId ?? null;
      // Still owed if this is the deposit: invoice total minus every deposit/final on it or its quote.
      const paid = payments.filter(
        (o) =>
          o.kind !== "unknown" &&
          (o.invoiceId === p.invoiceId || o.quoteId === p.quoteId),
      );
      const owed =
        inv?.totalCents != null && paid.every((o) => o.amountCents !== null)
          ? inv.totalCents -
            paid.reduce((s, o) => s + (o.amountCents as number), 0)
          : null;
      return recordFlag(
        input,
        "CHK-19",
        "owner",
        p.id,
        { jobId },
        `Payment ${p.id} was taken on quote ${p.quoteId} but is recorded as invoice ${p.invoiceId}'s final payment` +
          (owed === null
            ? "."
            : `; if it is the deposit, ${dollars(owed)} is still owed.`),
        [
          { system: "jobber", recordId: p.sourceId, url: null },
          ...(inv
            ? [{ system: "jobber", recordId: inv.sourceId, url: null }]
            : []),
        ],
        { dollarsCents: owed },
      );
    });
}
export default { id: "CHK-19", run } satisfies Check;
