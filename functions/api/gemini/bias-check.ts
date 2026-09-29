import { GoogleGenAI, Type } from '@google/genai';

export const onRequestPost: any = async (context: any) => {
  try {
    const { request, env } = context;
    const body = await request.json() as any;
    const { employeeName, jobTitle, period, note, scores } = body;

    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const prompt = `
      شما یک متخصص ارشد روانشناسی سازمانی، داوری عملکرد و ممیزی سوگیری‌های رفتاری در فرآیندهای ارزیابی عملکرد کارکنان هستید.
      اطلاعات پرونده ارزیابی:
      - نام ارزیابی‌شونده: ${employeeName || 'همکار'}
      - عنوان شغلی: ${jobTitle || 'پرسنل'}
      - دوره: ${period || 'جاری'}
      توضیحات و یادداشت ثبت‌شده توسط سرپرست/مدیر:
      """
      ${note || '(هیچ یادداشتی نوشته نشده است)'}
      """
      ماتریس نمرات ثبت‌شده توسط سرپرست (مقیاس ۱ تا ۵):
      ${(scores || []).map((s: any) => `- [${s.code || 'Criterion'}] ${s.name || ''}: امتیاز ${s.value} از ۵ | خودارزیابی کارمند: ${s.self || '-'} | مستند ثبت‌شده: ${s.doc || 'ندارد'}`).join('\n')}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are an HR Bias & Ethics auditor. Respond with JSON.",
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            integrityScore: { type: Type.INTEGER },
            hasWarnings: { type: Type.BOOLEAN },
            biasesDetected: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  title: { type: Type.STRING },
                  severity: { type: Type.STRING },
                  description: { type: Type.STRING },
                  highlightSnippet: { type: Type.STRING }
                },
                required: ["type", "title", "severity", "description"]
              }
            },
            suggestedRevision: { type: Type.STRING },
            coachingAdvice: { type: Type.STRING }
          },
          required: ["integrityScore", "hasWarnings", "biasesDetected", "suggestedRevision", "coachingAdvice"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    parsed.analyzedAt = new Date().toISOString();
    return new Response(JSON.stringify(parsed), { headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
