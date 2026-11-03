import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from './parser.ts';
import { check } from './checks.ts';
import { describe, locate } from './navigate.ts';
import { findUses, lookupName, nameIndex } from './index.ts';
import type { Loc, TableFile } from './index.ts';
import { formatEdits } from './layout.ts';
import { colorRanges, roles } from './colors.ts';
import type { Role } from './colors.ts';

const LANG = 'xmacro-def';
const sel: vscode.DocumentSelector = { language: LANG };
const parseDoc = (d: vscode.TextDocument) => parse(d.getText());
const range = (line: number, s: number, e: number) => new vscode.Range(line, s, line, e);
const isDef = (d: vscode.TextDocument) => d.languageId === LANG;

const CODE = '**/*.{c,cc,cpp,cxx,h,hh,hpp,hxx}';
const SKIP = '**/{node_modules,build,out,.git}/**';
const decoder = new TextDecoder();
const textOf = async (u: vscode.Uri) => {
  const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === u.toString());
  if (open) return open.getText();
  try { return decoder.decode(await vscode.workspace.fs.readFile(u)); } catch { return ''; }
};
const toLoc = (l: Loc) => new vscode.Location(vscode.Uri.parse(l.uri), range(l.line, l.start, l.end));

// Rebuilt on every request: tables are small and this is always fresh (open documents win over disk).
async function tables(): Promise<TableFile[]> {
  const uris = new Map<string, vscode.Uri>();
  for (const u of await vscode.workspace.findFiles('**/*.def', SKIP)) uris.set(u.toString(), u);
  for (const d of vscode.workspace.textDocuments) if (isDef(d)) uris.set(d.uri.toString(), d.uri);
  return Promise.all([...uris].map(async ([uri, u]) => ({ uri, doc: parse(await textOf(u)) })));
}

// a changed row only needs its own line replaced; a range formats the lines it touches
const edits = (d: vscode.TextDocument, r?: vscode.Range) =>
  formatEdits(d.getText())
    .filter(e => !r || (e.line >= r.start.line && e.line <= r.end.line))
    .map(e => vscode.TextEdit.replace(d.lineAt(e.line).range, e.text));

export function activate(ctx: vscode.ExtensionContext) {
  const diags = vscode.languages.createDiagnosticCollection(LANG);

  const readFile = (p: string) => {
    const open = vscode.workspace.textDocuments.find(d => isDef(d) && d.uri.scheme === 'file' && d.uri.fsPath === p);
    if (open) return open.getText();
    try { return readFileSync(p, 'utf8'); } catch { return undefined; }
  };
  const run = (d: vscode.TextDocument) => {
    const res = check(parseDoc(d), d.uri.scheme === 'file' ? { filePath: d.uri.fsPath, readFile } : {});
    diags.set(d.uri, res.map(x => {
      const dg = new vscode.Diagnostic(range(x.line, x.start, x.end), x.message,
        x.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
      dg.source = LANG;
      return dg;
    }));
  };
  // a change in one table can affect others (includer/included): re-check all open ones
  const runAll = () => vscode.workspace.textDocuments.filter(isDef).forEach(run);
  runAll();

  // deft.colors.*: one decoration type per non-empty setting, applied from the parser's ranges
  let types = new Map<Role, vscode.TextEditorDecorationType>();
  const paint = () => {
    for (const e of vscode.window.visibleTextEditors) {
      if (!isDef(e.document)) continue;
      const found = colorRanges(parseDoc(e.document));
      for (const [role, t] of types) e.setDecorations(t, found.filter(c => c.role === role).map(c => range(c.line, c.start, c.end)));
    }
  };
  const recolor = () => {
    types.forEach(t => t.dispose());
    types = new Map();
    const cfg = vscode.workspace.getConfiguration('deft.colors');
    for (const role of roles) {
      const color = cfg.get<string>(role);
      if (color) types.set(role, vscode.window.createTextEditorDecorationType({ color }));
    }
    paint();
  };
  recolor();

  ctx.subscriptions.push(
    diags,
    { dispose: () => types.forEach(t => t.dispose()) },
    vscode.workspace.onDidOpenTextDocument(d => isDef(d) && runAll()),
    vscode.workspace.onDidChangeTextDocument(e => { if (isDef(e.document)) { runAll(); paint(); } }),
    vscode.workspace.onDidCloseTextDocument(d => { if (isDef(d)) { diags.delete(d.uri); runAll(); } }),
    vscode.window.onDidChangeVisibleTextEditors(paint),
    vscode.workspace.onDidChangeConfiguration(e => e.affectsConfiguration('deft.colors') && recolor()),
    vscode.languages.registerHoverProvider(sel, {
      provideHover(d, pos) {
        const l = locate(parseDoc(d), pos.line, pos.character);
        return l && new vscode.Hover(new vscode.MarkdownString(describe(l)));
      },
    }),
    vscode.languages.registerDocumentSymbolProvider(sel, {
      provideDocumentSymbols: d => parseDoc(d).rows.map(r => {
        const a = r.name ?? r.id;
        return new vscode.DocumentSymbol(a?.text ?? r.macro, r.macro, vscode.SymbolKind.Constant,
          range(r.line, r.macroStart, r.end), a ? range(r.line, a.start, a.end) : range(r.line, r.macroStart, r.macroEnd));
      }),
    }),
    // C/C++ -> table row. Only names found in a table answer; everything else is left to other providers.
    vscode.languages.registerDefinitionProvider(['c', 'cpp'], {
      async provideDefinition(d, pos) {
        const w = d.getWordRangeAtPosition(pos, /[A-Za-z_]\w*/);
        if (!w) return;
        const hits = lookupName(nameIndex(await tables()), d.getText(w));
        return hits.length ? hits.map(toLoc) : undefined;
      },
    }),
    // table row name -> uses in C/C++
    vscode.languages.registerReferenceProvider(sel, {
      async provideReferences(d, pos) {
        const l = locate(parseDoc(d), pos.line, pos.character);
        const n = l?.row.name;
        if (!l || !n || l.row.args[l.arg ?? -1] !== n) return;
        const out: vscode.Location[] = [];
        for (const u of await vscode.workspace.findFiles(CODE, SKIP)) {
          for (const r of findUses(await textOf(u), n.text)) out.push(new vscode.Location(u, range(r.line, r.start, r.end)));
        }
        return out;
      },
    }),
    vscode.languages.registerDocumentFormattingEditProvider(sel, { provideDocumentFormattingEdits: d => edits(d) }),
    vscode.languages.registerDocumentRangeFormattingEditProvider(sel, {
      provideDocumentRangeFormattingEdits: (d, r) => edits(d, r),
    }),
    vscode.languages.registerDocumentLinkProvider(sel, {
      provideDocumentLinks(d) {
        if (d.uri.scheme !== 'file') return [];
        return parseDoc(d).includes.map(i =>
          new vscode.DocumentLink(range(i.line, i.start, i.end), vscode.Uri.file(resolve(dirname(d.uri.fsPath), i.path))));
      },
    }),
  );
}

export function deactivate() {}
