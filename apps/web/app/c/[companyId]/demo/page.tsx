import { notFound } from "next/navigation";
import { Placeholder } from "@/components/Placeholder";
import { DEMO_MODE } from "@/lib/demo";

// Hidden unless NEXT_PUBLIC_DEMO_MODE=1.
export default function Page() {
  if (!DEMO_MODE) notFound();
  return (
    <Placeholder
      title="Demo panel"
      description="Reset Company A, enter a judge’s scenario, play a simulated manager reply."
      board="12 · Demo panel"
    />
  );
}
