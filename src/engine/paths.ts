import { stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";

/**
 * Per-criterion path mapping from `.agent-profile.yml`:
 *
 *   paths:
 *     linter: services/*            # directory → run the check there
 *     ci-config: deploy/ci.yml      # file → counts as evidence
 *
 * Lets repos with non-standard layouts (monoliths with many services, nested
 * tooling dirs) point a check at where the thing actually lives. Paths are
 * repo-relative and may be globs; anything outside the repo is ignored so
 * only committed, repo-scoped files ever satisfy a check.
 */
export type CriterionPaths = Record<string, string[]>;

export interface NormalizedPaths {
  paths: CriterionPaths;
  warnings: string[];
}

/** Validate the raw `paths:` config against the known criterion IDs. */
export function normalizeCriterionPaths(
  raw: unknown,
  knownIds: string[],
): NormalizedPaths {
  const paths: CriterionPaths = {};
  const warnings: string[] = [];
  if (raw === undefined || raw === null) return { paths, warnings };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push(
      "`paths` must map criterion IDs to a path or list of paths; ignoring it.",
    );
    return { paths, warnings };
  }

  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!knownIds.includes(id)) {
      warnings.push(`paths.${id}: unknown criterion ID; ignoring it.`);
      continue;
    }
    const list = (Array.isArray(value) ? value : [value])
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .map((v) => v.trim());
    const safe = list.filter((p) => {
      if (isOutsideRepo(p)) {
        warnings.push(
          `paths.${id}: "${p}" is outside the repository; only repo-relative paths count.`,
        );
        return false;
      }
      return true;
    });
    if (safe.length > 0) paths[id] = safe;
  }
  return { paths, warnings };
}

function isOutsideRepo(p: string): boolean {
  if (path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p)) return true;
  const normalized = path.posix.normalize(p.replace(/\\/g, "/"));
  return normalized === ".." || normalized.startsWith("../");
}

export interface ResolvedPaths {
  /** Repo-relative directories to run the check in. */
  dirs: string[];
  /** Repo-relative files that count as evidence. */
  files: string[];
  /** Configured entries that matched nothing. */
  missing: string[];
}

/** Expand configured entries (globs allowed) into existing dirs and files. */
export async function resolveMappedPaths(
  repoPath: string,
  entries: string[],
): Promise<ResolvedPaths> {
  const dirs = new Set<string>();
  const files = new Set<string>();
  const missing: string[] = [];

  for (const entry of entries) {
    const clean = entry.replace(/\\/g, "/").replace(/\/+$/, "") || ".";
    const matches = fg.isDynamicPattern(clean)
      ? await fg(clean, {
          cwd: repoPath,
          dot: true,
          onlyFiles: false,
          ignore: ["**/node_modules/**", "**/.git/**"],
        })
      : [clean];

    let found = false;
    for (const m of matches) {
      const kind = await kindOf(path.join(repoPath, m));
      if (kind === "dir") dirs.add(m);
      if (kind === "file") files.add(m);
      if (kind) found = true;
    }
    if (!found) missing.push(entry);
  }

  return { dirs: [...dirs], files: [...files], missing };
}

async function kindOf(p: string): Promise<"dir" | "file" | null> {
  try {
    const s = await stat(p);
    if (s.isDirectory()) return "dir";
    return s.isFile() ? "file" : null;
  } catch {
    return null;
  }
}
