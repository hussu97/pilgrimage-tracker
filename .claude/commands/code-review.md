---
allowed-tools: Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*), Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr list:*), Bash(git log:*), Bash(git blame:*), Bash(git diff:*), mcp__github_inline_comment__create_inline_comment
description: SoulStep code review — Claude-only agent graph
---

Perform a code review for the given pull request using the SoulStep Claude-only agent graph.

**This command is for Claude only. Do not invoke or defer to any external AI service, model, or agent outside of Claude (haiku / sonnet / opus). All review agents in this graph must be Claude agents.**

**Agent assumptions (applies to all agents and subagents):**
- All tools are functional and will work without error. Do not test tools or make exploratory calls.
- Only call a tool if it is required to complete the task. Every tool call should have a clear purpose.
- Never flag pre-existing issues. Only flag issues introduced in this PR.

---

## Graph

### Node 0 — Gate check (haiku)

Launch a haiku agent. Check all of the following:
- Is the pull request closed?
- Is the pull request a draft?
- Is the PR trivial or automated (e.g. a Dependabot bump with no logic changes)?
- Has Claude already reviewed this exact PR (check `gh pr view <PR> --comments` for comments by claude)?

If **any** condition is true, stop. Do not proceed past this node.

Note: Still review Claude-generated PRs.

---

### Node 1 — Context gather (haiku, parallel with Node 2)

Launch a haiku agent. Return:
1. A list of all relevant `CLAUDE.md` file paths (root + any in directories touched by the PR).
2. The PR title and description (from `gh pr view`).

---

### Node 2 — Change summary (sonnet, parallel with Node 1)

Launch a sonnet agent to read the PR diff (`gh pr diff`) and return a concise summary:
- What changed, which services/apps are affected.
- Whether the PR touches backend, web, mobile, admin, or multiple.

---

### Node 3 — Parallel specialist review (8 agents)

Wait for Nodes 1 and 2 to complete. Then launch all 8 agents in parallel. Each receives the PR title, description, change summary, and the list of CLAUDE.md paths.

**Each agent must only flag issues introduced in this PR, not pre-existing problems.**

#### Agent A — Backend rules (sonnet)
Check the diff for violations of these SoulStep backend rules:
- **Datetime columns**: Any new `datetime` field that does NOT use `sa_column=_TSTZ(...)` is a violation (CLAUDE.md rule 8). Flag the exact line.
- **Numeric IDs in API/DB**: Any new field, route param, or response body that uses a numeric ID instead of a `*_code` string is a violation (CLAUDE.md rule 9).
- **Missing Alembic migration**: If a model field is added/changed but no migration file is present in `migrations/versions/`, flag it.
- **Migration pattern**: New migration files should increment from the prior version; flag if they do not follow the pattern (e.g., copy prior migration number + 1).
- **Background task sessions**: Any background task that re-uses a request-scoped `Session` instead of opening a fresh `Session(engine)` is a violation (memory note).

#### Agent B — Test coverage (sonnet)
Check the diff for missing test coverage:
- Any new or modified backend route/service/utility in `soulstep-catalog-api/` or `soulstep-scraper-api/` that has no corresponding new/updated test in `tests/` is a violation (CLAUDE.md rule 12).
- Any new or modified frontend utility/hook/pure function in `apps/soulstep-customer-web/src/` or `apps/soulstep-customer-mobile/src/` that has no corresponding test in `src/__tests__/` is a violation (CLAUDE.md rule 13).
- Flag only missing tests for *new* logic, not pre-existing untested code.

#### Agent C — Frontend dark mode (sonnet)
Check the diff for dark mode violations (CLAUDE.md rule 14):
- **Web**: Any new Tailwind class using `dark:bg-gray-*` or `dark:text-gray-*` instead of `dark:bg-dark-*` / `dark:text-dark-*` / `dark:border-dark-border` design tokens.
- **Mobile**: Any new hardcoded hex color inline in a StyleSheet instead of referencing `tokens.colors.*`.
- Any new UI element in web or mobile that has no dark mode variant at all.

#### Agent D — Translation key parity (sonnet)
Check the diff for i18n violations (CLAUDE.md rules 7, 15):
- Any new hardcoded UI string in web (`apps/soulstep-customer-web/`) or mobile (`apps/soulstep-customer-mobile/`) instead of a `t('key')` call.
- Any translation key used in web but not mobile (or vice versa) for the same UI string.
- Any new key added to web/mobile that is not present in `soulstep-catalog-api/app/db/seed_data.json` under all 5 languages (`en`, `ar`, `hi`, `te`, `ml`).

#### Agent E — Web/Mobile feature parity (sonnet)
Check the diff for parity violations (CLAUDE.md rule 10):
- If a new screen/page/route is added in web but not in mobile (or vice versa), flag it.
- If a new API client method is added in web (`src/lib/api/`) but not in mobile (`src/lib/api/`), or vice versa, flag it.
- If navigation route names or params differ between web and mobile for the same screen, flag it.

#### Agent F — Place component canonicality (sonnet)
Check the diff for canonical component violations (CLAUDE.md rule 26):
- Any inline place card or place row JSX defined directly inside a page/screen file instead of using `PlaceCardUnified` (web) / `PlaceCard` (mobile) or `PlaceListRow`.
- Any new `variant` usage that is not `default`, `tile`, or `recommended`.

#### Agent G — Bugs and logic errors (opus)
Scan the diff for obvious bugs. Focus only on the diff:
- Clear logic errors that will produce wrong results for all inputs.
- Missing imports or unresolved references that will cause a runtime crash.
- Type errors or undefined variable references.
- Null/undefined dereferences on values that can be null.

Do NOT flag: style, quality, potential issues conditional on specific inputs, or anything a linter would catch.

#### Agent H — Security and data integrity (opus)
Scan the diff for security and data integrity issues:
- Hardcoded secrets, API keys, tokens, or credentials in source code.
- SQL injection via raw string concatenation in queries.
- Missing auth checks on new API routes (no `current_user` dependency).
- Insecure direct object reference: exposing numeric IDs that should be codes.
- XSS: unescaped user input rendered as HTML.

---

### Node 4 — Issue validation (parallel opus/sonnet per issue)

For every issue surfaced by Agents G and H in Node 3, launch a parallel validation subagent:
- Provide: PR title, description, change summary, and full issue description.
- Task: confirm the issue is real and not a false positive. Read the relevant diff section. For a "variable is not defined" issue, verify it's actually undefined. For a CLAUDE.md issue, verify the rule is scoped to this file and is genuinely violated.
- Use **opus** for bugs/security, **sonnet** for CLAUDE.md violations.

Issues from Agents A–F (rule-based) do not require a validation pass — they are either a clear rule match or not.

---

### Node 5 — Filter and deduplicate

Discard:
- Any issue from Agents G and H that was NOT validated in Node 4.
- Duplicate issues (same file + same problem reported by multiple agents).
- Pre-existing issues not introduced in this PR.
- Nitpicks a senior engineer would not flag.

---

### Node 6 — Output

Print a structured summary to the terminal:

```
## SoulStep Code Review

### Backend (Agent A + B)
<issues or "No issues found">

### Frontend — Dark mode (Agent C)
<issues or "No issues found">

### Frontend — i18n (Agent D)
<issues or "No issues found">

### Frontend — Parity (Agent E)
<issues or "No issues found">

### Frontend — Components (Agent F)
<issues or "No issues found">

### Bugs (Agent G, validated)
<issues or "No issues found">

### Security (Agent H, validated)
<issues or "No issues found">
```

If `--comment` argument is NOT provided, stop here.

If `--comment` IS provided and NO issues were found, post a single `gh pr comment`:

---

## Code review

No issues found. Checked: backend rules, test coverage, dark mode, i18n parity, web/mobile parity, canonical components, bugs, security.

---

If `--comment` IS provided and issues were found, proceed to Node 7.

---

### Node 7 — Inline comments (only with `--comment`)

Post inline comments using `mcp__github_inline_comment__create_inline_comment`. For each issue:
- One comment per unique issue. No duplicates.
- Brief description + cite the exact CLAUDE.md rule (with link) or the specific bug.
- For small self-contained fixes (≤5 lines, single location), include a committable suggestion block.
- For larger fixes, describe the issue and fix without a suggestion block.
- Link format: `https://github.com/hussu97/soulstep/blob/<full-sha>/path/file.ext#L<start>-L<end>` (full SHA required).

---

**False positive list — do NOT flag any of these:**
- Pre-existing issues not in the diff.
- Code that looks like a bug but is actually correct given context.
- Issues a linter will catch automatically.
- General code quality or style suggestions.
- CLAUDE.md rules that are explicitly silenced with a lint-ignore comment.
- Test coverage for pre-existing untested code (only flag new logic with no test).
