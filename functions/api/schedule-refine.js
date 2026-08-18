const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const apiKey = String(body.apiKey || context.env.GEMINI_API_KEY || "").trim();
    const prompt = String(body.prompt || "").trim();
    if (!apiKey) return json({ ok: false, message: "Gemini API anahtarı eksik." }, 400);
    if (!prompt) return json({ ok: false, message: "Nöbet planlama verisi eksik." }, 400);
    if (prompt.length > 900_000) return json({ ok: false, message: "Planlama verisi Gemini sınırını aşıyor." }, 413);

    const model = "gemini-2.5-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 16384,
        },
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return json({ ok: false, message: data?.error?.message || `${model} HTTP ${response.status}` }, 502);
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    if (!text.trim()) return json({ ok: false, message: "Gemini boş yanıt döndürdü." }, 502);
    return json({ ok: true, text, model });
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : "Gemini planlama bağlantısı kurulamadı." }, 500);
  }
}
