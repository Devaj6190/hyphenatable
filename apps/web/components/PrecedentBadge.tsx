import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Flag } from "@/lib/types";

// "no precedent" is an outlined neutral chip; a precedent links to its rule. Note text renders verbatim.
export function PrecedentBadge({
  precedent,
  companyId,
}: {
  precedent: Flag["precedent"];
  companyId: string;
}) {
  if (!precedent || precedent.note === "no precedent") {
    return (
      <Badge tone="neutral" variant="outline">
        no precedent
      </Badge>
    );
  }
  if (!precedent.ruleId)
    return (
      <Badge tone="brand" variant="outline">
        {precedent.note}
      </Badge>
    );
  return (
    <Badge
      tone="brand"
      variant="outline"
      render={<Link href={`/c/${companyId}/rules#${precedent.ruleId}`} />}
    >
      {precedent.note}
    </Badge>
  );
}
