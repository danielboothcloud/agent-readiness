import type {
  Pillar,
  ProjectInfo,
  CriterionResult,
  LLMClient,
  ProjectWorkspaceInfo,
} from "../types/index.js";
import path from "node:path";
import { type CriterionPaths, resolveMappedPaths } from "./paths.js";

export type OnPillarStart = (pillar: Pillar) => void;
export type OnPillarComplete = (
  pillar: Pillar,
  results: CriterionResult[],
) => void;

export interface AnalysisEngineOptions {
  aiEnabled?: boolean;
  llmClient?: LLMClient;
  onPillarStart?: OnPillarStart;
  onPillarComplete?: OnPillarComplete;
  /** Per-criterion directories/files from `paths:` in .agent-profile.yml. */
  criterionPaths?: CriterionPaths;
}

export class AnalysisEngine {
  private pillars: Pillar[];
  private repoPath: string;
  private projectInfo: ProjectInfo;
  private aiEnabled: boolean;
  private llmClient?: LLMClient;
  private onPillarStart?: OnPillarStart;
  private onPillarComplete?: OnPillarComplete;
  private criterionPaths: CriterionPaths;

  constructor(
    pillars: Pillar[],
    repoPath: string,
    projectInfo: ProjectInfo,
    options?: AnalysisEngineOptions,
  ) {
    this.pillars = pillars;
    this.repoPath = repoPath;
    this.projectInfo = projectInfo;
    this.aiEnabled = options?.aiEnabled ?? false;
    this.llmClient = options?.llmClient;
    this.onPillarStart = options?.onPillarStart;
    this.onPillarComplete = options?.onPillarComplete;
    this.criterionPaths = options?.criterionPaths ?? {};
  }

  async run(): Promise<Map<string, CriterionResult[]>> {
    const allResults = new Map<string, CriterionResult[]>();

    // Run pillars sequentially so we can report progress per pillar
    for (const pillar of this.pillars) {
      this.onPillarStart?.(pillar);

      // Run criteria within a pillar concurrently
      const criteriaResults = await Promise.all(
        pillar.criteria.map((criterion) => this.runCriterion(criterion)),
      );

      allResults.set(pillar.id, criteriaResults);
      this.onPillarComplete?.(pillar, criteriaResults);
    }

    return allResults;
  }

  private async runCriterion(
    criterion: Pillar["criteria"][number],
  ): Promise<CriterionResult> {
    // Skip LLM-required criteria when AI is not enabled
    if (criterion.requiresLLM && !this.aiEnabled) {
      return {
        criterionId: criterion.id,
        pass: false,
        message: "Requires --ai flag",
        skipped: true,
      };
    }

    try {
      const rootResult = await criterion.check(
        this.repoPath,
        this.projectInfo,
        this.llmClient,
      );
      if (rootResult.pass) return rootResult;

      for (const workspace of this.projectInfo.workspaces) {
        const workspaceResult = await criterion.check(
          path.resolve(this.repoPath, workspace.path),
          this.workspaceProjectInfo(workspace),
          this.llmClient,
        );
        if (workspaceResult.pass) {
          return {
            ...workspaceResult,
            message: `[${workspace.name}] ${workspaceResult.message}`,
          };
        }
      }

      return await this.checkMappedPaths(criterion, rootResult);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        criterionId: criterion.id,
        pass: false,
        message: `Check failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Last resort before failing: the user mapped this criterion to paths in
   * .agent-profile.yml. A mapped file counts as evidence; a mapped directory
   * gets the check run inside it.
   */
  private async checkMappedPaths(
    criterion: Pillar["criteria"][number],
    rootResult: CriterionResult,
  ): Promise<CriterionResult> {
    const entries = this.criterionPaths[criterion.id];
    if (!entries || entries.length === 0) return rootResult;

    const { dirs, files, missing } = await resolveMappedPaths(
      this.repoPath,
      entries,
    );

    if (files.length > 0) {
      return {
        criterionId: criterion.id,
        pass: true,
        message: `Mapped in .agent-profile.yml: ${files.join(", ")}`,
      };
    }

    for (const dir of dirs) {
      const result = await criterion.check(
        path.resolve(this.repoPath, dir),
        { ...this.projectInfo, isMonorepo: false, packages: [], workspaces: [] },
        this.llmClient,
      );
      if (result.pass) {
        return { ...result, message: `[${dir}] ${result.message}` };
      }
    }

    const notes = [
      dirs.length > 0 ? `checked mapped dirs: ${dirs.join(", ")}` : "",
      missing.length > 0 ? `mapped paths not found: ${missing.join(", ")}` : "",
    ].filter(Boolean);
    return {
      ...rootResult,
      message: `${rootResult.message} (paths in .agent-profile.yml — ${notes.join("; ")})`,
    };
  }

  private workspaceProjectInfo(workspace: ProjectWorkspaceInfo): ProjectInfo {
    return {
      detectedTypes: workspace.detectedTypes,
      isMonorepo: false,
      packages: [],
      workspaces: [],
      knowledge: [...this.projectInfo.knowledge, ...workspace.knowledge],
      harnesses: this.projectInfo.harnesses,
      harnessSource: this.projectInfo.harnessSource,
    };
  }
}
