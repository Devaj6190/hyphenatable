import { redirect } from "next/navigation";

// This page only redirects, so there is no UI for the dev `instant` validator to check. Opt this one segment out.
export const instant = false;

// Company A fixture id until B's ids exist.
export default function Home() {
  redirect("/c/a");
}
