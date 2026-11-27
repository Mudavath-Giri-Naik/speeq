/** Manifest id of the practice filter form (`speeq scan` reports it as this capability). */
export const PRACTICE_FORM_ID = "form:app/practice/page.tsx#form1";

/** Fields of the practice filter form, as the scanner records them. */
export const PRACTICE_FORM_FIELDS = [
  { name: "subject", type: "select", required: false, sensitive: false },
  { name: "difficulty", type: "select", required: false, sensitive: false },
  { name: "q", type: "search", required: false, sensitive: false },
];
