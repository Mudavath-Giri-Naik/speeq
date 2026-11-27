# @speeq/integrate

The engine behind `speeq init`: builds a plan, applies it, verifies it and rolls it back. It is the only
speeq package that writes files in your project, and it writes only files it owns (first-line marker plus
content hash). See ADR-0016.
