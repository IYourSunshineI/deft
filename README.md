# Deft

Deft is language support for X-macro `.def` table files: one macro call per line, such as
`EVENT(0x0101, BootDone, "Boot done")` or `CHANNEL(MOD_A, Screen, 4)`. It works for any macro names and
any columns.

## Which files

Files with the extension `.def` get the language `xmacro-def`. Lines that are not a row are plain
text to Deft, so other `.def` files (for example Windows linker module definitions) just show no
highlighting and no diagnostics.

## The table format

```
// line comment, /* block comment */
#include "other.def"
/*  id      name    label */
MACRO_NAME(0x0101, Boot, "string, with commas", (tuple, of, values))
```

- A **row** is a line `MACRO_NAME(arg, arg, ...)`: an identifier at the start of the line followed by `(`.
  Arguments are split at top-level commas; strings and nested parentheses are respected. A row is a single line.
- The **id** of a row is its first argument. Numbers compare numerically (`0x10` equals `16`), anything else by text.
- The **name** of a row is the argument under a header word `name` (see below) if that is an identifier, else the first argument after the id that is a plain identifier, if there is one.
- A **header** is a one-line comment whose words are all identifiers (`/*  id  name  label */`) above a block of rows. It names the columns by position; prose comments are never headers.
- Everything else (comments, directives, blank lines, any other text) is ignored and never reported.

## Features

- **Syntax highlighting** for macro names, ids, numbers, strings, `{0}` placeholders, directives and comments.
- **Colors from settings**: `deft.colors.*` (below) recolor macro names, ids, names, numbers, strings and placeholders without a theme change.
- **Diagnostics** while you type, per macro, within the file and one `#include` level deep:
  duplicate ids (error, for rows whose first argument is a number) and duplicate names (warning; for rows whose first argument is not a number, such as `OPTION(LEVEL, 0, DEBUG)`, that argument is an owner and names are unique per owner), unterminated strings and rows (error),
  rows with an argument count that differs from the usual one of their macro (warning), unreadable `#include` files (warning).
- **Hover** on an argument shows its position and, if the header comment has a word there, its column name; on a macro name it shows the header and the argument count.
- **Outline / breadcrumbs / Go to Symbol**: a flat list of rows, labelled by name (or id), with the macro as detail.
- **Format Document / Format Selection** aligns the columns of rows. A row with as many arguments as the header above it has words is placed under the header words, with `(` just before the first. A row with fewer arguments stays on the grid if each argument already sits under a header word (blank columns are allowed). Any other row is aligned with its consecutive neighbours. Only whitespace changes; rows with syntax errors, comments and directives are left alone; trailing comments line up.
- **Go to Definition / Find References between C/C++ and tables**: in a `c`/`cpp` file, Go to Definition on a name that a row defines jumps to that row. A prefixed use such as `PREFIX_Name` matches too (longest `_`-suffix that is a table name); other names are left to other providers. In a table, Find References on a row name lists its whole-word (optionally prefixed) uses in `*.c, *.cc, *.cpp, *.cxx, *.h, *.hh, *.hpp, *.hxx` (excluding `node_modules`, `build`, `out`). Tables are all `**/*.def` files of the workspace; C/C++ is scanned only on request.
- **`#include "file.def"`** paths are clickable.

## Settings

Under Settings, Extensions, Deft. Each takes a color like `#E06C75`; empty (the default) uses the theme.

| Setting | Colors |
| --- | --- |
| `deft.colors.macro` | macro name |
| `deft.colors.id` | id, the first argument |
| `deft.colors.name` | name, the first identifier after the id |
| `deft.colors.number` | other numbers, also inside tuples |
| `deft.colors.string` | strings |
| `deft.colors.placeholder` | `{n}` placeholders inside strings |
