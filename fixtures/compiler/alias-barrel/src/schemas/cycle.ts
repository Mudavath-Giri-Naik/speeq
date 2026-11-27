import { z } from "zod";
import { B } from "./cycle2";
export const A = z.object({ b: B });
