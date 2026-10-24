"use client";

// B-01 probe page (H5): subscribes to probe.list and shows the scheduled row landing. C replaces this with the owner home.
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function Home() {
  const rows = useQuery(api.probe.list);
  const schedule = useMutation(api.probe.schedule);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-8 font-sans">
      <h1 className="text-2xl font-semibold">PayrollPilot</h1>
      <button
        type="button"
        className="w-fit rounded bg-black px-3 py-1 text-white"
        onClick={() => schedule()}
      >
        Schedule a ping in 5 s
      </button>
      <ul className="font-mono text-sm">
        {rows === undefined ? (
          <li>loading…</li>
        ) : (
          rows.map((r) => (
            <li key={r._id}>
              {r.at} · {r.note}
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
