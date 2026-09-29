import { GoogleGenAI, Type } from '@google/genai';

export const onRequestPost: any = async (context: any) => {
  try {
    const { request, env } = context;
    const body = await request.json() as any;
    const { matrixData, employees } = body;

    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    
    const summaryData = matrixData.map((d: any) => ({
      name: d.name,
      role: d.jobFamily || d.role,
      performance: d.performance,
      potential: d.potential,
      box: d.boxIndex
    }));

    const prompt = `
      شما یک مشاور ارشد منابع انسانی (HR) هستید. 
      داده‌های ماتریس ۹ گانه (9-Box Grid):
      ${JSON.stringify(summaryData, null, 2)}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            talentHealthScore: { type: Type.INTEGER },
            boxRecommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  boxId: { type: Type.STRING },
                  boxTitle: { type: Type.STRING },
                  headcount: { type: Type.INTEGER },
                  strategicGuidance: { type: Type.STRING },
                  individualCoachingTips: { type: Type.ARRAY, items: { type: Type.STRING } },
                  recommendedActions: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["boxId", "boxTitle", "strategicGuidance", "individualCoachingTips", "recommendedActions"]
              }
            },
            successionAndRetention: { type: Type.ARRAY, items: { type: Type.STRING } },
            riskInterventions: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["executiveSummary", "talentHealthScore", "boxRecommendations", "successionAndRetention", "riskInterventions"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    return new Response(JSON.stringify(parsed), { headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
