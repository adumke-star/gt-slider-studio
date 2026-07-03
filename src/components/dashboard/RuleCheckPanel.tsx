import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  MANUAL_RULES,
  evaluateRaceRules,
  hasRuleViolations,
  type RuleViolation,
  type SeriesSeasonInfo,
} from "@/lib/rules";
import type { SliderSection } from "./RaceCard";
import type { SliderImage } from "./ImageCell";

export function RuleCheckPanel({
  raceId,
  sections,
  images,
  seasonInfo,
  canEdit,
}: {
  raceId: string;
  sections: SliderSection[];
  images: SliderImage[];
  seasonInfo?: SeriesSeasonInfo;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const violations = useMemo(
    () => evaluateRaceRules({ sections, images, seasonInfo }),
    [sections, images, seasonInfo],
  );
  const hasViolations = hasRuleViolations(violations);
  const openManual = MANUAL_RULES.filter((r) => !checkedKeys.has(r.key)).length;

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("race_rule_checks")
        .select("rule_key")
        .eq("race_id", raceId);
      if (alive) setCheckedKeys(new Set((data ?? []).map((r) => r.rule_key)));
    })();
    return () => {
      alive = false;
    };
  }, [raceId]);

  async function toggleManual(ruleKey: string) {
    if (!canEdit || savingKey) return;
    setSavingKey(ruleKey);
    try {
      if (checkedKeys.has(ruleKey)) {
        await supabase.from("race_rule_checks").delete().eq("race_id", raceId).eq("rule_key", ruleKey);
        setCheckedKeys((prev) => {
          const n = new Set(prev);
          n.delete(ruleKey);
          return n;
        });
      } else {
        const { data: u } = await supabase.auth.getUser();
        await supabase.from("race_rule_checks").insert({
          race_id: raceId,
          rule_key: ruleKey,
          checked_by: u.user?.id ?? null,
        });
        setCheckedKeys((prev) => new Set(prev).add(ruleKey));
      }
    } finally {
      setSavingKey(null);
    }
  }

  const allGood = !hasViolations && openManual === 0;

  return (
    <div
      className={cn(
        "rounded-md border",
        hasViolations ? "border-destructive/50 bg-destructive/5" : "border-border bg-background/40",
      )}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        {allGood ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--status-live)]" />
        ) : (
          <ShieldAlert className={cn("h-4 w-4 shrink-0", hasViolations ? "text-destructive" : "text-muted-foreground")} />
        )}
        <span className="font-bold uppercase tracking-wider">Rule check</span>
        <span className="text-muted-foreground">
          {allGood
            ? "all rules passed"
            : [
                hasViolations
                  ? `${violations.filter((v) => v.severity !== "info").length} issue${violations.filter((v) => v.severity !== "info").length === 1 ? "" : "s"}`
                  : null,
                openManual > 0 ? `${openManual} manual check${openManual === 1 ? "" : "s"} open` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/60 px-3 py-3">
          <div className="space-y-1.5">
            {violations.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-live)]" />
                No automatic rule violations.
              </div>
            ) : (
              violations.map((v) => <ViolationRow key={v.key} violation={v} />)
            )}
          </div>

          <div className="space-y-1.5 border-t border-border/60 pt-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Manual checks (rules 8/9)
            </div>
            {MANUAL_RULES.map((rule) => {
              const checked = checkedKeys.has(rule.key);
              return (
                <label
                  key={rule.key}
                  className={cn(
                    "flex items-start gap-2 text-xs",
                    canEdit ? "cursor-pointer" : "cursor-default",
                    checked ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canEdit || savingKey === rule.key}
                    onChange={() => toggleManual(rule.key)}
                    className="mt-0.5 h-3.5 w-3.5 accent-[var(--primary)]"
                  />
                  <span className={cn(checked && "line-through")}>
                    Rule {rule.rule}: {rule.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ViolationRow({ violation }: { violation: RuleViolation }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {violation.severity === "error" ? (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
      ) : violation.severity === "warning" ? (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FACC15]" />
      ) : (
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className={cn(violation.severity === "info" && "text-muted-foreground")}>{violation.message}</span>
    </div>
  );
}
