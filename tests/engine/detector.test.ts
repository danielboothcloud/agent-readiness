import { describe, test, expect, afterEach } from "vitest";
import { detectProject } from "../../src/engine/detector.js";
import { createTestDir, cleanup, writeFixtures } from "../helpers.js";

let dirs: string[] = [];

async function make(name: string, fixtures: Record<string, string> = {}) {
  const dir = await createTestDir(name);
  dirs.push(dir);
  if (Object.keys(fixtures).length > 0) {
    await writeFixtures(dir, fixtures);
  }
  return dir;
}

afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

// ---------------------------------------------------------------------------
// Empty directory
// ---------------------------------------------------------------------------
describe("detectProject", () => {
  test("empty dir returns no types", async () => {
    const dir = await make("empty");
    const info = await detectProject(dir);
    expect(info.detectedTypes).toEqual([]);
    expect(info.isMonorepo).toBe(false);
  });

  // -------------------------------------------------------------------------
  // New languages: C#, Ruby, PHP, Swift
  // -------------------------------------------------------------------------
  describe("new languages", () => {
    test("detects csharp via .csproj", async () => {
      const dir = await make("csharp-csproj", { "MyApp.csproj": "<Project />" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("csharp");
    });

    test("detects csharp via .sln", async () => {
      const dir = await make("csharp-sln", { "MyApp.sln": "Microsoft Visual Studio Solution File" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("csharp");
    });

    test("detects ruby via Gemfile", async () => {
      const dir = await make("ruby", { Gemfile: 'source "https://rubygems.org"' });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("ruby");
    });

    test("detects php via composer.json", async () => {
      const dir = await make("php", { "composer.json": '{"require":{}}' });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("php");
    });

    test("detects swift via Package.swift", async () => {
      const dir = await make("swift", { "Package.swift": "// swift-tools-version:5.9" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("swift");
    });
  });

  // -------------------------------------------------------------------------
  // Regression: existing languages
  // -------------------------------------------------------------------------
  describe("regression — existing languages", () => {
    test("detects node", async () => {
      const dir = await make("node", { "package.json": '{"name":"x"}' });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("node");
    });

    test("detects TypeScript in the Node ecosystem", async () => {
      const dir = await make("typescript", {
        "package.json": '{"name":"x","devDependencies":{"typescript":"^5.0.0"}}',
        "tsconfig.json": "{}",
      });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("node");
      expect(info.detectedTypes).toContain("typescript");
    });

    test("detects NestJS in the Node ecosystem", async () => {
      const dir = await make("nestjs", {
        "package.json": '{"name":"x","dependencies":{"@nestjs/core":"^10.0.0"}}',
      });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("node");
      expect(info.detectedTypes).toContain("nestjs");
    });

    test("detects Hono in the Node ecosystem", async () => {
      const dir = await make("hono", {
        "package.json": '{"name":"x","dependencies":{"hono":"^4.0.0"}}',
      });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("node");
      expect(info.detectedTypes).toContain("hono");
    });

    test("detects common JavaScript and TypeScript ecosystem tags", async () => {
      const dir = await make("js-ts-ecosystem", {
        "package.json": JSON.stringify({
          name: "x",
          dependencies: {
            express: "^5.0.0",
            fastify: "^5.0.0",
            react: "^19.0.0",
            next: "^15.0.0",
            vue: "^3.0.0",
            svelte: "^5.0.0",
          },
          devDependencies: {
            vite: "^6.0.0",
            typescript: "^5.0.0",
          },
        }),
      });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toEqual([
        "express",
        "fastify",
        "nextjs",
        "node",
        "react",
        "svelte",
        "typescript",
        "vite",
        "vue",
      ]);
    });

    test("detects Bun runtime in the Node ecosystem", async () => {
      const dir = await make("bun", {
        "package.json": '{"name":"x","packageManager":"bun@1.3.14"}',
      });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("node");
      expect(info.detectedTypes).toContain("bun");
    });

    test("detects Deno runtime in the JavaScript and TypeScript ecosystem", async () => {
      const dir = await make("deno", {
        "deno.json": "{}",
        "main.ts": "Deno.serve(() => new Response('ok'));",
      });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("typescript");
      expect(info.detectedTypes).toContain("deno");
    });

    test("detects python", async () => {
      const dir = await make("python", { "pyproject.toml": "[project]" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("python");
    });

    test("detects Python ecosystem tags", async () => {
      const dir = await make("python-ecosystem", {
        "pyproject.toml": "[project]\ndependencies = ['fastapi', 'pydantic', 'pytest', 'ruff', 'mypy']",
        "uv.lock": "",
      });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toEqual([
        "fastapi",
        "mypy",
        "pydantic",
        "pytest",
        "python",
        "ruff",
        "uv",
      ]);
    });

    test("detects go", async () => {
      const dir = await make("go", { "go.mod": "module example.com/foo" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("go");
    });

    test("detects Go ecosystem tags", async () => {
      const dir = await make("go-ecosystem", {
        "go.mod": [
          "module example.com/foo",
          "require github.com/gin-gonic/gin v1.10.0",
          "require github.com/go-chi/chi/v5 v5.0.0",
          "require google.golang.org/grpc v1.0.0",
        ].join("\n"),
      });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toEqual(["chi", "gin", "go", "grpc"]);
    });

    test("detects rust", async () => {
      const dir = await make("rust", { "Cargo.toml": "[package]" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("rust");
    });

    test("detects kotlin via build.gradle.kts", async () => {
      const dir = await make("kotlin", { "build.gradle.kts": 'plugins { kotlin("jvm") }' });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("kotlin");
    });

    test("detects java via pom.xml", async () => {
      const dir = await make("java", { "pom.xml": "<project />" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("java");
    });

    test("detects infrastructure ecosystem tags", async () => {
      const dir = await make("infra-ecosystem", {
        "main.tf": "resource \"null_resource\" \"example\" {}",
        "helmfile.yaml": "releases: []",
        "k8s/deployment.yaml": "apiVersion: apps/v1\nkind: Deployment",
        "Dockerfile": "FROM alpine",
      });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toEqual(["docker", "helm", "kubernetes", "terraform"]);
    });
  });

  // -------------------------------------------------------------------------
  // Multi-language
  // -------------------------------------------------------------------------
  test("multi-language: node + ruby", async () => {
    const dir = await make("multi", {
      "package.json": '{"name":"x"}',
      Gemfile: 'source "https://rubygems.org"',
    });
    const info = await detectProject(dir);
    expect(info.detectedTypes).toContain("node");
    expect(info.detectedTypes).toContain("ruby");
  });

  test("uses configured workspaces as nested codebases", async () => {
    const dir = await make("configured-workspaces", {
      "worker/pyproject.toml": "[project]\nname = 'worker'",
      "frontend/package.json": '{"name":"frontend"}',
    });
    const info = await detectProject(dir, {
      knowledge: ["Repo-level context"],
      workspaces: [
        {
          name: "worker",
          path: "worker",
          description: "Python worker",
          languages: ["python"],
          knowledge: ["Worker context"],
        },
        {
          name: "frontend",
          path: "frontend",
          languages: ["node"],
        },
      ],
    });

    expect(info.isMonorepo).toBe(true);
    expect(info.packages).toEqual(["frontend", "worker"]);
    expect(info.detectedTypes).toEqual(["node", "python"]);
    expect(info.knowledge).toEqual(["Repo-level context"]);
    expect(info.workspaces).toMatchObject([
      {
        name: "worker",
        path: "worker",
        description: "Python worker",
        detectedTypes: ["python"],
        knowledge: ["Worker context"],
      },
      {
        name: "frontend",
        path: "frontend",
        detectedTypes: ["node"],
        knowledge: [],
      },
    ]);
  });
});
