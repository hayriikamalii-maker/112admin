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

    const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
    let lastMessage = "Gemini yanıt vermedi.";
    let lastStatus = 422;

    for (const model of models) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90_000);
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 32768 },
            }),
            signal: controller.signal,
          });
          const data = await response.json().catch(() => null);
          if (response.ok) {
            const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
            if (text.trim()) return json({ ok: true, text, model, attempt });
            lastMessage = `${model} boş yanıt döndürdü.`;
            lastStatus = 422;
          } else {
            lastMessage = data?.error?.message || `${model} HTTP ${response.status}`;
            lastStatus = response.status === 429 ? 429 : response.status >= 500 ? 503 : 422;
            if (![429, 500, 502, 503, 504].includes(response.status)) break;
          }
        } catch (error) {
          lastMessage = error?.name === "AbortError" ? `${model} yanıt süresini aştı.` : `${model}: ${error instanceof Error ? error.message : "bağlantı kurulamadı"}`;
          lastStatus = 504;
        } finally {
          clearTimeout(timeout);
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
    return json({ ok: false, message: lastMessage }, lastStatus);
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : "Gemini planlama bağlantısı kurulamadı." }, 500);
  }
}
