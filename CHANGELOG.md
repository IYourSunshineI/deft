# Changelog

## 0.1.0

- Version-bump reminder: warning on the `#define ..._VERSION` line when rows changed since git HEAD but the version value did not.
- Semantic highlighting by schema column role (definitions, references, fixed values, format placeholders).
- Format Document / Format Selection: aligns row columns to the header comment above the block, or among consecutive rows.
- Go to Definition from C/C++ to table rows (exact or `PREFIX_`-prefixed names), Find References from a row to C/C++ uses and referencing rows, Go to Definition for reference columns inside tables.
- Syntax highlighting, diagnostics, hover, document outline and `#include` links for X-macro `.def` tables.
