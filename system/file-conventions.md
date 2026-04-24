# File Conventions

## Folder Roles

- `system/`: durable repo rules and maps
- `projects/console-overlay/`: stable project truth for the active product slice
- `projects/console-overlay/daily/`: dated work logs
- `docs/`: deeper design and implementation documents
- `server/`: backend authority implementation
- `web/`: browser shell implementation

## Naming Rules

- Use lowercase kebab-case for durable Markdown files.
- Use `YYYY-MM-DD.md` for daily notes.
- Keep one concern per file; prefer references over duplicate summaries.

## Documentation Split

- `project.md`: objective, scope, status, next gates
- `context.md`: current technical and product context
- `decisions.md`: durable decisions with rationale
- `daily/*.md`: day-scoped execution log
