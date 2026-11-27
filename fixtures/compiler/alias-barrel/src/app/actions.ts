"use server";
import { z } from "zod";
import { Thing, Renamed, A, Deep } from "@/schemas";
/** @speeq read */
export async function viaStar(input: z.infer<typeof Thing>) {}
/** @speeq read */
export async function viaRename(input: z.infer<typeof Renamed>) {}
/** @speeq read */
export async function viaCycle(input: z.infer<typeof A>) {}
/** @speeq read */
export async function viaDeep(input: z.infer<typeof Deep>) {}
