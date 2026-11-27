"use server";
import { z } from "zod";
const Item = z.object({ id: z.string() });
/** @speeq write */
export async function addItem(input: z.infer<typeof Item>) {}
export async function parsed(input: unknown) { const v = Item.parse(input); return v; }
export async function formAction(formData: FormData) {}
export async function twoArgs(prev: unknown, input: z.infer<typeof Item>) {}
/** @speeq-ignore */
export async function ignored(input: z.infer<typeof Item>) {}
export async function noInput() {}
export const arrow = async (input: z.infer<typeof Item>) => {};
export const constant = 5;
export async function untyped(input: unknown) {}
