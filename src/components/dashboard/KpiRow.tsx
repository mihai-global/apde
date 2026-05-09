interface KpiCardProps {
  label: string;
  value: number | string;
  unit?: string;
  sub?: string;
  tone?: "go" | "cond" | "default";
}

export function KpiCard({ label, value, unit, sub, tone = "default" }: KpiCardProps) {
  const cls = `kpi${tone === "go" ? " go" : tone === "cond" ? " cond" : ""}`;
  return (
    <div className={cls}>
      <div className="label">{label}</div>
      <div className="val num">
        {value}
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

interface KpiRowProps {
  cards: KpiCardProps[];
}

export function KpiRow({ cards }: KpiRowProps) {
  return (
    <div className="kpi-row">
      {cards.map((card, i) => (
        <KpiCard key={i} {...card} />
      ))}
    </div>
  );
}
