import { Zap } from "lucide-react";

export default function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return null;

  const className =
    score >= 75
      ? "bg-green-500/10 text-green-300 border-green-700/50"
      : score >= 50
      ? "bg-amber-500/10 text-amber-300 border-amber-700/50"
      : "bg-red-500/10 text-red-300 border-red-700/50";

  return (
    <span className={`badge ${className}`}>
      <Zap className="w-3 h-3" /> {score}/100
    </span>
  );
}
