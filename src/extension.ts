import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from './parser.ts';
import type { Schema } from './parser.ts';
import { check } from './checks.ts';
import { describe, locate, outline } from './navigate.ts';
import type { OutlineNode } from './navigate.ts';
import { findUses, lookupName, nameIndex, refsToRow, resolveRef } from './index.ts';
import type { Loc, TableFile } from './index.ts';
import schema from './schema.json';

const LANG = 'xmacro-def';
const sel: vscode.DocumentSelector = { language: LANG };
const parseDoc = (d: vscode.TextDocument) => parse(d.getText(), schema as unknown as Schema);
const range = (line: number, s: number, e: number) => new vscode.Range(line, s, line, e);


const TABLES = '**/config/tables/*.def';
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
  for (const u of await vscode.workspace.findFiles(TABLES, SKIP)) uris.set(u.toString(), u);
  for (const d of vscode.workspace.textDocuments) if (d.languageId === LANG) uris.set(d.uri.toString(), d.uri);
  return Promise.all([...uris].map(async ([uri, u]) => ({ uri, doc: parse(await textOf(u), schema as unknown as Schema) })));
}

export function activate(ctx: vscode.ExtensionContext) {
  const diags = vscode.languages.createDiagnosticCollection(LANG);
  const isDef = (d: vscode.TextDocument) => d.languageId === LANG;

  const readFile = (p: string) => {
    const open = vscode.workspace.textDocuments.find(d => isDef(d) && d.uri.scheme === 'file' && d.uri.fsPath === p);
    if (open) return open.getText();
    try { return readFileSync(p, 'utf8'); } catch { return undefined; }
  };
  const run = (d: vscode.TextDocument) => {
    const file = d.uri.scheme === 'file';
    const res = check(parseDoc(d), file ? { filePath: d.uri.fsPath, readFile } : {});
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

  const sym = (n: OutlineNode): vscode.DocumentSymbol => {
    const a = n.row.args.find(a => a.column === n.row.spec?.label) ?? n.row.args[0];
    const s = new vscode.DocumentSymbol(n.label, n.row.macro,
      n.children.length ? vscode.SymbolKind.Namespace : vscode.SymbolKind.Constant,
      range(n.row.line, n.row.macroStart, n.row.end),
      a ? range(n.row.line, a.start, a.end) : range(n.row.line, n.row.macroStart, n.row.macroEnd));
    s.children = n.children.map(sym);
    return s;
  };

  ctx.subscriptions.push(
    diags,
    vscode.workspace.onDidOpenTextDocument(d => isDef(d) && runAll()),
    vscode.workspace.onDidChangeTextDocument(e => isDef(e.document) && runAll()),
    vscode.workspace.onDidCloseTextDocument(d => { if (isDef(d)) { diags.delete(d.uri); runAll(); } }),
    vscode.languages.registerHoverProvider(sel, {
      provideHover(d, pos) {
        const l = locate(parseDoc(d), pos.line, pos.character);
        return l && new vscode.Hover(new vscode.MarkdownString(describe(l)));
      },
    }),
    vscode.languages.registerDocumentSymbolProvider(sel, {
      provideDocumentSymbols: d => outline(parseDoc(d)).map(sym),
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
    // inside a table: ref column -> defining row
    vscode.languages.registerDefinitionProvider(sel, {
      async provideDefinition(d, pos) {
        const l = locate(parseDoc(d), pos.line, pos.character);
        const hits = l?.arg ? resolveRef(await tables(), l.row, l.arg) : [];
        return hits.length ? hits.map(toLoc) : undefined;
      },
    }),
    // table row name -> uses in C/C++ and in other tables
    vscode.languages.registerReferenceProvider(sel, {
      async provideReferences(d, pos) {
        const l = locate(parseDoc(d), pos.line, pos.character);
        if (!l?.arg || !l.row.mapped || l.column !== l.row.spec?.label) return;
        const out = refsToRow(await tables(), l.row).map(toLoc);
        for (const u of await vscode.workspace.findFiles(CODE, SKIP)) {
          for (const r of findUses(await textOf(u), l.arg.text)) out.push(new vscode.Location(u, range(r.line, r.start, r.end)));
        }
        return out;
      },
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
