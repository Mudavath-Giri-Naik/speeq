"use client";
import { useSearchParams } from "next/navigation";
export default function Page() {
  const sp = useSearchParams();
  const q = sp.get("q");
  return null;
}
