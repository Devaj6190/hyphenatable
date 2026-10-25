import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";

// "What it learned" is now a section of Company → Rules.
export default async function LearnedPage({
  params,
}: PageProps<"/c/[companyId]/rules/learned">) {
  const { companyId } = await params;
  redirect(routes.company(companyId, "rules", "learned"));
}
