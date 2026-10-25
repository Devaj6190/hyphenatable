import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmployeeReview } from "@/components/employee/EmployeeReview";
import { companies } from "@/lib/companies";
import { employeeReviewView } from "@/lib/server/views/manager";

// The employee review page. Public URL /c/[companyId]/e/[token] (next.config.ts rewrites it here), so the
// owner shell, its nav and the role switch never render for an employee. Hours only, never pay.
export const metadata: Metadata = {
  title: "Your hours · RollPay",
  robots: { index: false, follow: false },
};

export default function EmployeePage({
  params,
}: PageProps<"/e/[companyId]/[token]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({
  params,
}: Pick<PageProps<"/e/[companyId]/[token]">, "params">) {
  const { companyId, token } = await params;
  const company = companies[companyId];
  const data = company && employeeReviewView(companyId, token);
  if (!company || !data) notFound();
  return <EmployeeReview data={data} dataKind={company.kind} />;
}
