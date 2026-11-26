import { BlurFade } from "@/components/ui/blur-fade";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Em, Section, SectionHead } from "./kit";

type Mark = "yes" | "partial" | "varies" | "no" | "roadmap";

const MARKS: Record<Mark, { label: string; glyph: string; tone: string }> = {
  yes: { label: "Yes", glyph: "●", tone: "text-ok" },
  partial: { label: "Partial", glyph: "◐", tone: "text-soft" },
  varies: { label: "Varies", glyph: "◌", tone: "text-muted" },
  no: { label: "Not the aim", glyph: "○", tone: "text-muted" },
  roadmap: { label: "Roadmap", glyph: "◇", tone: "text-warn" },
};

const COLUMNS = ["Chatbots", "Browser agents", "Analytics tools", "speeq"] as const;

const ROWS: Array<{ dimension: string; cells: [Mark, Mark, Mark, Mark] }> = [
  { dimension: "Natural-language interaction", cells: ["yes", "yes", "no", "yes"] },
  { dimension: "Knows the current app context", cells: ["varies", "partial", "partial", "yes"] },
  { dimension: "Native navigation inside your app", cells: ["varies", "partial", "no", "yes"] },
  { dimension: "Developer-defined actions", cells: ["varies", "no", "no", "yes"] },
  { dimension: "Reuses your existing business logic", cells: ["varies", "partial", "no", "yes"] },
  { dimension: "Enforces your authorization", cells: ["varies", "varies", "no", "yes"] },
  { dimension: "You own the interface (headless)", cells: ["varies", "no", "no", "yes"] },
  { dimension: "Choose your model provider", cells: ["varies", "varies", "no", "yes"] },
  { dimension: "Runs in your infrastructure", cells: ["varies", "varies", "varies", "yes"] },
  { dimension: "Requires copying your knowledge", cells: ["varies", "no", "no", "no"] },
  { dimension: "Automatic application discovery", cells: ["no", "partial", "no", "roadmap"] },
  { dimension: "Proactive engagement", cells: ["varies", "no", "no", "roadmap"] },
  { dimension: "Business outcome intelligence", cells: ["varies", "no", "yes", "partial"] },
];

function Cell({ mark, accent }: { mark: Mark; accent?: boolean }) {
  const m = MARKS[mark];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[0.78rem]",
        m.tone,
        accent && "font-medium",
      )}
    >
      <span aria-hidden="true">{m.glyph}</span>
      <span className={cn(mark === "yes" || mark === "roadmap" ? "" : "text-muted")}>
        {m.label}
      </span>
    </span>
  );
}

/** A fair comparison of architectures. Categories are typical designs; real products differ. */
export function Compare() {
  return (
    <Section id="compare">
      <SectionHead
        id="compare"
        eyebrow="Differentiation"
        title={
          <>
            Not another chatbot.
            <br />
            An <Em>interaction layer.</Em>
          </>
        }
        lede="Chatbots converse. Browser agents operate interfaces. Analytics platforms measure activity. speeq connects natural interaction to your application’s own code, business logic, permissions and data."
      />

      <BlurFade inView>
        <div className="panel overflow-hidden">
          <Table className="min-w-[44rem]">
            <TableHeader>
              <TableRow className="border-line hover:bg-transparent">
                <TableHead className="sticky left-0 z-10 w-[30%] min-w-[10.5rem] bg-elev py-3.5 pl-4 text-[0.72rem] font-medium text-muted">
                  Dimension
                </TableHead>
                {COLUMNS.map((c) => (
                  <TableHead
                    key={c}
                    className={cn(
                      "py-3.5 text-[0.72rem] font-medium text-muted",
                      c === "speeq" && "bg-accent-soft text-accent",
                    )}
                  >
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((row) => (
                <TableRow key={row.dimension} className="border-line hover:bg-surface/50">
                  <TableCell className="sticky left-0 z-10 min-w-[10.5rem] bg-elev py-3 pl-4 text-[0.82rem] whitespace-normal text-fg">
                    {row.dimension}
                  </TableCell>
                  {row.cells.map((mark, i) => (
                    <TableCell
                      key={COLUMNS[i]}
                      className={cn("py-3", i === 3 && "bg-accent-soft/60")}
                    >
                      <Cell mark={mark} accent={i === 3} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          These columns describe typical architectures, and individual products vary. “Varies” means
          it depends on the product and how it is set up. Roadmap items are not shipped yet. Today
          speeq’s business intelligence is the audit log and optional anonymous counters.
        </p>
      </BlurFade>

      <BlurFade inView delay={0.1}>
        <blockquote className="mt-14 border-l-2 border-accent pl-5 sm:mt-20 sm:pl-8">
          <p className="h-display max-w-3xl text-[clamp(1.5rem,4.4vw,2.6rem)] text-fg">
            Don’t rebuild your application for AI.
            <br />
            Let AI work with the application <Em>you’ve already built.</Em>
          </p>
        </blockquote>
      </BlurFade>
    </Section>
  );
}
