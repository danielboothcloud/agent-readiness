import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ALL_PILLARS } from "../pillars/index.js";
import {
  type Config,
  type HarnessId,
  LEVEL_THRESHOLD,
} from "../types/index.js";
import { DEFAULT_BASE_URL } from "./llm-client.js";

export const DEFAULT_CONFIG_FILENAME = ".agent-profile.yml";

const CONFIG_FILENAMES = [DEFAULT_CONFIG_FILENAME, ".agent-profile.yaml"];

/**
 * Loads an Agent Profile configuration file from the given repository path.
 *
 * Searches for `.agent-profile.yml` or `.agent-profile.yaml`. If no config file
 * exists, returns an empty object so callers can safely fall back to defaults.
 * Parse errors are logged as warnings and also result in an empty object.
 */
export async function loadConfig(repoPath: string): Promise<Config> {
  for (const filename of CONFIG_FILENAMES) {
    const filePath = path.join(repoPath, filename);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = YAML.parse(content) as Config | null;
      return parsed ?? {};
    } catch (err: unknown) {
      // If the file simply does not exist, try the next candidate.
      if (isNodeError(err) && err.code === "ENOENT") {
        continue;
      }

      // Any other error (permissions, YAML syntax, etc.) — warn and bail.
      console.warn(
        `Warning: failed to parse config file "${filePath}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {};
    }
  }

  // No config file found — perfectly fine.
  return {};
}

export interface InitOptions {
  /** Folders every check runs in (repo-relative; `.` is the root). */
  locations?: string[];
  /** Harnesses to tailor advice to, as detected for this repo. */
  harnesses?: HarnessId[];
}

/** A YAML flow-list item; quoted only when YAML would misread it. */
function yamlItem(value: string): string {
  return /^[A-Za-z0-9_./@-][A-Za-z0-9_./@*-]*$/.test(value)
    ? value
    : JSON.stringify(value);
}

function flowList(values: string[]): string {
  return `[${values.map(yamlItem).join(", ")}]`;
}

function section(title: string, ...comment: string[]): string {
  const bar = "─".repeat(Math.max(4, 60 - title.length));
  return [`# ── ${title} ${bar}`, ...comment.map((c) => `# ${c}`)].join("\n");
}

/**
 * The `.agent-profile.yml` written by `--init`: every setting spelled out with
 * the value the scanner is actually using, nothing commented out, so users can
 * see and edit the running configuration. Pillars, criteria and paths are
 * generated from the registered checks so the template never goes stale.
 */
export function generateDefaultConfig(options: InitOptions = {}): string {
  const locations = options.locations?.length ? options.locations : ["."];
  const harnesses = options.harnesses?.length ? options.harnesses : ["pi"];
  const out: string[] = [];

  out.push(
    "# Agent Profile configuration (.agent-profile.yml)",
    "# Every value below is what agent-readiness is using for this repo right now.",
    "# Edit anything to change how it scans; delete a setting to fall back to the",
    "# built-in default. Regenerate with `agent-readiness --init` (after removing",
    "# this file) to pick up new checks or newly added sub-projects.",
    "",
    section("Pillars", "Turn whole areas on (true) or off (false)."),
    "pillars:",
    ...ALL_PILLARS.map((p) => `  ${p.id}: true`),
    "",
    section("Criteria", "Turn individual checks on (true) or off (false)."),
    "criteria:",
  );
  for (const p of ALL_PILLARS) {
    out.push(`  # ${p.name}`);
    for (const c of p.criteria) out.push(`  ${c.id}: true`);
  }

  out.push(
    "",
    section(
      "Paths",
      "Where each check looks. `.` is the repo root; other entries are folders",
      "(repo-relative, globs allowed, e.g. services/*) or files.",
      "- A folder: the check runs inside it and passes if it passes in any folder.",
      "- A file: counts as evidence the check is met (for setups it can't recognise).",
      "This list is exactly where the check looks, so keep `.` if the root counts.",
      locations.length > 1
        ? "Pre-filled with the repo root and the sub-projects found by --init."
        : "Pre-filled with the repo root; add folders where your setup lives.",
    ),
    "paths:",
  );
  for (const p of ALL_PILLARS) {
    out.push(`  # ${p.name}`);
    for (const c of p.criteria) out.push(`  ${c.id}: ${flowList(locations)}`);
  }

  out.push(
    "",
    section(
      "Harnesses",
      "Coding-agent harnesses to tailor advice to: pi, claude, codex, cursor, gemini.",
      "Changes only the how-to text, never the score. Detected from committed files.",
    ),
    `harnesses: ${flowList(harnesses)}`,
    "",
    section(
      "Workspaces",
      "Folders scanned as extra roots for EVERY check, with their own languages and",
      "notes. Entries are a path, or { name, path, description, languages, knowledge }.",
      "Use `paths` above to point single checks somewhere specific.",
    ),
    "workspaces: []",
    "",
    section(
      "Project knowledge",
      "Static business or architecture notes that travel with the report.",
    ),
    "knowledge: []",
    "",
    section(
      "Thresholds",
      "Share of a level's checks that must pass to reach that level (0 to 1).",
    ),
    "thresholds:",
    `  level-pass: ${LEVEL_THRESHOLD}`,
    "",
    section(
      "AI checks",
      "Enables the LLM-powered checks (or pass --ai). The API key is read from",
      "--api-key, AGENT_READINESS_API_KEY or OPENAI_API_KEY; keep keys out of this file.",
    ),
    "aiEnabled: false",
    `apiBaseUrl: ${DEFAULT_BASE_URL}`,
    "",
  );
  return out.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
