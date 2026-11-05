# agent-readiness

`@danielboothcloud/agent-readiness` — CLI that grades a repository's readiness for autonomous AI coding agents: 9 pillars / 44 checks across 10+ languages, maturity levels 1–5, optional LLM-powered checks, terminal report + web dashboard. Fork of `kodustech/agent-readiness` (adds the Architecture & Methodology and Agent Context & Capabilities pillars). Published to npm; this fork uses pnpm, not bun.

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

Pipeline orchestrated in `src/cli/index.ts main()`: `detectProject` → `AnalysisEngine.run()` → `scorer` (pillar scores + maturity level; `LEVEL_THRESHOLD` = 80% of criteria at a level must pass) → `recommender` → render term / serialize JSON.

- `src/pillars/` — the product's domain. 9 pillar modules (`style-linting`, `testing`, `documentation`, `dev-environment`, `ci-cd`, `code-health`, `security`, `architecture`, `context`), each a `Pillar` containing self-contained criteria: `check(repoPath, projectInfo, llmClient?) → CriterionResult` doing globs/file-content checks against the *scanned target repo*. Pillars are registered in `ALL_PILLARS` (`src/pillars/index.ts`); shared helpers in `src/pillars/utils.ts`.
- `src/engine/` — `detector.ts` (language/monorepo detection via a `TypeIndicator` table), `analyzer.ts`, `scorer.ts`, `recommender.ts`, `config.ts` (loads/generates `.agent-profile.yml` in the scanned repo), `serializer.ts` (defines `SerializedReportData` — the CLI/web data contract), `llm-client.ts` (plain `fetch` to an OpenAI-compatible endpoint, no SDK; used only by the 4 `requiresLLM` criteria, skipped without `--ai`).
- `src/renderer/` — terminal report. `src/server/` — minimal http server that serves the prebuilt SPA from `dist/web`, injecting report JSON as `window.__KODUS_REPORT_DATA__`.
- `web/` — dashboard SPA reading `window.__KODUS_REPORT_DATA__` (falls back to MOCK_DATA under Vite dev). It deliberately duplicates the CLI's type shapes in `web/src/types.ts` (types aren't shared across packages) — update both sides together with `src/types/index.ts` and `engine/serializer.ts`.

## Conventions

- Conventional commits: `feat:`, `fix:`, sometimes scoped (`feat(dev-environment): …`). Version bumps + git tags are manual; publishing goes through `mise run publish`.
- Adding a criterion: implement `check` in the relevant `src/pillars/*.ts` (use `fileExists`/`readFileContent` from `pillars/utils.ts`), register it in that pillar's `criteria` array, add a fixture test, and update the README's criteria table.
- Adding a language: extend `TYPE_INDICATORS` in `src/engine/detector.ts`, then add language-specific cases to the relevant checks across pillars.
- Feature work is PRD-driven: `prd.json` tracks the active feature's user stories + acceptance criteria (e.g. the in-flight Kotlin support on branch `ralph/kotlin-support`); `tasks/prd-agent-readiness.md` is the original product spec.

## Testing

- Vitest discovers `tests/**/*.test.ts` (one file per pillar in `tests/pillars/`, plus `tests/engine/`; the `documentation` pillar has no test file).
- Criterion tests are fixture-based: `tests/helpers.ts` builds throwaway "repos" in os.tmpdir (`createTestDir`, `writeFixtures`, `mockProjectInfo`, `getCheck`), cleaned in `afterEach`. Follow this pattern — never scan or mutate this repo in tests.
- Suite is fast (~seconds, 136 tests at time of writing).

## Gotchas

- **Use pnpm, not bun.** The README's Contributing section was inherited from upstream and still shows `bun install` / `bun run dev` — outdated for this fork.
- **`pnpm run lint` currently fails** with ~58 pre-existing errors (no biome.json, so Biome runs on defaults): non-null assertions, organize-imports, unused vars, and more. Two rules: don't add new violations, and **don't run blanket `biome check --write` / `format --write`** — default Biome formatting re-indents with TABS while the repo uses 2 spaces, so it would rewrite every file.
- Root `typecheck` and `lint` do **not** cover `web/` — the web dashboard is only typechecked by `pnpm run build:web` (`tsc -b && vite build`).
- The web dashboard is ON by default: `pnpm run dev`/`node dist/index.js` without `--no-web` starts an http server, opens a browser, and **blocks until Ctrl+C**. For automation use `--no-web`; for non-interactive gates use `--ci` (+ `--min-level n`) — also triggered automatically when `CI=true`.
- `--web` requires a prior `pnpm run build:web` (`dist/web` must exist; the runtime error will tell you).
- `web/tsconfig.tsbuildinfo` is committed to git — running `build:web` dirties it; keep it out of unrelated commits.
- AI checks need `AGENT_READINESS_API_KEY` (or `OPENAI_API_KEY`, or `--api-key`); without a key they are *skipped*, not failed, so scores stay stable offline.
- README feature claims lag the code (says 39 checks / 7 pillars; code has 44 / 9). Trust `src/pillars/` + `tests/` over README counts.
