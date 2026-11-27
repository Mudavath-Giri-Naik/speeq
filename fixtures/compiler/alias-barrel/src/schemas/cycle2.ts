import { z } from "zod";
import { A } from "./cycle";
export const B = z.object({ a: A });
