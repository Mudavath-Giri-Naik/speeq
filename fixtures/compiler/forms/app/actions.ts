"use server";
import { z } from "zod";
const S = z.object({ email: z.string() });
export async function sendMessage(input: z.infer<typeof S>) {}
