import ts from "typescript";
import type { SourceProject, Touched } from "./project.js";

/** A top-level declaration reached by name, possibly through imports and re-exports. */
export interface Binding {
  file: string;
  name: string;
  /** Function, variable declaration, class or default-export expression node. */
  node: ts.Node;
  sf: ts.SourceFile;
}
/** What a name refers to. A namespace import resolves to the imported module. */
export type Resolved =
  | { kind: "binding"; binding: Binding }
  | { kind: "namespace"; file: string }
  | { kind: "unresolved"; reason: "depth" | "missing" };
/** Shared state for one resolution walk. */
export interface WalkContext {
  depth: number;
  max: number;
  seen: Set<string>;
  touched?: Touched;
}
interface ImportRef {
  spec: string;
  /** Exported name, "default", or "*" for a namespace import. */
  imported: string;
}
type ExportEntry = ({ local: string } | { spec: string; imported: string }) & { at: ts.Node };

/** Where a name is exported, for evidence. */
export type { ExportEntry };

interface Table {
  locals: Map<string, ts.Node>;
  imports: Map<string, ImportRef>;
  exports: Map<string, ExportEntry>;
  stars: string[];
  /** Exports that cannot be followed statically (destructuring, export =). */
  dynamic: ts.Node[];
}
const tables = new WeakMap<ts.SourceFile, Table>();
function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  return ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === kind);
}
/** Index a module's declarations, imports and exports. */
export function tableOf(sf: ts.SourceFile): Table {
  const hit = tables.get(sf);
  if (hit) return hit;
  const t: Table = {
    locals: new Map(),
    imports: new Map(),
    exports: new Map(),
    stars: [],
    dynamic: [],
  };
  for (const st of sf.statements) {
    const exported = hasModifier(st, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(st, ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) {
      const name = st.name?.text ?? (isDefault ? "default" : undefined);
      if (!name) continue;
      t.locals.set(name, st);
      if (exported) t.exports.set(isDefault ? "default" : name, { local: name, at: st });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          t.locals.set(d.name.text, d);
          if (exported) t.exports.set(d.name.text, { local: d.name.text, at: st });
        } else if (exported) t.dynamic.push(d);
      }
    } else if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text,
        c = st.importClause;
      if (!c || c.isTypeOnly) continue;
      if (c.name) t.imports.set(c.name.text, { spec, imported: "default" });
      const nb = c.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) t.imports.set(nb.name.text, { spec, imported: "*" });
      else if (nb)
        for (const e of nb.elements)
          if (!e.isTypeOnly)
            t.imports.set(e.name.text, { spec, imported: (e.propertyName ?? e.name).text });
    } else if (ts.isExportDeclaration(st) && !st.isTypeOnly) {
      const spec =
        st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)
          ? st.moduleSpecifier.text
          : undefined;
      const ec = st.exportClause;
      if (!ec) {
        if (spec) t.stars.push(spec);
      } else if (ts.isNamedExports(ec)) {
        for (const e of ec.elements) {
          if (e.isTypeOnly) continue;
          const imported = (e.propertyName ?? e.name).text;
          t.exports.set(e.name.text, spec ? { spec, imported, at: e } : { local: imported, at: e });
        }
      } else if (spec && ts.isNamespaceExport(ec)) {
        t.exports.set(ec.name.text, { spec, imported: "*", at: st });
      }
    } else if (ts.isExportAssignment(st)) {
      if (st.isExportEquals) t.dynamic.push(st);
      else if (ts.isIdentifier(st.expression))
        t.exports.set("default", { local: st.expression.text, at: st });
      else {
        t.locals.set("default", st);
        t.exports.set("default", { local: "default", at: st });
      }
    }
  }
  tables.set(sf, t);
  return t;
}
/** Resolves names through imports, re-exports and barrels with a depth limit and cycle guard. */
export class ModuleGraph {
  constructor(readonly project: SourceProject) {}
  /** Resolve an exported name of a module. */
  async exported(file: string, name: string, ctx: WalkContext): Promise<Resolved> {
    const key = `${file}#${name}`;
    if (ctx.depth > ctx.max || ctx.seen.has(key)) return { kind: "unresolved", reason: "depth" };
    const next: WalkContext = { ...ctx, depth: ctx.depth + 1, seen: new Set([...ctx.seen, key]) };
    const parsed = await this.project.source(file);
    ctx.touched?.files.add(file);
    if (!parsed?.sf) return { kind: "unresolved", reason: "missing" };
    const t = tableOf(parsed.sf);
    const entry = t.exports.get(name);
    if (entry) {
      if ("local" in entry) return this.local(file, parsed.sf, entry.local, name, next);
      return this.fromSpec(file, entry.spec, entry.imported, next);
    }
    if (name !== "default")
      for (const spec of t.stars) {
        const r = await this.fromSpec(file, spec, name, next);
        if (r.kind !== "unresolved") return r;
      }
    return { kind: "unresolved", reason: "missing" };
  }
  /** Resolve a name used inside a file: a local declaration or an import. */
  async identifier(file: string, name: string, ctx: WalkContext): Promise<Resolved> {
    const parsed = await this.project.source(file);
    ctx.touched?.files.add(file);
    if (!parsed?.sf) return { kind: "unresolved", reason: "missing" };
    return this.local(file, parsed.sf, name, name, ctx);
  }
  private async local(
    file: string,
    sf: ts.SourceFile,
    local: string,
    exportedAs: string,
    ctx: WalkContext,
  ): Promise<Resolved> {
    const t = tableOf(sf);
    const node = t.locals.get(local);
    if (node) return { kind: "binding", binding: { file, name: exportedAs, node, sf } };
    const imp = t.imports.get(local);
    if (imp) return this.fromSpec(file, imp.spec, imp.imported, ctx);
    return { kind: "unresolved", reason: "missing" };
  }
  private async fromSpec(
    from: string,
    spec: string,
    imported: string,
    ctx: WalkContext,
  ): Promise<Resolved> {
    const target = this.project.resolve(from, spec, ctx.touched);
    if (!target) return { kind: "unresolved", reason: "missing" };
    if (imported === "*") return { kind: "namespace", file: target };
    return this.exported(target, imported, ctx);
  }
}
/** Fresh walk context for a resolution starting at depth 0. */
export function walk(max: number, touched?: Touched): WalkContext {
  return { depth: 0, max, seen: new Set(), touched };
}
