import { afterEach, describe, expect, test } from "vitest";
import {
  collectTaskCommands,
  generateConsiderations,
} from "../../src/engine/considerations.js";
import type { HarnessId } from "../../src/types/index.js";
import {
  cleanup,
  createTestDir,
  mockProjectInfo,
  writeFixtures,
} from "../helpers.js";

let dirs: string[] = [];

async function make(name: string, fixtures: Record<string, string> = {}) {
  const dir = await createTestDir(name);
  dirs.push(dir);
  await writeFixtures(dir, fixtures);
  return dir;
}

afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

async function ids(dir: string, harnesses: HarnessId[] = ["pi"]) {
  const list = await generateConsiderations(
    dir,
    mockProjectInfo({ harnesses }),
  );
  return list.map((c) => c.id);
}

const scripts = (n: number) =>
  JSON.stringify({
    scripts: Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`task${i}`, `echo ${i}`]),
    ),
  });

describe("collectTaskCommands", () => {
  test("reads package.json, Makefile, mise and just tasks", async () => {
    const dir = await make("cn-tasks", {
      "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
      Makefile: ".PHONY: build\nbuild:\n\tgo build ./...\nVAR := 1\n",
      "mise.toml":
        '[tools]\nnode = "22"\n\n[tasks.publish]\ndescription = "x"\nrun = "pnpm publish"\n',
      justfile: "lint:\n  ruff check .\n",
    });
    const tasks = await collectTaskCommands(dir);
    expect(tasks.map((t) => `${t.source}:${t.name}`)).toEqual([
      "package.json:test",
      "Makefile:build",
      "mise.toml:publish",
      "justfile:lint",
    ]);
    expect(tasks.find((t) => t.name === "publish")?.body).toContain(
      "pnpm publish",
    );
  });
});

describe("generateConsiderations", () => {
  test("empty repo has no considerations", async () => {
    expect(await ids(await make("cn-empty"))).toEqual([]);
  });

  test("flags publish/deploy tasks with pi-warden advice", async () => {
    const dir = await make("cn-destructive", {
      "package.json": JSON.stringify({
        scripts: { release: "changeset publish", clean: "rm -rf dist" },
      }),
    });
    const list = await generateConsiderations(dir, mockProjectInfo());
    const c = list.find((x) => x.id === "guard-destructive-tasks");
    expect(c?.signal).toContain("release (package.json)");
    expect(c?.signal).toContain("clean (package.json)");
    expect(c?.harnessAdvice?.[0]).toMatchObject({ harness: "pi" });
    expect(c?.harnessAdvice?.[0].advice).toContain("pi-warden");
  });

  test("every consideration asks the user questions", async () => {
    const dir = await make("cn-all", {
      "package.json": JSON.stringify({
        scripts: { ...JSON.parse(scripts(6)).scripts, release: "npm publish" },
      }),
      "AGENTS.md": "- Never a\n- Don't b\n- Do not c\n" + "x".repeat(40 * 1024),
      ".pi/settings.json": JSON.stringify({ packages: ["npm:pi-lens"] }),
      "infra/main.tf": "",
      "charts/app/Chart.yaml": "",
      "prisma/schema.prisma": "",
      "api/openapi.yaml": "",
      "src/a.gen.ts": "",
    });
    const list = await generateConsiderations(dir, mockProjectInfo());
    expect(list.length).toBeGreaterThanOrEqual(10);
    for (const c of list) {
      expect(c.explore?.length ?? 0, c.id).toBeGreaterThan(0);
    }
  });

  test("suggests a custom workflow package when many tasks and no skills", async () => {
    const dir = await make("cn-pkg", { "package.json": scripts(6) });
    expect(await ids(dir)).toContain("custom-workflow-package");
  });

  test("no workflow-package suggestion when skills already exist", async () => {
    const dir = await make("cn-pkg-has", {
      "package.json": scripts(8),
      ".pi/prompts/release.md": "x",
    });
    expect(await ids(dir)).not.toContain("custom-workflow-package");
  });

  test("promotes AGENTS.md prohibitions to pi-warden rules", async () => {
    const agents =
      "- Never push to main\n- Don't edit dist\n- Do not run bun\n";
    const dir = await make("cn-gotchas", { "AGENTS.md": agents });
    expect(await ids(dir)).toContain("promote-gotchas-to-rules");

    const withWarden = await make("cn-gotchas-w", {
      "AGENTS.md": agents,
      "pi-warden.md": "# rule",
    });
    expect(await ids(withWarden)).not.toContain("promote-gotchas-to-rules");

    // pi-warden advice is irrelevant to a Cursor-only repo.
    expect(await ids(dir, ["cursor"])).not.toContain(
      "promote-gotchas-to-rules",
    );
  });

  test("pi-lens enabled without project rules suggests writing rules", async () => {
    const dir = await make("cn-lens", {
      ".pi/settings.json": JSON.stringify({ packages: ["npm:pi-lens"] }),
    });
    expect(await ids(dir)).toContain("pi-lens-project-rules");

    const withRules = await make("cn-lens-rules", {
      ".pi/settings.json": JSON.stringify({ packages: ["npm:pi-lens"] }),
      "rules/ast-grep-rules/rules/ts/no-any.yml": "id: no-any",
    });
    expect(await ids(withRules)).not.toContain("pi-lens-project-rules");
  });

  test("stack signals: terraform, helm, database, contracts", async () => {
    const dir = await make("cn-stack", {
      "infra/main.tf": 'resource "x" "y" {}',
      "charts/app/Chart.yaml": "name: app",
      "prisma/schema.prisma": "model A { id Int @id }",
      "api/openapi.yaml": "openapi: 3.1.0",
    });
    const found = await ids(dir);
    expect(found).toEqual(
      expect.arrayContaining([
        "terraform-workflow",
        "pi-lens-helm-render",
        "database-workflow",
        "api-contract-codegen",
      ]),
    );
  });

  test("helm render suggestion disappears once opted in", async () => {
    const dir = await make("cn-helm-on", {
      "charts/app/Chart.yaml": "name: app",
      "charts/app/.pi-lens.json":
        '{"helm":{"renderValidation":{"enabled":true}}}',
    });
    expect(await ids(dir)).not.toContain("pi-lens-helm-render");
  });

  test("ignores node_modules when scanning for stack signals", async () => {
    const dir = await make("cn-vendor", {
      "node_modules/x/main.tf": "",
      "node_modules/x/generated/a.ts": "",
    });
    expect(await ids(dir)).toEqual([]);
  });

  test("generated code without linguist-generated is flagged", async () => {
    const dir = await make("cn-gen", { "src/api.gen.ts": "x" });
    expect(await ids(dir)).toContain("mark-generated-code");

    const marked = await make("cn-gen-ok", {
      "src/api.gen.ts": "x",
      ".gitattributes": "*.gen.ts linguist-generated\n",
    });
    expect(await ids(marked)).not.toContain("mark-generated-code");
  });

  test("monorepo packages without AGENTS.md", async () => {
    const dir = await make("cn-mono", {
      "packages/a/AGENTS.md": "x",
      "packages/b/index.ts": "x",
    });
    const list = await generateConsiderations(
      dir,
      mockProjectInfo({
        isMonorepo: true,
        packages: ["packages/a", "packages/b"],
      }),
    );
    const c = list.find((x) => x.id === "nested-context-files");
    expect(c?.signal).toContain("1/2");
    expect(c?.signal).toContain("packages/b");
  });

  test("oversized context file", async () => {
    const dir = await make("cn-big", { "AGENTS.md": "x".repeat(40 * 1024) });
    expect(await ids(dir)).toContain("context-file-size");
  });
});
