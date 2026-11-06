import { fileExists } from "../pillars/utils.js";
import {
  HARNESS_IDS,
  type HarnessId,
  type HarnessSource,
} from "../types/index.js";

/**
 * Committed files that show a repo targets a given harness. AGENTS.md is
 * cross-harness and deliberately not a signal.
 */
const HARNESS_SIGNALS: Record<HarnessId, string[]> = {
  pi: [
    ".pi/**",
    "pi-warden.md",
    ".pi-lens.json",
    "rules/ast-grep-rules/**",
    "rules/tree-sitter-queries/**",
  ],
  claude: ["CLAUDE.md", ".claude/**", ".mcp.json"],
  codex: [".codex/**"],
  cursor: [".cursorrules", ".cursor/**"],
  gemini: ["GEMINI.md", ".gemini/**"],
};

/** pi is the primary harness this fork is built around. */
export const DEFAULT_HARNESSES: HarnessId[] = ["pi"];

export interface HarnessProfile {
  harnesses: HarnessId[];
  harnessSource: HarnessSource;
}

/**
 * Decide which harnesses to tailor advice to: explicit `harnesses:` config wins,
 * then committed harness files, then the pi default. pi is always listed first
 * when present so its advice leads.
 */
export async function detectHarnesses(
  repoPath: string,
  configured?: unknown,
): Promise<HarnessProfile> {
  const fromConfig = normalize(configured);
  if (fromConfig.length > 0) {
    return { harnesses: fromConfig, harnessSource: "config" };
  }

  const detected: HarnessId[] = [];
  for (const id of HARNESS_IDS) {
    if (await fileExists(repoPath, ...HARNESS_SIGNALS[id])) detected.push(id);
  }
  if (detected.length > 0) {
    return { harnesses: detected, harnessSource: "detected" };
  }
  return { harnesses: [...DEFAULT_HARNESSES], harnessSource: "default" };
}

function normalize(value: unknown): HarnessId[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const ids = list
    .map((v) => String(v).toLowerCase().trim())
    .map((v) => (v === "claude-code" ? "claude" : v))
    .filter((v): v is HarnessId => (HARNESS_IDS as string[]).includes(v));
  // Keep canonical order (pi first), de-duplicated.
  return HARNESS_IDS.filter((id) => ids.includes(id));
}
