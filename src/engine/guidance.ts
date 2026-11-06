/**
 * Pillar-level guidance for the checklist: why each area matters for agents and
 * open questions to revisit, whatever the current score. Keys MUST match pillar
 * IDs in src/pillars (tested).
 */

export interface PillarGuidance {
  why: string;
  explore: string[];
}

export const PILLAR_GUIDANCE: Record<string, PillarGuidance> = {
  "style-linting": {
    why: "Agents copy what they see and fix what they're told. Linters, formatters and type checkers turn the team's taste into fast, mechanical feedback, so style stops being a review topic and mistakes surface before anyone reads the diff.",
    explore: [
      "Which review comments are really about style or types, and could a tool make them unnecessary?",
      "How quickly does the agent hear about a lint or type error: the same turn, at commit, or in CI?",
    ],
  },
  testing: {
    why: "Tests are how an agent learns whether its change worked. Without a fast, trustworthy suite it can only guess, and every guess becomes something a human has to verify by hand.",
    explore: [
      "If an agent changed the riskiest part of this codebase, what would tell you it broke something?",
      "How long does the agent wait to find out, and could the slow parts run less often?",
    ],
  },
  documentation: {
    why: "Docs carry the context code can't: why things are the way they are, how to work here, who owns what. Agents start every session with no memory, so anything that isn't written down gets rediscovered or guessed.",
    explore: [
      "What would a capable newcomer get wrong in their first week here?",
      "Which docs are out of date, and how would anyone notice?",
    ],
  },
  "dev-environment": {
    why: "An agent can only verify its work in an environment that installs and runs reliably. Every 'works on my machine' gap becomes a failed check the agent can't explain.",
    explore: [
      "How long from a fresh clone to green tests, and which steps rely on someone remembering them?",
      "What does this project need beyond the code (services, secrets, tool versions), and is that written down or automated?",
    ],
  },
  "ci-cd": {
    why: "CI is the backstop that holds every change to the same bar, however it was written. For agent-written changes it is often the first independent check, so it should cover what you actually care about.",
    explore: [
      "Which problems has CI missed that reached review or production?",
      "Which checks run locally but not in CI, or the other way round?",
    ],
  },
  "code-health": {
    why: "Agents extend whatever they find. Stale dependencies, dead code and bloated bundles get copied and built on unless something makes them visible.",
    explore: [
      "Which parts of the codebase would you rather an agent didn't learn from?",
      "How would you notice the codebase getting worse over time?",
    ],
  },
  security: {
    why: "Agents work fast and in bulk, which makes it easy to slip in a vulnerable dependency, a leaked secret or an unsafe pattern. Automated checks catch these at a volume people can't review by eye.",
    explore: [
      "What's the most damaging thing that could leak or be introduced through a change here?",
      "Which security checks would you trust to run unattended on agent-written changes?",
    ],
  },
  architecture: {
    why: "Without a declared and enforced structure, each agent session invents its own, and the codebase drifts. Writing the methodology down and checking it mechanically keeps new code where it belongs.",
    explore: [
      "If an agent added a feature tomorrow, how would it decide where the code goes?",
      "Which structural rules are only enforced by someone noticing in review?",
    ],
  },
  context: {
    why: "This is the agent's view of the repo: what it's told, what it can reach, what it's allowed to do, and how quickly it hears about mistakes. It changes faster than any other area as the team's tools and workflows evolve, so revisit it regularly.",
    explore: [
      "What do you still do by hand for the agent that a context file, tool, guardrail or feedback loop could do instead?",
      "What has changed in how the team works with agents since you last looked at this setup?",
    ],
  },
};
