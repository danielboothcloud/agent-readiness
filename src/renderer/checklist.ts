import { LEVEL_LABELS, type ReportData } from "../types/index.js";

export type ChecklistFormat = "md" | "txt";

export const DEFAULT_CHECKLIST_FILENAME = "agent-readiness-checklist.md";

/** Infer checklist format from a file path's extension (defaults to markdown). */
export function checklistFormatFromPath(filePath: string): ChecklistFormat {
  return filePath.toLowerCase().endsWith(".txt") ? "txt" : "md";
}

/**
 * Render the report as a checklist: every criterion grouped by pillar,
 * checked when passing, with the failure message and matching
 * recommendation attached to unchecked items.
 */
export function renderChecklist(
  data: ReportData,
  format: ChecklistFormat = "md",
): string {
  const md = format === "md";
  const lines: string[] = [];
  const { level, nextLevelProgress } = data.levelResult;

  const heading = (text: string, depth: number): void => {
    if (md) {
      lines.push(`${"#".repeat(depth)} ${text}`, "");
    } else {
      lines.push(text, (depth === 1 ? "=" : "-").repeat(text.length), "");
    }
  };

  heading(`Agent Readiness Checklist: ${data.repoName}`, 1);
  lines.push(`Path: ${data.repoPath}`);
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
  lines.push("");

  for (const pillar of data.pillars) {
    const results = data.results.get(pillar.id) ?? [];
    const score = data.pillarScores.find((s) => s.pillarId === pillar.id);
    const scoreText = score
      ? ` (${score.passed}/${score.total}, ${score.percentage}%)`
      : "";
    heading(`${pillar.name}${scoreText}`, 2);

    const sorted = [...pillar.criteria].sort((a, b) => a.level - b.level);
    for (const criterion of sorted) {
      const result = results.find((r) => r.criterionId === criterion.id);
      const box = result?.skipped ? "[-]" : result?.pass ? "[x]" : "[ ]";
      const name = md ? `**${criterion.name}**` : criterion.name;
      const id = md ? `\`${criterion.id}\`` : criterion.id;
      lines.push(`- ${box} ${name} (L${criterion.level}, ${id})`);

      if (result?.skipped) {
        lines.push(`  - Skipped: ${result.message}`);
      } else if (result && !result.pass) {
        lines.push(`  - Status: ${result.message}`);
        const rec = data.recommendations.find(
          (r) => r.criterionId === criterion.id,
        );
        if (rec) {
          lines.push(
            `  - Fix: ${rec.description} (effort: ${rec.effort}, impact: ${rec.impact})`,
          );
        }
      }
    }
    lines.push("");
  }

  lines.push("Legend: [x] passing, [ ] failing, [-] skipped");
  return `${lines.join("\n")}\n`;
}
