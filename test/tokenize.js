// Tokenizes test/fixtures/*.def and reports problems. Usage (PowerShell):
//   $env:ELECTRON_RUN_AS_NODE=1; & "C:\Program Files\Microsoft VS Code\Code.exe" test\tokenize.js [-v] [file.def ...]
// -v prints the tokens of every row. Override the modules dir with VSCODE_MODULES
// (a folder holding vscode-textmate and vscode-oniguruma, e.g. .../resources/app/node_modules.asar).
const fs = require('fs'), path = require('path');
let mods = process.env.VSCODE_MODULES;
if (!mods) {
  const pf = path.join(process.env.ProgramFiles, 'Microsoft VS Code');
  const d = fs.readdirSync(pf).find(n => fs.existsSync(path.join(pf, n, 'resources/app/node_modules.asar')));
  mods = path.join(pf, d, 'resources/app/node_modules.asar');
}
const tm = require(path.join(mods, 'vscode-textmate')), onig = require(path.join(mods, 'vscode-oniguruma'));
const args = process.argv.slice(2), verbose = args.includes('-v');
const fx = path.join(__dirname, 'fixtures');
const list = args.filter(a => a !== '-v');
if (!list.length) fs.readdirSync(fx, { recursive: true }).filter(f => f.endsWith('.def')).forEach(f => list.push(path.join(fx, f)));
const wasm = fs.readFileSync(path.join(mods, 'vscode-oniguruma/release/onig.wasm')).buffer;
const reg = new tm.Registry({
  onigLib: onig.loadWASM(wasm).then(() => ({
    createOnigScanner: p => new onig.OnigScanner(p), createOnigString: s => new onig.OnigString(s) })),
  loadGrammar: async () => JSON.parse(fs.readFileSync(path.join(__dirname, '../syntaxes/xmacro-def.tmLanguage.json'), 'utf8')),
});
(async () => {
  const g = await reg.loadGrammar('source.xmacro-def');
  let bad = 0;
  const fail = (m) => { bad++; console.log('FAIL ' + m); };
  for (const f of list) {
    const name = path.basename(f);
    let st = tm.INITIAL, inBlock = false;
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
      const where = `${name}:${i + 1}`;
      const r = g.tokenizeLine(line, st);
      const wasBlock = inBlock;
      inBlock = r.tokens.length > 0 && r.ruleStack.toString().includes('comment.block');
      st = r.ruleStack;
      // the only state allowed to carry over a line end is a block comment
      if (!inBlock && st.depth > 1) fail(`${where} rule stack leaks: ${st}`);
      if (wasBlock) return;
      const has = (text, scope) => r.tokens.some(t => line.slice(t.startIndex, t.endIndex).trim() === text && t.scopes.some(s => s.startsWith(scope)));
      const m = /^\s*([A-Za-z_]\w*)\s*\(\s*(0[xX][0-9A-Fa-f]+|\d+)/.exec(line);
      if (m) {
        if (!has(m[1], 'entity.name.function')) fail(`${where} macro name not scoped`);
        if (!has(m[2], 'constant.numeric.id')) fail(`${where} id not scoped`);
        if (!/\)\s*(\/[/*].*)?$/.test(line)) fail(`${where} row does not end with ")"`);
        const close = r.tokens.filter(t => t.scopes.some(s => s.startsWith('punctuation.section.arguments.end')));
        if (close.length !== 1) fail(`${where} expected exactly one row-closing paren, got ${close.length}`);
        else if (close[0].endIndex !== line.replace(/\s*\/[/*].*$/, '').length && !/"[^"]*\/[/*]/.test(line))
          fail(`${where} row closes before end of line`);
      }
      if (verbose && m) {
        console.log(where);
        for (const t of r.tokens) console.log(`  ${JSON.stringify(line.slice(t.startIndex, t.endIndex))} ${t.scopes.slice(1).join(' ')}`);
      }
    });
  }
  console.log(bad ? `${bad} problem(s)` : 'OK');
  process.exit(bad ? 1 : 0);
})();
