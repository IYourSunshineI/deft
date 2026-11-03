# X-Macro Tables

Language support for X-macro `.def` table files: one macro call per line, such as
`LOG_DEF(0x0101, INFO, NONE, BootDone, "Boot done")` or `CONFIG_U32(1, Timeout, 2, 30, 1, 600, "Timeout")`.

## Which files

Files matching `**/config/tables/*.def` get the language `xmacro-def` automatically
(Windows module-definition `.def` files elsewhere are left alone). To use it for other paths:

```json
"files.associations": { "*.def": "xmacro-def" }
```

## Features

- **Syntax highlighting** for macro names, numbers, strings, `{0}` format placeholders, directives and comments.
- **Diagnostics** while you type: wrong argument count, wrong types or ranges, unterminated strings,
  duplicate ids and names, references to undefined groups, bad format placeholders, unreadable `#include` files.
  Lines that are not a row, directive or comment are reported as warnings.
- **Hover** on an argument shows its column; on a macro name shows its columns; on a `{n}` placeholder shows the argument index.
- **Outline / breadcrumbs / Go to Symbol**: groups with their rows nested below.
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
