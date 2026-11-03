import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from './parser.ts';
import type { Schema } from './parser.ts';
import { check } from './checks.ts';
import { describe, locate, outline } from './navigate.ts';
import type { OutlineNode } from './navigate.ts';
import schema from './schema.json';

const LANG = 'xmacro-def';
const sel: vscode.DocumentSelector = { language: LANG };
const parseDoc = (d: vscode.TextDocument) => parse(d.getText(), schema as unknown as Schema);
const range = (line: number, s: number, e: number) => new vscode.Range(line, s, line, e);

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
