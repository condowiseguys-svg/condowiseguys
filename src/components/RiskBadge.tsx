export type Risk = "red" | "amber" | "green";

const styles: Record<Risk, string> = {
  red: "bg-red-50 text-risk-red ring-red-200",
  amber: "bg-amber-50 text-risk-amber ring-amber-200",
  green: "bg-emerald-50 text-risk-green ring-emerald-200",
};

const labels: Record<Risk, string> = { red: "Red", amber: "Amber", green: "Green" };

export function RiskBadge({ risk }: { risk: Risk }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${styles[risk]}`}
    >
      {labels[risk]}
    </span>
  );
}
