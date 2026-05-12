# knowledge/

Drop your reference documents here as `.md` files.

The agent reads every `.md` file in this directory at session startup and uses
them to answer questions, follow your conventions, and stay in context.

---

## What to put here

| File | Purpose |
|---|---|
| `about-me.md` | Your background, role, projects — so the agent knows who you are |
| `coding-standards.md` | Your preferred patterns, naming conventions, stack choices |
| `project-context.md` | Current project goals, architecture, key decisions |
| `style-guide.md` | Writing tone, formatting preferences for reports/docs |
| `db-connections.md` | Connection strings and credentials (keep this gitignored!) |

---

## Example: `about-me.md`

```markdown
# About Me

- Name: Jane Smith
- Role: Senior Backend Engineer
- Stack: Python, FastAPI, PostgreSQL, Docker
- Current project: Migrating monolith to microservices
- Prefers: Short responses, code over explanations, tests alongside code
```

---

## Tips

- Keep files focused — one topic per file works better than one giant file.
- The agent will reference these by filename when citing sources.
- Sensitive files (API keys, passwords) should be in `.gitignore`.
