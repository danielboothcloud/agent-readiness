import { HARNESS_LABELS, type Consideration } from "../types";
import HarnessAdviceList from "./HarnessAdviceList";

interface Props {
  considerations?: Consideration[];
}

/** Unscored, signal-driven suggestions (custom packages, guards, rules). */
export default function ConsiderationList({ considerations }: Props) {
  if (!considerations || considerations.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
        Considerations
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Triggered by what's in this repo. Not scored.
      </p>
      <div className="space-y-3">
        {considerations.map((c) => (
          <div
            key={c.id}
            className="bg-surface-card border border-surface-border rounded-xl p-4"
          >
            <h3 className="text-sm font-semibold text-white mb-1">{c.title}</h3>
            <p className="text-xs text-cyan-400 mb-1">{c.signal}</p>
            <p className="text-sm text-gray-400">{c.description}</p>
            <HarnessAdviceList advice={c.harnessAdvice} labels={HARNESS_LABELS} />
          </div>
        ))}
      </div>
    </div>
  );
}
