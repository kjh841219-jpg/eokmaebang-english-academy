const OPENAI_API_URL = "https://api.openai.com/v1/responses";

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "POST 요청만 사용할 수 있습니다." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(res, 500, {
      error: "Vercel 환경변수 OPENAI_API_KEY가 아직 설정되지 않았습니다."
    });
  }

  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const student = payload.student || {};
    const attendance = payload.attendance || [];
    const memo = payload.memo || "";

    const prompt = `
너는 벌교미래엔영어학원의 초등 영어 학습 상담 교사이다.
아래 학생 정보를 바탕으로 학부모님께 보낼 수 있는 따뜻하고 구체적인 학습 보고서를 작성하라.

[학원 기본정보]
- 학원명: 벌교미래엔영어학원
- 대상: 초등학교 1~6학년
- 과목: 영어

[학생정보]
- 이름: ${student.name || "학생"}
- 학년: ${student.grade || "-"}
- 반: ${student.className || "-"}
- 영어 레벨: ${student.level || "-"}
- 최근 출결: ${attendance.map(a => `${a.date} ${a.status}`).join(", ") || "기록 없음"}
- 선생님 메모: ${memo || "특이사항 없음"}

[출력 형식]
1. 이번 주 학습 요약
2. 잘한 점 3가지
3. 보완할 점 2가지
4. 다음 주 학습 목표
5. 학부모님께 드리는 안내문

조건:
- 불안감을 주지 말고 가능성을 먼저 말할 것
- 초등 학부모님이 이해하기 쉬운 말로 쓸 것
- 카카오톡으로 보내도 어색하지 않게 쓸 것
`;

    const aiRes = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5",
        input: prompt,
        max_output_tokens: 900,
        reasoning: { effort: "minimal" },
        text: { verbosity: "low" }
      })
    });

    const data = await aiRes.json();
    if (!aiRes.ok) {
      return json(res, aiRes.status, {
        error: data.error?.message || "OpenAI API 호출 중 오류가 발생했습니다."
      });
    }

    return json(res, 200, {
      report: extractResponseText(data) || "보고서 내용을 불러오지 못했습니다."
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "서버 처리 중 오류가 발생했습니다." });
  }
}

function extractResponseText(result) {
  if (typeof result?.output_text === "string" && result.output_text.trim()) {
    return result.output_text.trim();
  }

  const parts = [];
  for (const item of result?.output || []) {
    if (typeof item?.text === "string") parts.push(item.text);
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
      if (typeof content?.content === "string") parts.push(content.content);
    }
  }

  for (const choice of result?.choices || []) {
    const text = choice?.message?.content || choice?.text;
    if (typeof text === "string") parts.push(text);
  }

  return parts.join("\n").trim();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
