import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import fg from "fast-glob";

export async function fileExists(
  repoPath: string,
  ...patterns: string[]
): Promise<string | null> {
  for (const pattern of patterns) {
    if (pattern.includes("*")) {
      const matches = await fg(pattern, {
        cwd: repoPath,
        absolute: false,
        dot: true,
      });
      if (matches.length > 0) return matches[0];
    } else if (existsSync(join(repoPath, pattern))) return pattern;
  }
  return null;
}

export async function findFiles(
  repoPath: string,
  pattern: string,
): Promise<string[]> {
  return fg(pattern, { cwd: repoPath, absolute: false, dot: true });
}

const VENDOR_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/vendor/**",
  "**/dist/**",
  "**/.venv/**",
  "**/.terraform/**",
];

/** Like findFiles, but skips dependency/build dirs — for repo-wide `**` globs. */
export async function findRepoFiles(
  repoPath: string,
  pattern: string | string[],
): Promise<string[]> {
  return fg(pattern, {
    cwd: repoPath,
    absolute: false,
    dot: true,
    ignore: VENDOR_IGNORE,
  });
}

// A pi `packages` entry is either a source string or `{ source, ...filters }`.
function packageSource(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "source" in entry) {
    return String((entry as { source: unknown }).source);
  }
  return "";
}

/** Package sources declared in a pi settings file (`.pi/settings.json`). */
export function piPackageSources(settingsContent: string | null): string[] {
  if (!settingsContent) return [];
  try {
    const parsed = JSON.parse(settingsContent) as { packages?: unknown };
    if (!Array.isArray(parsed.packages)) return [];
    return parsed.packages.map(packageSource).filter(Boolean);
  } catch {
    return [];
  }
}

/** True when a pi package source refers to the named package (npm:, git:, path). */
export function piPackageMatches(source: string, name: string): boolean {
  const s = source.toLowerCase();
  return (
    s === `npm:${name}` ||
    s.startsWith(`npm:${name}@`) ||
    new RegExp(`[/:]${name}(\\.git)?([@#].*)?$`).test(s)
  );
}

export async function readFileContent(
  repoPath: string,
  filePath: string,
): Promise<string | null> {
  try {
    return await readFile(join(repoPath, filePath), "utf-8");
  } catch {
    return null;
  }
}

export async function packageJsonHas(
  repoPath: string,
  key: string,
): Promise<boolean> {
  const content = await readFileContent(repoPath, "package.json");
  if (!content) return false;
  try {
    const pkg = JSON.parse(content);
    return (
      key.split(".").reduce(
        (obj: Record<string, unknown> | undefined, k) => {
          if (obj === undefined || obj === null) return undefined;
          return obj[k] as Record<string, unknown> | undefined;
        },
        pkg as Record<string, unknown>,
      ) !== undefined
    );
  } catch {
    return false;
  }
}

export async function getFileMtimeMs(
  repoPath: string,
  filePath: string,
): Promise<number | null> {
  try {
    const s = await stat(join(repoPath, filePath));
    return s.mtimeMs;
  } catch {
    return null;
  }
}
