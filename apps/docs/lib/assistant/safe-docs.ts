import { getAllDocs } from "../content";

/**
 * The docs for the assistant. If the markdown files cannot be read (for example they were left
 * out of a serverless bundle), the assistant still starts and just has no docs to search.
 */
export function readDocsSafely(): ReturnType<typeof getAllDocs> {
  try {
    return getAllDocs();
  } catch (error) {
    console.error(
      `[speeq assistant] could not read the docs: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}
