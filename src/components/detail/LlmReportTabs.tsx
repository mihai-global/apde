"use client";

import { useState, useTransition } from "react";
import { Seg } from "@/components/primitives/Seg";
import { formatDate } from "@/lib/format";
import type { AnalysisThreadRow, StrategicInsight } from "@/lib/types";

type Tab = "report" | "diff" | "oem" | "reviews" | "qa";

interface LlmReportTabsProps {
  insight: StrategicInsight;
  asin: string;
  threads: AnalysisThreadRow[];
  onAsk: (prompt: string) => Promise<void>;
}

export function LlmReportTabs({ insight, asin, threads, onAsk }: LlmReportTabsProps) {
  const [tab, setTab] = useState<Tab>("report");
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (!prompt.trim()) return;
    const value = prompt.trim();
    setPrompt("");
    startTransition(async () => {
      await onAsk(value);
    });
  }

  return (
    <section className="detail-section">
      <div className="section-head">
        <span className="num">06</span>
        <div className="ttl">LLM分析レポート</div>
        <div style={{ flex: 1 }} />
        <div className="muted" style={{ fontSize: 12 }}>
          {insight.model} · {insight.promptVersion} · {formatDate(new Date())}
        </div>
      </div>
      <div className="cluster" style={{ marginBottom: 20 }}>
        <Seg<Tab>
          value={tab}
          options={[
            { value: "report", label: "サマリ" },
            { value: "diff", label: "差別化提案" },
            { value: "oem", label: "OEM改善案" },
            { value: "reviews", label: "低評価示唆" },
            { value: "qa", label: "Q&A" },
          ]}
          onChange={setTab}
        />
      </div>

      {tab === "report" ? (
        <div style={{ maxWidth: 720, fontSize: 14, lineHeight: 1.75, color: "var(--fg-2)" }}>
          <p style={{ marginTop: 0 }}>{insight.report}</p>
        </div>
      ) : null}

      {tab === "diff" ? (
        <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.75, color: "var(--fg-2)" }}>
          {insight.differentiationIdeas.map((idea, i) => (
            <li key={i}>{idea}</li>
          ))}
        </ul>
      ) : null}

      {tab === "oem" ? (
        <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.75, color: "var(--fg-2)" }}>
          {insight.oemSuggestions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      ) : null}

      {tab === "reviews" ? (
        <ol style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.75, color: "var(--fg-2)" }}>
          {insight.reviewInsights.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ol>
      ) : null}

      {tab === "qa" ? (
        <div style={{ maxWidth: 720 }}>
          {threads.length === 0 ? (
            <div style={{ marginBottom: 24, fontSize: 12, color: "var(--fg-4)" }}>
              過去のスレッドはまだありません。{asin} について Gemini に質問できます。
            </div>
          ) : (
            <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              {threads.map((t) => (
                <div key={t.id}>
                  <div style={{ fontSize: 12, color: "var(--fg-4)" }}>{formatDate(t.created_at)}</div>
                  <div style={{ fontSize: 13, fontWeight: 400, marginTop: 4 }}>Q. {t.prompt}</div>
                  <div style={{ fontSize: 13, marginTop: 6, color: "var(--fg-2)" }}>{t.response}</div>
                </div>
              ))}
            </div>
          )}
          <textarea
            className="textarea"
            rows={3}
            placeholder="この商品について Gemini に質問する..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <button className="pill sm" type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? "送信中…" : "送信"} <span className="arrow">›</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
