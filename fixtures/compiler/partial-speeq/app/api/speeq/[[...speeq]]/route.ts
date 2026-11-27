import { createNextHandler } from "@speeq/server/next";
const handle = createNextHandler(speeq).GET;
export { handle as GET, handle as POST };
