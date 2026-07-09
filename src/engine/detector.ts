import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import YAML from "yaml";
import type { Config, ProjectInfo, ProjectWorkspaceInfo } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function readYamlFile<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return YAML.parse(content) as T;
  } catch {
    return null;
  }
}

async function readTextFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Project-type detection
// ---------------------------------------------------------------------------

interface TypeIndicator {
  type: string;
  files: string[];
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  packageManager?: string;
  scripts?: Record<string, string>;
}

const TYPE_INDICATORS: TypeIndicator[] = [
  { type: "node", files: ["package.json"] },
  { type: "python", files: ["pyproject.toml", "setup.py", "requirements.txt"] },
  { type: "go", files: ["go.mod"] },
  { type: "rust", files: ["Cargo.toml"] },
  { type: "csharp", files: ["*.csproj", "*.sln"] },
  { type: "kotlin", files: ["build.gradle.kts"] },
  { type: "java", files: ["pom.xml", "build.gradle"] },
  { type: "ruby", files: ["Gemfile"] },
  { type: "php", files: ["composer.json"] },
  { type: "swift", files: ["Package.swift"] },
];

async function detectTypes(repoPath: string): Promise<string[]> {
  const detected: string[] = [];

  for (const indicator of TYPE_INDICATORS) {
    for (const file of indicator.files) {
      if (file.includes("*")) {
        // Use glob for patterns with wildcards
        const matches = await fg(file, { cwd: repoPath, absolute: false, onlyFiles: true, deep: 1 });
        if (matches.length > 0) {
          if (!detected.includes(indicator.type)) {
            detected.push(indicator.type);
          }
          break;
        }
      } else if (await fileExists(path.join(repoPath, file))) {
        if (!detected.includes(indicator.type)) {
          detected.push(indicator.type);
        }
        break; // one match per type is enough
      }
    }
  }

  await detectJavaScriptTypeScriptEcosystem(repoPath, detected);
  await detectPythonEcosystem(repoPath, detected);
  await detectGoEcosystem(repoPath, detected);
  await detectJvmEcosystem(repoPath, detected);
  await detectDotnetEcosystem(repoPath, detected);
  await detectInfrastructureEcosystem(repoPath, detected);

  // Additional Kotlin detection: check build.gradle for Kotlin plugins
  if (!detected.includes("kotlin")) {
    const buildGradle = path.join(repoPath, "build.gradle");
    if (await fileExists(buildGradle)) {
      try {
        const content = await fs.readFile(buildGradle, "utf-8");
        if (
          content.includes("org.jetbrains.kotlin") ||
          /\bkotlin\s*\(/.test(content) ||
          /id\s+['"]kotlin/.test(content) ||
          content.includes("kotlin-android") ||
          content.includes("kotlin-jvm")
        ) {
          detected.push("kotlin");
        }
      } catch {
        // ignore read errors
      }
    }

    // Check pom.xml for kotlin-maven-plugin
    const pomXml = path.join(repoPath, "pom.xml");
    if (!detected.includes("kotlin") && await fileExists(pomXml)) {
      try {
        const content = await fs.readFile(pomXml, "utf-8");
        if (content.includes("kotlin-maven-plugin") || content.includes("org.jetbrains.kotlin")) {
          detected.push("kotlin");
        }
      } catch {
        // ignore read errors
      }
    }
  }

  return detected;
}

async function detectJavaScriptTypeScriptEcosystem(
  repoPath: string,
  detected: string[],
): Promise<void> {
  const packageJson = await readJsonFile<PackageJson>(path.join(repoPath, "package.json"));
  const hasJsTsSignal =
    Boolean(packageJson) ||
    await fileExists(path.join(repoPath, "tsconfig.json")) ||
    await fileExists(path.join(repoPath, "jsconfig.json")) ||
    await fileExists(path.join(repoPath, "deno.json")) ||
    await fileExists(path.join(repoPath, "deno.jsonc")) ||
    await fileExists(path.join(repoPath, "bun.lock")) ||
    await fileExists(path.join(repoPath, "bun.lockb"));
  if (!hasJsTsSignal) return;

  const deps = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
    ...(packageJson?.peerDependencies ?? {}),
    ...(packageJson?.optionalDependencies ?? {}),
  };
  const depNames = Object.keys(deps);

  if (
    await fileExists(path.join(repoPath, "tsconfig.json")) ||
    await fileExists(path.join(repoPath, "deno.json")) ||
    await fileExists(path.join(repoPath, "deno.jsonc")) ||
    depNames.includes("typescript") ||
    (await fg(["**/*.{ts,tsx}", "!node_modules/**", "!dist/**", "!build/**"], {
      cwd: repoPath,
      absolute: false,
      onlyFiles: true,
      deep: 4,
    })).length > 0
  ) {
    addDetected(detected, "typescript");
  }

  if (
    depNames.some((dep) => dep === "@nestjs/core" || dep.startsWith("@nestjs/")) ||
    await fileExists(path.join(repoPath, "nest-cli.json"))
  ) {
    addDetected(detected, "nestjs");
  }

  if (
    depNames.includes("hono") ||
    await hasHonoImport(repoPath)
  ) {
    addDetected(detected, "hono");
  }

  if (depNames.includes("express")) addDetected(detected, "express");
  if (depNames.includes("fastify")) addDetected(detected, "fastify");
  if (depNames.includes("react")) addDetected(detected, "react");
  if (depNames.includes("next")) addDetected(detected, "nextjs");
  if (depNames.includes("vue")) addDetected(detected, "vue");
  if (depNames.includes("svelte")) addDetected(detected, "svelte");
  if (depNames.includes("vite")) addDetected(detected, "vite");
  if (depNames.includes("astro")) addDetected(detected, "astro");
  if (depNames.includes("@angular/core")) addDetected(detected, "angular");

  if (
    packageJson?.packageManager?.startsWith("bun@") ||
    await fileExists(path.join(repoPath, "bun.lock")) ||
    await fileExists(path.join(repoPath, "bun.lockb"))
  ) {
    addDetected(detected, "bun");
  }

  if (
    packageJson?.packageManager?.startsWith("deno@") ||
    await fileExists(path.join(repoPath, "deno.json")) ||
    await fileExists(path.join(repoPath, "deno.jsonc")) ||
    await fileExists(path.join(repoPath, "deno.lock"))
  ) {
    addDetected(detected, "deno");
  }
}

async function detectPythonEcosystem(repoPath: string, detected: string[]): Promise<void> {
  const pyproject = await readTextFile(path.join(repoPath, "pyproject.toml"));
  const requirements = await readTextFile(path.join(repoPath, "requirements.txt"));
  const setupPy = await readTextFile(path.join(repoPath, "setup.py"));
  const content = `${pyproject}\n${requirements}\n${setupPy}`.toLowerCase();
  if (!content.trim()) return;

  if (content.includes("fastapi")) addDetected(detected, "fastapi");
  if (content.includes("django")) addDetected(detected, "django");
  if (content.includes("flask")) addDetected(detected, "flask");
  if (content.includes("pydantic")) addDetected(detected, "pydantic");
  if (content.includes("pytest")) addDetected(detected, "pytest");
  if (content.includes("ruff")) addDetected(detected, "ruff");
  if (content.includes("mypy")) addDetected(detected, "mypy");
  if (content.includes("pyright")) addDetected(detected, "pyright");
  if (await fileExists(path.join(repoPath, "uv.lock"))) addDetected(detected, "uv");
  if (await fileExists(path.join(repoPath, "poetry.lock"))) addDetected(detected, "poetry");
}

async function detectGoEcosystem(repoPath: string, detected: string[]): Promise<void> {
  const goMod = await readTextFile(path.join(repoPath, "go.mod"));
  if (!goMod) return;

  if (goMod.includes("github.com/gin-gonic/gin")) addDetected(detected, "gin");
  if (goMod.includes("github.com/labstack/echo")) addDetected(detected, "echo");
  if (goMod.includes("github.com/go-chi/chi")) addDetected(detected, "chi");
  if (goMod.includes("github.com/gofiber/fiber")) addDetected(detected, "fiber");
  if (goMod.includes("google.golang.org/grpc")) addDetected(detected, "grpc");
}

async function detectJvmEcosystem(repoPath: string, detected: string[]): Promise<void> {
  const buildGradle = await readTextFile(path.join(repoPath, "build.gradle"));
  const buildGradleKts = await readTextFile(path.join(repoPath, "build.gradle.kts"));
  const pomXml = await readTextFile(path.join(repoPath, "pom.xml"));
  const content = `${buildGradle}\n${buildGradleKts}\n${pomXml}`.toLowerCase();
  if (!content.trim()) return;

  if (content.includes("spring-boot") || content.includes("springframework.boot")) {
    addDetected(detected, "spring-boot");
  }
  if (content.includes("quarkus")) addDetected(detected, "quarkus");
  if (content.includes("micronaut")) addDetected(detected, "micronaut");
  if (await fileExists(path.join(repoPath, "gradlew")) || buildGradle || buildGradleKts) {
    addDetected(detected, "gradle");
  }
  if (await fileExists(path.join(repoPath, "mvnw")) || pomXml) addDetected(detected, "maven");
}

async function detectDotnetEcosystem(repoPath: string, detected: string[]): Promise<void> {
  const csprojMatches = await fg("*.csproj", {
    cwd: repoPath,
    absolute: false,
    onlyFiles: true,
    deep: 1,
  });
  if (csprojMatches.length === 0 && !(await fileExists(path.join(repoPath, "global.json")))) return;

  addDetected(detected, "dotnet");
  for (const csproj of csprojMatches) {
    const content = (await readTextFile(path.join(repoPath, csproj))).toLowerCase();
    if (content.includes("microsoft.net.sdk.web")) addDetected(detected, "aspnetcore");
    if (content.includes("xunit")) addDetected(detected, "xunit");
    if (content.includes("nunit")) addDetected(detected, "nunit");
  }
}

async function detectInfrastructureEcosystem(repoPath: string, detected: string[]): Promise<void> {
  if ((await fg("*.tf", { cwd: repoPath, absolute: false, onlyFiles: true, deep: 2 })).length > 0) {
    addDetected(detected, "terraform");
  }
  if (
    await fileExists(path.join(repoPath, "Chart.yaml")) ||
    await fileExists(path.join(repoPath, "helmfile.yaml")) ||
    await fileExists(path.join(repoPath, "helmfile.yml"))
  ) {
    addDetected(detected, "helm");
  }
  if (
    await fileExists(path.join(repoPath, "kustomization.yaml")) ||
    await fileExists(path.join(repoPath, "kustomization.yml")) ||
    (await fg(["k8s/**/*.y{a,}ml", "deploy/**/*.y{a,}ml", "manifests/**/*.y{a,}ml"], {
      cwd: repoPath,
      absolute: false,
      onlyFiles: true,
      deep: 4,
    })).length > 0
  ) {
    addDetected(detected, "kubernetes");
  }
  if (
    await fileExists(path.join(repoPath, "Dockerfile")) ||
    await fileExists(path.join(repoPath, "docker-compose.yml")) ||
    await fileExists(path.join(repoPath, "docker-compose.yaml"))
  ) {
    addDetected(detected, "docker");
  }
}

function addDetected(detected: string[], type: string): void {
  if (!detected.includes(type)) detected.push(type);
}

async function hasHonoImport(repoPath: string): Promise<boolean> {
  const candidates = await fg(
    [
      "**/{index,app,server,main}.{ts,tsx,js,jsx}",
      "!node_modules/**",
      "!dist/**",
      "!build/**",
    ],
    {
      cwd: repoPath,
      absolute: false,
      onlyFiles: true,
      deep: 4,
    },
  );

  for (const candidate of candidates.slice(0, 25)) {
    try {
      const content = await fs.readFile(path.join(repoPath, candidate), "utf-8");
      if (/from\s+["']hono["']|require\(["']hono["']\)/.test(content)) {
        return true;
      }
    } catch {
      // Ignore unreadable files; package metadata is the main detection path.
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Monorepo detection
// ---------------------------------------------------------------------------

interface MonorepoResult {
  isMonorepo: boolean;
  packages: string[];
}

/**
 * Resolve workspace glob patterns into actual directory paths.
 */
async function resolveWorkspaceGlobs(
  repoPath: string,
  patterns: string[],
): Promise<string[]> {
  // Normalise patterns: ensure each one targets directories by appending
  // /package.json so fast-glob only returns real package folders.
  const globPatterns = patterns.map((p) => {
    // Strip trailing slashes and wildcard stars, then append /package.json
    const cleaned = p.replace(/\/?\*?$/, "");
    return `${cleaned}/*/package.json`;
  });

  // Also try the raw patterns directly in case they already point at
  // concrete directories (e.g. "packages/foo").
  const directPatterns = patterns.map((p) => {
    const cleaned = p.replace(/\/?\*?$/, "");
    return `${cleaned}/package.json`;
  });

  const allPatterns = [...globPatterns, ...directPatterns];

  const matches = await fg(allPatterns, {
    cwd: repoPath,
    onlyFiles: true,
    absolute: false,
    unique: true,
  });

  // Return relative directory paths (strip the trailing /package.json)
  const dirs = matches.map((m) => path.dirname(m));

  // De-duplicate and sort for deterministic output
  return [...new Set(dirs)].sort();
}

async function detectMonorepo(repoPath: string): Promise<MonorepoResult> {
  const negative: MonorepoResult = { isMonorepo: false, packages: [] };

  // 1. npm / yarn workspaces -------------------------------------------------
  const pkgJson = await readJsonFile<{
    workspaces?: string[] | { packages?: string[] };
  }>(path.join(repoPath, "package.json"));

  if (pkgJson?.workspaces) {
    const patterns = Array.isArray(pkgJson.workspaces)
      ? pkgJson.workspaces
      : pkgJson.workspaces.packages ?? [];

    if (patterns.length > 0) {
      const packages = await resolveWorkspaceGlobs(repoPath, patterns);
      return { isMonorepo: true, packages };
    }
  }

  // 2. pnpm workspaces -------------------------------------------------------
  const pnpmPath = path.join(repoPath, "pnpm-workspace.yaml");
  if (await fileExists(pnpmPath)) {
    const pnpmConfig = await readYamlFile<{ packages?: string[] }>(pnpmPath);
    const patterns = pnpmConfig?.packages ?? [];

    if (patterns.length > 0) {
      const packages = await resolveWorkspaceGlobs(repoPath, patterns);
      return { isMonorepo: true, packages };
    }

    // Even without explicit patterns, the existence of the file signals a monorepo
    return { isMonorepo: true, packages: [] };
  }

  // 3. Lerna ------------------------------------------------------------------
  const lernaPath = path.join(repoPath, "lerna.json");
  if (await fileExists(lernaPath)) {
    const lernaConfig = await readJsonFile<{ packages?: string[] }>(lernaPath);
    const patterns = lernaConfig?.packages ?? ["packages/*"];
    const packages = await resolveWorkspaceGlobs(repoPath, patterns);
    return { isMonorepo: true, packages };
  }

  // 4. Nx ---------------------------------------------------------------------
  if (await fileExists(path.join(repoPath, "nx.json"))) {
    // Nx projects can live anywhere; try common conventions
    const packages = await resolveWorkspaceGlobs(repoPath, [
      "packages",
      "apps",
      "libs",
    ]);
    return { isMonorepo: true, packages };
  }

  // 5. Turborepo --------------------------------------------------------------
  if (await fileExists(path.join(repoPath, "turbo.json"))) {
    // Turbo relies on the workspace config from the package manager, which
    // we already checked above. If we reach here, just flag as monorepo.
    // Attempt common conventions as a fallback.
    const packages = await resolveWorkspaceGlobs(repoPath, [
      "packages",
      "apps",
    ]);
    return { isMonorepo: true, packages };
  }

  return negative;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

async function detectConfiguredWorkspaces(
  repoPath: string,
  config: Pick<Config, "workspaces">,
): Promise<ProjectWorkspaceInfo[]> {
  const workspaces = config.workspaces ?? [];
  const detected: ProjectWorkspaceInfo[] = [];

  for (const entry of workspaces) {
    const workspace =
      typeof entry === "string"
        ? { name: path.basename(entry), path: entry }
        : {
            name: entry.name ?? path.basename(entry.path),
            path: entry.path,
            description: entry.description,
            languages: entry.languages,
            knowledge: entry.knowledge,
          };

    const absolutePath = path.resolve(repoPath, workspace.path);
    if (!(await fileExists(absolutePath))) continue;

    const detectedTypes = await detectTypes(absolutePath);
    detected.push({
      name: workspace.name,
      path: workspace.path,
      description: workspace.description,
      detectedTypes: unique([...(workspace.languages ?? []), ...detectedTypes]),
      knowledge: asArray(workspace.knowledge),
    });
  }

  return detected;
}

export async function detectProject(
  repoPath: string,
  config: Pick<Config, "workspaces" | "knowledge"> = {},
): Promise<ProjectInfo> {
  const absolutePath = path.resolve(repoPath);

  const [rootTypes, monorepo, workspaces] = await Promise.all([
    detectTypes(absolutePath),
    detectMonorepo(absolutePath),
    detectConfiguredWorkspaces(absolutePath, config),
  ]);

  const workspaceTypes = workspaces.flatMap((workspace) => workspace.detectedTypes);
  const workspacePaths = workspaces.map((workspace) => workspace.path);

  return {
    detectedTypes: unique([...rootTypes, ...workspaceTypes]),
    isMonorepo: monorepo.isMonorepo || workspaces.length > 0,
    packages: unique([...monorepo.packages, ...workspacePaths]),
    workspaces,
    knowledge: asArray(config.knowledge),
  };
}
