export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const { employeeName, jobTitle, period, scores, note } = body;

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
       return new Response(JSON.stringify({ error: "کلید API هوش مصنوعی در سرور یافت نشد." }), { status: 500 });
    }

    const prompt = `
      شما به عنوان یک مربی توسعه فردی (IDP) حرفه ای عمل می کنید.
      بر اساس اطلاعات زیر، بازخورد و برنامه توسعه فردی بنویسید:
      - نام: ${employeeName}
      - عنوان: ${jobTitle}
      - دوره: ${period}

      نمرات:
      ${scores.map(s => `- شاخص [${s.code}] ${s.name} | سیستم: ${s.value} خودارزیابی: ${s.self} سند: ${s.doc || 'ندارد'}`).join('\n')}

      یادداشت سرپرست: "${note || 'ندارد'}"

      خروجی باید دقیقاً یک JSON با فیلدهای زیر باشد (بدون کد بلاک اضافی):
      {"strengths": ["..."], "developmentAreas": ["..."], "actionItems": ["..."], "summary": "..."}
    `;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    };

    const response = await fetch(geminiUrl, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (data.error) {
        throw new Error(data.error.message);
    }

    const textResult = data.candidates[0].content.parts[0].text;
    const parsedData = JSON.parse(textResult.trim());

    return new Response(JSON.stringify({ feedback: parsedData }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'خطا در ارتباط با هوش مصنوعی', details: error.message }), { status: 500 });
  }
}
