// Gemini API キーがアクセス可能なモデル一覧を取得する診断エンドポイント。
// REST API (https://generativelanguage.googleapis.com/v1beta/models?key=...) を直接叩く。
import { env, mockMode } from "@/lib/env";

export const runtime = "nodejs";

interface ModelInfo {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
  description?: string;
}

export async function GET(): Promise<Response> {
  if (mockMode.llm || !env.llm.geminiApiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY が未設定 (mockMode.llm = true)" },
      { status: 503 },
    );
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(env.llm.geminiApiKey)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: `Status ${res.status}`, body: text.slice(0, 500) },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { models?: ModelInfo[] };
    const all = data.models ?? [];
    // generateContent をサポートするモデルのみ抽出 (我々が使うのはこれ)
    const supported = all.filter((m) =>
      (m.supportedGenerationMethods ?? []).includes("generateContent"),
    );
    return Response.json(
      {
        total: all.length,
        supported: supported.map((m) => ({
          // "models/gemini-1.5-flash-latest" → "gemini-1.5-flash-latest"
          id: m.name.replace(/^models\//, ""),
          name: m.name,
          displayName: m.displayName,
          description: m.description?.slice(0, 200),
        })),
      },
      { status: 200 },
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
