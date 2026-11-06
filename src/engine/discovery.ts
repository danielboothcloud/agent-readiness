import type { HarnessId } from "../types/index.js";

/**
 * Self-directed discovery prompts. The checklist names a few concrete tools as
 * starting points, but every repo is different, so it also asks questions that
 * lead the user to what fits their stack and workflow, and points at where to
 * look, rather than handing over a fixed list.
 */

export interface DiscoveryPrompt {
  /** A question about how the team works with agents today. */
  question: string;
  /** The kind of capability a "yes" points to. */
  pointsTo: string;
}

export const DISCOVERY_PROMPTS: DiscoveryPrompt[] = [
  {
    question: "What do you re-explain to the agent in most sessions?",
    pointsTo: "context file content, or a skill that loads when relevant",
  },
  {
    question: "Which review comments keep recurring on agent-written changes?",
    pointsTo: "a lint/structural rule, or an enforced rules-file entry",
  },
  {
    question:
      "Which systems outside the repo does a typical change touch (DB, cloud, tickets, docs, observability, design)?",
    pointsTo: "an MCP server or a tool extension for that system",
  },
  {
    question:
      "Which multi-step workflows do you walk the agent through by hand?",
    pointsTo: "a prompt template, skill, or custom extension",
  },
  {
    question:
      "Which commands or files would be costly if an agent got them wrong?",
    pointsTo: "a guardrail: block, or require confirmation",
  },
  {
    question:
      "Where does the agent burn the most turns (finding code, running tests, reading huge output, waiting on slow checks)?",
    pointsTo:
      "a navigation/search, test-runner, or output-compression extension",
  },
];

/** Where to look for existing capabilities, per harness. */
export const DISCOVERY_SOURCES: Record<HarnessId, string[]> = {
  pi: [
    "Browse the pi package gallery (https://pi.dev/packages) or `npm search keywords:pi-package` — search for your stack, tools and pain points, not just the names in this checklist",
    "Trial a package project-scoped with `pi install -l <source>`; trim what it loads with `pi config -l`; remove it if it doesn't earn its context",
    "Nothing fits? Start with a .pi/prompts/*.md or a small .pi/extensions/*.ts; if it's useful beyond this repo, publish it with the `pi-package` keyword",
  ],
  claude: [
    "Browse plugin marketplaces with `/plugin` and the skills/commands other teams on your stack share",
  ],
  codex: [
    "Look for Agent Skills (SKILL.md) that other teams on your stack publish; they drop into .agents/skills",
  ],
  cursor: [
    "Look for shared rules, commands and MCP servers for your stack before writing your own",
  ],
  gemini: [
    "Look for Gemini CLI extensions for your stack (`gemini extensions install <source>`)",
  ],
};

/** Shown for every harness: MCP servers are cross-harness. */
export const SHARED_DISCOVERY_SOURCES: string[] = [
  "For external systems, check the official MCP registry (https://registry.modelcontextprotocol.io) and the vendor's own docs for an official server",
];

export function discoverySourcesFor(harnesses: HarnessId[]): {
  harness: HarnessId;
  sources: string[];
}[] {
  return harnesses.map((harness) => ({
    harness,
    sources: DISCOVERY_SOURCES[harness],
  }));
}
