import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Flag } from "@/lib/types";

export function PrecedentBadge({
  precedent,
  companyId,
}: {
  precedent: Flag["precedent"];
  companyId: string;
}) {
  if (!precedent || precedent.note === "no precedent") {
    return <Badge variant="outline">no precedent</Badge>;
  }
  const chip = (
    <Badge variant="outline" className="border-primary text-primary">
      {precedent.note}
    </Badge>
  );
  return precedent.ruleId ? (
    <Link href={`/c/${companyId}/rules#${precedent.ruleId}`}>{chip}</Link>
  ) : (
    chip
  );
}
