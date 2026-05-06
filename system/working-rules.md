# Working Rules

## Documentation Rules

- Daily notes are working logs, not long-term truth.
- Durable repo facts belong in `projects/console-overlay/project.md`, `context.md`, or `decisions.md`.
- Keep backend authority, browser authority, and external service assumptions clearly separated.
- Treat `output/` and ad hoc logs as evidence only when dated and explicitly referenced.

## Change Rules

- Do not move or rename runtime paths without explicit migration work.
- Update the stable project files when product scope, authority boundaries, or major gaps change.
- Keep implementation notes concise and evidence-based.

## Fail-Closed Rule

If a state is only inferred from logs, partial mock UI, or local smoke output, label it as derived, advisory, or not yet verified.
