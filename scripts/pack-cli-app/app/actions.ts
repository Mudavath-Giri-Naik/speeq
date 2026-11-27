"use server";
import { z } from "zod";

const Item = z.object({ id: z.string(), qty: z.number().int().min(1) });
const Query = z.object({ subject: z.string() });

/** @speeq write */
export async function addToCart(input: z.infer<typeof Item>) {
  return { added: input.id, qty: input.qty };
}

export async function countItems(input: z.infer<typeof Query>) {
  return { subject: input.subject, count: 3 };
}
