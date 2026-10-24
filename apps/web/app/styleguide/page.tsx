import { notFound } from "next/navigation";
import { Styleguide } from "./Styleguide";

// Dev-only page outside the company shell, so no company's DataLabel sits over its synthetic samples.
export default function StyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Styleguide />;
}
