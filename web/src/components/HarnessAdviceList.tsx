import type { HarnessAdvice, HarnessId } from "../types";

interface Props {
  advice?: HarnessAdvice[];
  labels: Record<HarnessId, string>;
}

/** Per-harness how-to lines (pi first) under a recommendation or consideration. */
export default function HarnessAdviceList({ advice, labels }: Props) {
  if (!advice || advice.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {advice.map((a) => (
        <li key={a.harness} className="text-xs text-gray-300">
          <span className="text-fuchsia-400 font-semibold">{labels[a.harness]}:</span>{" "}
          {a.advice}
        </li>
      ))}
    </ul>
  );
}
