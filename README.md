# def-tables

Syntax highlighting for X-macro `.def` tables (`LOG_DEF(...)`, `CONFIG_U32(...)`, ...).
Applies to `**/config/tables/*.def` only, so Windows module-definition files are left
alone. Other locations: `"files.associations": { "*.def": "xmacro-def" }`.

Declarative only (TextMate grammar), no code. Check the grammar against the fixtures in
`test/fixtures` with `test/tokenize.js` (see its header).
