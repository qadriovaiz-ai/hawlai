import { Zap } from "lucide-react";

export default function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return null;

  const className =
    score >= 75
      ? "bg-green-50 text-green-700 border-green-200"
      : score >= 50
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200";

  return (
    <span className={`badge ${className}`}>
      <Zap className="w-3 h-3" /> {score}/100
    </span>
  );
}
