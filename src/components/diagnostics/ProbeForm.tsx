"use client";

import { useState, useTransition } from "react";

interface ProbeResult {
  asin: string;
  keepa: {
    ok: boolean;
    error?: string;
    title?: string;
    brand?: string;
    pricePoints: number;
    latestPrice?: number;
    durationMs: number;
  };
  llm: {
    ok: boolean;
    provider: string;
    model: string;
    source: "live" | "hybrid" | "mock";
    sampleReport?: string;
    durationMs: number;
  };
}

export function ProbeForm() {
  const [asin, setAsin] = useState("B0CXM7K2PQ");
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runProbe() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/diagnostics/probe?asin=${encodeURIComponent(asin.trim())}`, {
          method: "POST",
          cache: "no-store",
        });
        if (!res.ok) {
          setError(`API returned ${res.status}`);
          return;
        }
        const data = (await res.json()) as ProbeResult;
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <input
          className="input"
          value={asin}
          onChange={(e) => setAsin(e.target.value)}
          placeholder="B0CXM7K2PQ"
          style={{ maxWidth: 280 }}
        />
        <button
          type="button"
          className="pill solid"
          onClick={runProbe}
          disabled={pending || !asin.trim()}
        >
          {pending ? "Probing…" : "Probe"} <span className="arrow">›</span>
        </button>
      </div>

      {error ? (
        <div className="error-banner" role="alert">{error}</div>
      ) : null}

      {result ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div
            style={{
              border: "1px solid var(--border-1)",
              padding: 16,
              borderColor: result.keepa.ok ? "var(--decision-go)" : "var(--decision-no)",
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Keepa {result.keepa.ok ? "✓" : "✕"} ({result.keepa.durationMs}ms)
            </div>
            {result.keepa.ok ? (
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <div><strong>title:</strong> {result.keepa.title ?? "—"}</div>
                <div><strong>brand:</strong> {result.keepa.brand ?? "—"}</div>
                <div><strong>price points:</strong> {result.keepa.pricePoints}</div>
                <div><strong>latest price:</strong> {result.keepa.latestPrice ? `¥${result.keepa.latestPrice.toLocaleString()}` : "—"}</div>
              </div>
            ) : (
              <div style={{ color: "var(--decision-no)", fontSize: 13 }}>
                {result.keepa.error ?? "失敗"}
              </div>
            )}
          </div>

          <div
            style={{
              border: "1px solid var(--border-1)",
              padding: 16,
              borderColor:
                result.llm.source === "live"
                  ? "var(--decision-go)"
                  : result.llm.source === "hybrid"
                    ? "var(--decision-cond)"
                    : "var(--fg-3)",
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              LLM ({result.llm.provider}) {result.llm.ok ? "✓" : "✕"} ({result.llm.durationMs}ms)
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div><strong>source:</strong> {result.llm.source}</div>
              <div><strong>model:</strong> {result.llm.model}</div>
              {result.llm.sampleReport ? (
                <div style={{ marginTop: 8, color: "var(--fg-3)" }}>
                  {result.llm.sampleReport.slice(0, 200)}…
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
