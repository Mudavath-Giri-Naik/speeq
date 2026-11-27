"use client";

import { useSpeeqForm } from "@speeq/react";
import { useRef } from "react";
import { PRACTICE_FORM_ID } from "../lib/forms";

interface Props {
  subjects: { slug: string; name: string }[];
  difficulties: readonly string[];
  subject: string;
  difficulty: string;
  q: string;
}

/**
 * The practice filter form. The assistant can fill a draft of it (it never submits): fields the
 * visitor already edited are left alone, and the visitor presses "Apply filters" themselves.
 */
export function PracticeFilters(props: Props) {
  const form = useRef<HTMLFormElement>(null);
  const edited = useRef(new Set<string>());
  useSpeeqForm(PRACTICE_FORM_ID, {
    isDirty: (name) => edited.current.has(name),
    setValues(values) {
      for (const [name, value] of Object.entries(values)) {
        const field = form.current?.elements.namedItem(name);
        if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement)
          field.value = String(value);
      }
    },
  });
  return (
    <form
      ref={form}
      method="get"
      action="/practice"
      className="card filters"
      onInput={(event) => {
        const name = (event.target as HTMLInputElement).name;
        if (name) edited.current.add(name);
      }}
    >
      <label>
        Subject
        <select name="subject" defaultValue={props.subject}>
          <option value="">All subjects</option>
          {props.subjects.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Difficulty
        <select name="difficulty" defaultValue={props.difficulty}>
          <option value="">All levels</option>
          {props.difficulties.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Search
        <input
          type="search"
          name="q"
          defaultValue={props.q}
          maxLength={100}
          placeholder="e.g. motion"
        />
      </label>
      <button type="submit">Apply filters</button>
    </form>
  );
}
