import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";

// Rules moved under Company → Rules. Old links (and PrecedentBadge's #ruleId; the browser keeps the hash
// across the redirect) keep working.
export default async function RulesPage({
  params,
}: PageProps<"/c/[companyId]/rules">) {
  const { companyId } = await params;
  redirect(routes.company(companyId, "rules"));
}
