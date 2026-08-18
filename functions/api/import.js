const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

const prompt = `Bu görsel bir 112 ASHİ aylık personel/görevlendirme tablosudur.
Tablodaki HER PERSONEL SATIRINI oku; başlıkları ve boş satırları alma. Türkçe karakterleri koru ve yalnızca JSON array döndür.
Kolonlar: AD SOYAD, UNVAN, G.GÖREV DURUMU, İZİNLER, GEÇİCİ GÖREV TARİHLERİ, YOLLUK DURUMU.
Kırmızı renkli veya GEÇİCİ GÖREVDE yazan satırları kesinlikle atlama. Bu kişiler assignmentStatus alanında GEÇİCİ GÖREVDE olarak dönmeli.
AABT=Paramedik, SRC AABT=Sürücü Paramedik, SRC ATT=Sürücü ATT, SÜREKLİ İŞÇİ=Sürücü ve 4D İşçi.
Şu alanları kullan: fullName, title, cadre, annualLeaveDays, leaveNote, assignmentStatus, temporaryAssignmentDates, allowance.`;

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const apiKey = String(body.apiKey || context.env.GEMINI_API_KEY || "").trim();
    const imageData = String(body.imageData || "");
    const mimeType = String(body.mimeType || "image/png");
    if (!apiKey) return json({ ok: false, message: "Gemini API anahtarı eksik." }, 400);
    if (!imageData) return json({ ok: false, message: "Görsel verisi eksik." }, 400);

    const payload = {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageData } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 16384 },
    };
    const models = ["gemini-2.5-flash", "gemini-2.0-flash"];
    let lastError = "Gemini yanıt vermedi.";
    for (const model of models) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        lastError = data?.error?.message || `${model} HTTP ${response.status}`;
        continue;
      }
      const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
      if (text) return json({ ok: true, text, model });
      lastError = `${model} boş yanıt döndürdü.`;
    }
    return json({ ok: false, message: lastError }, 502);
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : "Sunucu görsel okuma hatası." }, 500);
  }
}
