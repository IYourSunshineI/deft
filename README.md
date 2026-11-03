# Deft

Deft is language support for X-macro `.def` table files: one macro call per line, such as
`LOG_DEF(0x0101, INFO, NONE, BootDone, "Boot done")` or `CONFIG_U32(1, Timeout, 2, 30, 1, 600, "Timeout")`.

## Which files

Files matching `**/config/tables/*.def` get the language `xmacro-def` automatically
(Windows module-definition `.def` files elsewhere are left alone). To use it for other paths:

```json
"files.associations": { "*.def": "xmacro-def" }
```

## Features

- **Syntax highlighting** for macro names, numbers, strings, `{0}` format placeholders, directives and comments.
- **Semantic highlighting** by column role, taken from the schema: defining ids (`number`, declaration), defined names (`variable`, declaration, readonly), references to other rows (`type`), fixed-choice values (`enumMember`), format strings with their `{n}` placeholders (`string` / `parameter`). Standard token types only, so every theme colours them; columns without a clear role keep the grammar's colours.
- **Format Document / Format Selection** aligns the columns of rows. A one-line header comment above a block (`/*  id   name   label */`) is the grid: each argument starts under the word of its column name, so rows with different layouts share one grid and the macro name is padded so `(` sits just before the first column. Without such a header, consecutive rows are aligned among themselves. Only whitespace changes; rows with errors, comments and directives are left alone; trailing comments line up.
- **Diagnostics** while you type: wrong argument count, wrong types or ranges, unterminated strings,
  duplicate ids and names, references to undefined groups, bad format placeholders, unreadable `#include` files.
  Lines that are not a row, directive or comment are reported as warnings.
- **Hover** on an argument shows its column; on a macro name shows its columns; on a `{n}` placeholder shows the argument index.
- **Outline / breadcrumbs / Go to Symbol**: groups with their rows nested below.
- **Go to Definition / Find References between C/C++ and tables**: in a `c`/`cpp` file, Go to Definition on a name that a table row defines (its label column, e.g. the event name) jumps to that row. A prefixed use such as `PREFIX_Name` matches too (longest `_`-suffix that is a table name); names not in any table are left to other providers. In a table, Find References on a row name lists its whole-word (optionally prefixed) uses in `*.c, *.cc, *.cpp, *.cxx, *.h, *.hh, *.hpp, *.hxx` (excluding `node_modules`, `build`, `out`) plus rows in other tables that reference it; Go to Definition on a reference column (e.g. a group id) jumps to the defining row. Tables are the `**/config/tables/*.def` files of the workspace; C/C++ is scanned only on request.
- **Version-bump reminder**: if a table has a `#define ..._VERSION N` and its rows (macro and arguments; whitespace and comments ignored, so formatting never triggers it) differ from the committed version (git HEAD) while N is unchanged, the define gets a warning. Uses the `git` executable; untracked files or no git mean no warning. HEAD is re-read on open, save and window focus.
- **`#include "file.def"`** paths are clickable; included tables are used to resolve references.

## Expected format

```
// line comment, /* block comment */
#include "other.def"
#define NAME value
MACRO_NAME(arg1, arg2, "string, with commas", (tuple, of, values))
```

Each row is a single line. The known macros and their columns are defined in `schema.json`
inside the extension; unknown macros are highlighted but not checked.
