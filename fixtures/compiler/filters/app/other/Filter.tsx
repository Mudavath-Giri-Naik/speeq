"use client";
import { useSearchParams } from "next/navigation";
export function Filter() {
  const sp = useSearchParams();
  sp.get("x");
  return null;
}
