import { PILLAR_GUIDANCE } from "../engine/guidance.js";
import { CRITERION_INFO, harnessAdviceFor } from "../engine/recommender.js";
import {
  DISCOVERY_PROMPTS,
  SHARED_DISCOVERY_SOURCES,
  discoverySourcesFor,
} from "../engine/discovery.js";
import {
  HARNESS_LABELS,
  LEVEL_LABELS,
  type HarnessAdvice,
  type ReportData,
} from "../types/index.js";

export type ChecklistFormat = "md" | "txt";

export const DEFAULT_CHECKLIST_FILENAME = "agent-readiness-checklist.md";

/** "pi, Claude Code (detected)" — also used by the terminal renderer. */
export function describeHarnesses(data: ReportData): string {
  const { harnesses, harnessSource } = data.projectInfo;
  const names = harnesses.map((h) => HARNESS_LABELS[h]).join(", ");
  const source =
    harnessSource === "default"
      ? "default; set `harnesses:` in .agent-profile.yml"
      : harnessSource;
  return `${names} (${source})`;
}

/** Infer checklist format from a file path's extension (defaults to markdown). */
export function checklistFormatFromPath(filePath: string): ChecklistFormat {
  return filePath.toLowerCase().endsWith(".txt") ? "txt" : "md";
}

type Result = ReportData["results"] extends Map<string, (infer R)[]>
  ? R
  : never;

function checkbox(result: Result | undefined): string {
  if (result?.skipped) return "[-]";
  return result?.pass ? "[x]" : "[ ]";
}

function statusText(result: Result | undefined): string {
  if (!result) return "not evaluated";
  if (result.skipped) return `skipped (${result.message})`;
  return `${result.pass ? "passing" : "failing"} — ${result.message}`;
}

const EXAMPLES_LABEL = "Starting points (examples, not the only options):";

/**
 * Questions + examples for one item. Questions come first on purpose: the
 * checklist should lead the user to what fits their repo, with the named tools
 * as starting points rather than the prescribed answer.
 */
function guidanceLines(
  explore: string[] | undefined,
  advice: HarnessAdvice[] | undefined,
  indent: string,
): string[] {
  const out: string[] = [];
  if (explore && explore.length > 0) {
    out.push(`${indent}- Ask yourself:`);
    for (const q of explore) out.push(`${indent}  - ${q}`);
  }
  if (advice && advice.length > 0) {
    out.push(`${indent}- ${EXAMPLES_LABEL}`);
    for (const a of advice) {
      out.push(`${indent}  - ${HARNESS_LABELS[a.harness]}: ${a.advice}`);
    }
  }
  return out;
}

/**
 * Render the report as a checklist meant to be committed and kept: every pillar
 * and every criterion carries why it matters, the goal, open questions and
 * example starting points, whether it currently passes, fails or is skipped,
 * so the file keeps guiding decisions after the boxes are ticked.
 */
export function renderChecklist(
  data: ReportData,
  format: ChecklistFormat = "md",
): string {
  const md = format === "md";
  const lines: string[] = [];
  const { level, nextLevelProgress } = data.levelResult;
  const bold = (text: string) => (md ? `**${text}**` : text);
  const harnesses = data.projectInfo.harnesses;

  const heading = (text: string, depth: number): void => {
    if (md) {
      lines.push(`${"#".repeat(depth)} ${text}`, "");
    } else {
      lines.push(text, (depth === 1 ? "=" : "-").repeat(text.length), "");
    }
  };

  heading(`Agent Readiness Checklist: ${data.repoName}`, 1);
  lines.push(`Maturity level: ${level} (${LEVEL_LABELS[level]})`);
  if (nextLevelProgress.nextLevel !== null) {
    lines.push(
      `Next level: ${nextLevelProgress.nextLevel} (${LEVEL_LABELS[nextLevelProgress.nextLevel]}) — ` +
        `${nextLevelProgress.current}/${nextLevelProgress.needed} criteria passing, ${nextLevelProgress.remaining} remaining`,
    );
  }
  if (data.projectInfo.detectedTypes.length > 0) {
    lines.push(`Languages: ${data.projectInfo.detectedTypes.join(", ")}`);
  }
  if (harnesses.length > 0) {
    lines.push(`Harnesses: ${describeHarnesses(data)}`);
  }
  lines.push("");
  lines.push(
    "This checklist is meant to live in the repo. Every area and item keeps its guidance even once it's ticked: " +
      "why it matters, what good looks like, questions to work through, and example starting points. " +
      "The examples are common options, not the answer for every repo; use the questions to decide what fits this codebase, " +
      'and look around before building your own (see "Find what fits this repo" at the end). ' +
      "A ticked box means the basics are detected, not that the question is settled: revisit when the stack, team or tools change, " +
      "and regenerate with `agent-readiness --checklist` to refresh the status.",
    "",
  );

  for (const pillar of data.pillars) {
    const results = data.results.get(pillar.id) ?? [];
    const score = data.pillarScores.find((s) => s.pillarId === pillar.id);
    const scoreText = score
      ? ` (${score.passed}/${score.total}, ${score.percentage}%)`
      : "";
    heading(`${pillar.name}${scoreText}`, 2);

    const guidance = PILLAR_GUIDANCE[pillar.id];
    if (guidance) {
      lines.push(`${bold("Why this matters:")} ${guidance.why}`, "");
      lines.push(`${bold("Questions for this area:")}`);
      for (const q of guidance.explore) lines.push(`- ${q}`);
      lines.push("");
    }

    const sorted = [...pillar.criteria].sort((a, b) => a.level - b.level);
    for (const criterion of sorted) {
      const result = results.find((r) => r.criterionId === criterion.id);
      const box = checkbox(result);
      const id = md ? `\`${criterion.id}\`` : criterion.id;
      lines.push(
        `- ${box} ${bold(criterion.name)} (L${criterion.level}, ${id})`,
      );
      lines.push(`  - Status: ${statusText(result)}`);

      const info = CRITERION_INFO[criterion.id];
      const rec = data.recommendations.find(
        (r) => r.criterionId === criterion.id,
      );
      if (info) {
        lines.push(`  - Why it matters: ${info.reason}`);
        const sizing = rec
          ? `effort: ${rec.effort}, impact: ${rec.impact}`
          : `effort: ${info.effort}`;
        lines.push(`  - Goal: ${info.description} (${sizing})`);
        lines.push(
          ...guidanceLines(
            info.explore,
            harnessAdviceFor(info.harness, harnesses),
            "  ",
          ),
        );
      } else {
        lines.push(`  - Goal: ${criterion.description}`);
      }
    }
    lines.push("");
  }

  if (data.considerations.length > 0) {
    heading("Considerations (not scored)", 2);
    lines.push(
      "Prompted by what's in this repo. They don't affect the level. Decide whether each one matters for how your team works.",
      "",
    );
    for (const c of data.considerations) {
      lines.push(`- [ ] ${bold(c.title)}`);
      lines.push(`  - Signal: ${c.signal}`);
      lines.push(`  - Why: ${c.description}`);
      lines.push(...guidanceLines(c.explore, c.harnessAdvice, "  "));
    }
    lines.push("");
  }

  heading("Find what fits this repo", 2);
  lines.push(
    "The tools named above are examples. The best setup depends on your stack and how your team works with agents. " +
      'Work through these questions; each "yes" points to a kind of capability worth looking for.',
    "",
  );
  for (const p of DISCOVERY_PROMPTS) {
    lines.push(`- [ ] ${p.question}`);
    lines.push(`  - Look for: ${p.pointsTo}`);
  }
  lines.push("");
  lines.push(`${bold("Where to look")} (adopt before you build):`);
  for (const { harness, sources } of discoverySourcesFor(
    data.projectInfo.harnesses,
  )) {
    for (const s of sources) lines.push(`- ${HARNESS_LABELS[harness]}: ${s}`);
  }
  for (const s of SHARED_DISCOVERY_SOURCES) lines.push(`- Any harness: ${s}`);
  lines.push(
    "- Ask your agent: describe the pain point and your stack, and have it search for existing packages, skills or MCP servers before proposing to build one",
  );
  lines.push("");

  lines.push(
    "Legend: [x] detected as passing (still worth revisiting), [ ] failing / to decide, [-] skipped",
  );
  return `${lines.join("\n")}\n`;
}
