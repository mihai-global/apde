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

interface ModelsListResult {
  total?: number;
  supported?: Array<{ id: string; displayName?: string; description?: string }>;
  error?: string;
}

interface SearchProbeResult {
  ok?: boolean;
  status?: number;
  url?: string;
  durationMs?: number;
  responseKeys?: string[];
  productsCount?: number;
  asinListCount?: number;
  sampleAsins?: string[];
  tokensConsumed?: number;
  tokensLeft?: number;
  rawHead?: string;
  error?: string;
}

export function ProbeForm() {
  const [asin, setAsin] = useState("B0CXM7K2PQ");
  const [searchTerm, setSearchTerm] = useState("デスク 整理");
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelsListResult | null>(null);
  const [searchProbe, setSearchProbe] = useState<SearchProbeResult | null>(null);
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

  function listModels() {
    setError(null);
    setModels(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/diagnostics/list-models", { cache: "no-store" });
        const data = (await res.json()) as ModelsListResult;
        setModels(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function runSearchProbe() {
    setError(null);
    setSearchProbe(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/diagnostics/search-probe?term=${encodeURIComponent(searchTerm.trim())}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as SearchProbeResult;
        setSearchProbe(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
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
          {pending ? "Probing…" : "ASIN Probe"} <span className="arrow">›</span>
        </button>
        <button type="button" className="pill" onClick={listModels} disabled={pending}>
          {pending ? "List…" : "Gemini モデル一覧"} <span className="arrow">›</span>
        </button>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className="input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="デスク 整理"
          style={{ maxWidth: 280 }}
        />
        <button
          type="button"
          className="pill"
          onClick={runSearchProbe}
          disabled={pending || !searchTerm.trim()}
        >
          {pending ? "Search…" : "Keepa Search Probe"} <span className="arrow">›</span>
        </button>
      </div>

      {searchProbe ? (
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            border: "1px solid var(--border-1)",
            borderColor: searchProbe.ok ? "var(--decision-go)" : "var(--decision-no)",
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Keepa Search 生レスポンス
          </div>
          <div>
            <strong>Status:</strong> {searchProbe.status ?? "—"} ({searchProbe.durationMs} ms)
          </div>
          {searchProbe.error ? (
            <div style={{ color: "var(--decision-no)" }}>
              <strong>Error:</strong> {searchProbe.error}
            </div>
          ) : null}
          <div>
            <strong>Response keys:</strong>{" "}
            <span className="mono">{searchProbe.responseKeys?.join(", ") ?? "—"}</span>
          </div>
          <div>
            <strong>products[]:</strong> {searchProbe.productsCount ?? "—"} 件 ·{" "}
            <strong>asinList[]:</strong> {searchProbe.asinListCount ?? "—"} 件
          </div>
          {searchProbe.sampleAsins && searchProbe.sampleAsins.length > 0 ? (
            <div>
              <strong>Sample ASINs:</strong>{" "}
              <span className="mono">{searchProbe.sampleAsins.join(", ")}</span>
            </div>
          ) : null}
          <div>
            <strong>Tokens:</strong> 消費 {searchProbe.tokensConsumed ?? "—"} / 残{" "}
            {searchProbe.tokensLeft ?? "—"}
          </div>
          {searchProbe.rawHead ? (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", color: "var(--fg-3)" }}>raw response (head 800 chars)</summary>
              <pre
                className="mono"
                style={{
                  marginTop: 8,
                  padding: 8,
                  background: "var(--bg-3)",
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {searchProbe.rawHead}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="error-banner" role="alert">{error}</div>
      ) : null}

      {models ? (
        models.error ? (
          <div className="error-banner" role="alert" style={{ marginBottom: 16 }}>
            {models.error}
          </div>
        ) : (
          <div
            style={{
              marginBottom: 16,
              padding: 16,
              border: "1px solid var(--border-1)",
              maxHeight: 240,
              overflow: "auto",
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              利用可能モデル ({models.supported?.length ?? 0} / 全 {models.total ?? 0})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4, fontSize: 12, fontFamily: "var(--font-mono)" }}>
              {(models.supported ?? []).map((m) => (
                <div key={m.id}>
                  <strong style={{ fontFamily: "var(--font-mono)" }}>{m.id}</strong>
                  {m.displayName ? <span className="muted"> — {m.displayName}</span> : null}
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 12 }}>
              一覧から好きな ID をコピーして Vercel env <code>GEMINI_MODEL</code> に設定 → Redeploy。
            </div>
          </div>
        )
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
