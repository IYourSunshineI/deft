# Changelog

## 0.1.0

- Works for any X-macro table: a row is any line `MACRO(arg, arg, ...)`; everything else is ignored. Other `.def` files (linker module definitions) get no diagnostics.
- Syntax highlighting, with colors for macro, id, name, number, string and placeholder configurable in `deft.colors.*`.
- Diagnostics per macro, also against one `#include` level: duplicate ids (error, numeric first argument) and names (warning, per owner when the first argument is not a number), unterminated strings and rows, inconsistent argument counts, unreadable includes.
- Hover with the argument position and the column name from a header comment (`/* id name label */`), flat outline of rows, `#include` links.
- Format Document / Format Selection: aligns row columns to the header comment above the block (also rows with blank columns), or among consecutive rows.
- Go to Definition from C/C++ to table rows (exact or `PREFIX_`-prefixed names) and Find References from a row name to C/C++ uses.
- Table names are colored in every non-table file (`deft.colors.use`, empty turns it off) and Go to Definition works in any file type.
