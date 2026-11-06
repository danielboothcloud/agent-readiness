# agent-readiness

`@danielboothcloud/agent-readiness` — CLI that grades a repository's readiness for autonomous AI coding agents: 9 pillars / 45 checks across 10+ languages, maturity levels 1–5, optional LLM-powered checks, terminal report + web dashboard. Fork of `kodustech/agent-readiness` (adds the Architecture & Methodology and Agent Context & Capabilities pillars). Published to npm; this fork uses pnpm, not bun.

## Commands

Run from repo root. pnpm >= 11, Node >= 20 (mise pins Node 22; `mise.toml` provides `publish` task).

```bash
pnpm install --frozen-lockfile              # install CLI deps
pnpm test                                    # vitest run (all tests)
pnpm test tests/engine/detector.test.ts      # single file (args pass through)
pnpm run typecheck                           # tsc --noEmit — covers src/ + tests/ only, NOT web/
pnpm run lint                                # biome check src/ tests/ — currently fails, see Gotchas
pnpm run dev --no-web                        # run CLI from source via tsx (flags pass straight through — do NOT use `--`, it breaks commander; browser+server hang by default without --no-web)
pnpm run build                               # tsup → dist/index.js (ESM, node20, no .d.ts)
pnpm run build:web                           # install web deps + tsc -b && vite build → dist/web
pnpm run build:all                           # both; the publishable build
pnpm run dev:web                             # Vite dev server for the dashboard
mise run publish                              # frozen install → test → typecheck → build:all → pnpm publish
```

## Stack

- TypeScript strict, ESM-only (`"type": "module"`); imports use explicit `.js` extensions even in TS source.
- pnpm workspace: root CLI package + `web/` dashboard. `files: ["dist"]` — the npm tarball ships the CLI bundle *and* the built dashboard (hence web's Vite output goes to `../dist/web`).
- CLI deps: commander, chalk, boxen, cli-table3, fast-glob, yaml. Bundled with tsup.
- `web/`: React 19, recharts, Tailwind 3, Vite 6 (its own dep tree; no eslint/prettier/biome config anywhere).
- Tests: Vitest with default discovery (no vitest.config). Lint: Biome running on **defaults** (no biome.json).

## Architecture

Pipeline orchestrated in `src/cli/index.ts main()`: `detectProject` (incl. harness detection) → `AnalysisEngine.run()` → `scorer` (pillar scores + maturity level; `LEVEL_THRESHOLD` = 80% of criteria at a level must pass) → `recommender` → `considerations` → render term / checklist / serialize JSON.

- `src/pillars/` — the product's domain. 9 pillar modules (`style-linting`, `testing`, `documentation`, `dev-environment`, `ci-cd`, `code-health`, `security`, `architecture`, `context`), each a `Pillar` containing self-contained criteria: `check(repoPath, projectInfo, llmClient?) → CriterionResult` doing globs/file-content checks against the *scanned target repo*. Pillars are registered in `ALL_PILLARS` (`src/pillars/index.ts`); shared helpers in `src/pillars/utils.ts`.
- `src/engine/` — `detector.ts` (language/monorepo detection via a `TypeIndicator` table), `harness.ts` (which agent harnesses the repo targets — pi/claude/codex/cursor/gemini — from committed files or `harnesses:` config, defaulting to pi; tailors advice only, never scoring), `recommender.ts` (`CRITERION_INFO`: description/reason/effort + per-harness how-to, keyed by real criterion IDs; returns ALL failing recs, views show top 10), `considerations.ts` (unscored, evidence-quoting suggestions: custom pi packages, pi-warden/pi-lens follow-ups, stack-specific workflows), `discovery.ts` (self-check questions + where-to-look sources per harness for the checklist's closing section), `guidance.ts` (`PILLAR_GUIDANCE`: why each pillar matters + open questions, keyed by pillar ID), `analyzer.ts`, `scorer.ts`, `config.ts` (loads `.agent-profile.yml`; `--init` generates it from `ALL_PILLARS` with every setting at its in-use value — nothing commented out — and `paths:` pre-filled with `.` + `discoverSubprojects()` from `detector.ts`), `paths.ts` (validates/resolves `paths:`: per criterion, the exact list of locations — default `[.]`; dir → check runs there with that dir's languages, file → evidence; then `workspaces`), `serializer.ts` (defines `SerializedReportData` — the CLI/web data contract), `llm-client.ts` (plain `fetch` to an OpenAI-compatible endpoint, no SDK; used only by the 4 `requiresLLM` criteria, skipped without `--ai`).
- `src/renderer/` — terminal report and `checklist.ts` (the committed living checklist: full guidance for every pillar and criterion whatever its status; no machine-specific paths). `src/server/` — minimal http server that serves the prebuilt SPA from `dist/web`, injecting report JSON as `window.__KODUS_REPORT_DATA__`.
- `web/` — dashboard SPA reading `window.__KODUS_REPORT_DATA__` (falls back to MOCK_DATA under Vite dev). It deliberately duplicates the CLI's type shapes in `web/src/types.ts` (types aren't shared across packages) — update both sides together with `src/types/index.ts` and `engine/serializer.ts`.

## Conventions

- Conventional commits: `feat:`, `fix:`, sometimes scoped (`feat(dev-environment): …`). Version bumps + git tags are manual; publishing goes through `mise run publish`.
- Adding a criterion: implement `check` in the relevant `src/pillars/*.ts` (use `fileExists`/`readFileContent` from `pillars/utils.ts`; `findRepoFiles` for repo-wide `**` globs so node_modules is skipped), register it in that pillar's `criteria` array, add a `CRITERION_INFO` entry in `engine/recommender.ts` under the exact same ID (a test fails otherwise; every criterion needs `explore` questions (tested) and agent-facing ones `harness` example advice, pi first — the checklist should lead users to what fits their repo, with named tools as examples, not a verbatim to-do), add a fixture test, and update the README's criteria table (the `--init` template is generated from `ALL_PILLARS`, so it picks new criteria up automatically).
- pi is the primary harness: pi advice should name the concrete tool (pi-lens, pi-warden, `pi install -l`, `.pi/prompts`, `.agents/skills`, `.pi/extensions`), with Claude Code/Codex/Cursor/Gemini equivalents alongside. Only committed, repo-scoped files count — user-level installs (`~/.pi/agent`, `~/.claude`) never pass a check.
- Adding a language: extend `TYPE_INDICATORS` in `src/engine/detector.ts`, then add language-specific cases to the relevant checks across pillars.
- Feature work is PRD-driven: `prd.json` tracks the active feature's user stories + acceptance criteria (e.g. the in-flight Kotlin support on branch `ralph/kotlin-support`); `tasks/prd-agent-readiness.md` is the original product spec.

## Testing

- Vitest discovers `tests/**/*.test.ts` (one file per pillar in `tests/pillars/`, plus `tests/engine/` and `tests/renderer/`; the `documentation` pillar has no test file).
- Criterion tests are fixture-based: `tests/helpers.ts` builds throwaway "repos" in os.tmpdir (`createTestDir`, `writeFixtures`, `mockProjectInfo`, `getCheck`), cleaned in `afterEach`. Follow this pattern — never scan or mutate this repo in tests.
- Suite is fast (~seconds, ~215 tests at time of writing).

## Gotchas

- **Use pnpm, not bun.** The README's Contributing section was inherited from upstream and still shows `bun install` / `bun run dev` — outdated for this fork.
- **`pnpm run lint` currently fails** with ~58 pre-existing errors (no biome.json, so Biome runs on defaults): non-null assertions, organize-imports, unused vars, and more. Two rules: don't add new violations, and **don't run blanket `biome check --write` / `format --write`** — default Biome formatting re-indents with TABS while the repo uses 2 spaces, so it would rewrite every file.
- Root `typecheck` and `lint` do **not** cover `web/` — the web dashboard is only typechecked by `pnpm run build:web` (`tsc -b && vite build`).
- The web dashboard is ON by default: `pnpm run dev`/`node dist/index.js` without `--no-web` starts an http server, opens a browser, and **blocks until Ctrl+C**. For automation use `--no-web`; for non-interactive gates use `--ci` (+ `--min-level n`) — also triggered automatically when `CI=true`.
- `--web` requires a prior `pnpm run build:web` (`dist/web` must exist; the runtime error will tell you).
- `web/tsconfig.tsbuildinfo` is committed to git — running `build:web` dirties it; keep it out of unrelated commits.
- AI checks need `AGENT_READINESS_API_KEY` (or `OPENAI_API_KEY`, or `--api-key`); without a key they are *skipped*, not failed, so scores stay stable offline.
- README feature claims partly lag the code (intro still says 39 checks / 7 pillars; code has 45 / 9). Trust `src/pillars/` + `tests/` over README counts.
