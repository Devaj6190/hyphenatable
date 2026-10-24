import { redirect } from "next/navigation";

// Company A fixture id until B's ids exist.
export default function Home() {
  redirect("/c/a");
}
