import { z } from "zod";
const B = z.object({ title: z.string() });
export default function handler(req, res) {
  if (req.method === "POST") {
    res.json(B.parse(req.body));
  }
}
