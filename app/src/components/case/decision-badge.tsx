import type { ComponentProps } from "react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { DECISION_STATUSES, type DecisionStatus } from "@/lib/domain";

/*
 * Solid fills per status; every pair reaches WCAG AA 4.5:1 for small text:
 * - ACCEPTED: white on #287A4C = 5.28:1. Darker shade of c10-success
 *   (#2E8B57, same hue), which gives only 4.25:1 with white.
 * - REJECTED: white on c10-danger #C0392B = 5.44:1.
 * - MANUAL_REVIEW: white on c10-ink-600 #4D4D4D = 8.45:1.
 * - NEEDS_INFO: #4D4D4D on c10-amber-500 #FFB702 = 4.84:1.
 */
const STATUS_CLASSES: Record<DecisionStatus, string> = {
  ACCEPTED: "bg-[#287a4c] text-white",
  REJECTED: "bg-destructive text-destructive-foreground",
  MANUAL_REVIEW: "bg-foreground text-white",
  NEEDS_INFO: "bg-primary text-primary-foreground",
};

type DecisionBadgeProps = Omit<ComponentProps<typeof Badge>, "children" | "variant"> & {
  status: DecisionStatus;
};

/** Decision status badge: the Polish label is always shown, never color alone. */
export function DecisionBadge({ status, className, ...props }: DecisionBadgeProps) {
  return (
    <Badge
      data-status={status}
      className={cn("font-semibold", STATUS_CLASSES[status], className)}
      {...props}
    >
      {DECISION_STATUSES[status]}
    </Badge>
  );
}
