import type { ReactNode } from "react";
/** Scrollable data table with labelled column headers. */
export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            {headers.map((x) => (
              <th key={x} scope="col">
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
