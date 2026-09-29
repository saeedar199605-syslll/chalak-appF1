import { GoogleGenAI, Type } from '@google/genai';

export const onRequestPost: any = async (context: any) => {
  try {
    const { request, env } = context;
    const body = await request.json() as any;
    const { employeeName, jobTitle, supervisorComment, competencyScores } = body;

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    let scoresContext = '';
    if (competencyScores) {
       scoresContext = `
Competency Scores:
- Knowledge/Quantitative (K): ${competencyScores.K || 'N/A'}/5
- Quality (Q): ${competencyScores.Q || 'N/A'}/5
- Behavior (B): ${competencyScores.B || 'N/A'}/5
- Skill/Safety (S): ${competencyScores.S || 'N/A'}/5
- Leadership (L): ${competencyScores.L || 'N/A'}/5
`;
    }

    const prompt = `
You are an expert HR Performance Coach and AI Assistant.
Your task is to refine a supervisor's raw comment about an employee into professional, constructive, and actionable feedback.

Employee Name: ${employeeName || 'Unknown'}
Job Title: ${jobTitle || 'Unknown'}
${scoresContext}

Supervisor's Raw Comment:
"${supervisorComment}"

Language: Persian (Farsi).
Ensure the tone is constructive, empathetic, and professional.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            refinedComment: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            actionPlan: { type: Type.ARRAY, items: { type: Type.STRING } },
            competencyFeedback: {
              type: Type.OBJECT,
              properties: {
                quantitative: { type: Type.STRING },
                quality: { type: Type.STRING },
                behavioral: { type: Type.STRING },
                safetyHse: { type: Type.STRING },
                leadershipTeam: { type: Type.STRING }
              },
              required: ["quantitative", "quality", "behavioral", "safetyHse", "leadershipTeam"]
            }
          },
          required: ["refinedComment", "strengths", "actionPlan", "competencyFeedback"]
        }
      }
    });

    let resultJson;
    try {
      resultJson = JSON.parse(response.text);
    } catch (e) {
      resultJson = { 
        refinedComment: response.text,
        strengths: [],
        actionPlan: [],
        competencyFeedback: { quantitative: "", quality: "", behavioral: "", safetyHse: "", leadershipTeam: "" }
      };
    }

    return new Response(JSON.stringify(resultJson), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Gemini Feedback API Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
