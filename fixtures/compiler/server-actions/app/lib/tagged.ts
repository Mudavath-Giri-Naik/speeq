import { z } from "zod";
const A = z.object({ a: z.string() });
/** @speeq read */
export function tagged(input: z.infer<typeof A>) {}
export function untagged(input: z.infer<typeof A>) {}
