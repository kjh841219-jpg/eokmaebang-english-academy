const OPENAI_API_URL = "https://api.openai.com/v1/responses";

function extractResponseText(result) {
  if (typeof result?.output_text === "string" && result.output_text.trim()) return result.output_text.trim();
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

function parseJsonText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("AI 응답이 비어 있습니다.");
  try {
    return JSON.parse(trimmed);
  } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
  throw new Error("AI 응답을 JSON으로 해석하지 못했습니다.");
}

export function fallbackHomeworkResult(payload = {}, reason = "") {
  const student = payload.student || {};
  return {
    ok: true,
    source: "fallback",
    title: payload.title || "숙제 사진 분석",
    student_name: student.name || "학생",
    subject: payload.subject || "",
    total_questions: 0,
    correct_count: 0,
    score: 0,
    items: [],
    summary: "사진 분석 API 연결이 원활하지 않아 자동 채점 결과를 확정하지 못했습니다.",
    feedback: `사진 속 문제와 학생 답안을 선생님이 다시 확인해 주세요.${reason ? `\n오류: ${reason}` : ""}`,
    parent_feedback: `${student.name || "학생"} 학생의 숙제 사진이 제출되었습니다. 사진 판독이 필요한 상태라 선생님 확인 후 정확한 피드백을 다시 안내드리겠습니다.`,
    needs_review: true
  };
}

export async function analyzeHomeworkPayload(payload = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackHomeworkResult(payload, "OPENAI_API_KEY가 설정되어 있지 않습니다.");

  const images = Array.isArray(payload.images)
    ? payload.images.filter(image => /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image.dataUrl || ""))
    : [];
  if (!images.length) {
    const error = new Error("분석할 숙제 사진이 없습니다.");
    error.statusCode = 400;
    throw error;
  }
  if (images.length > 6) {
    const error = new Error("사진은 한 번에 최대 6장까지 분석할 수 있습니다.");
    error.statusCode = 400;
    throw error;
  }

  const student = payload.student || {};
  const prompt = `
너는 벌교미래엔영어학원의 숙제 채점 및 학생별 피드백 담당 AI 선생님이다.
업로드된 숙제 사진을 보고 문제, 학생 답안, 예상 정답을 최대한 정확히 판독하라.

[중요 원칙]
1. 정답지가 없어도 사진 속 문제를 직접 풀어 예상 정답을 도출한다.
2. 학생 답안이 가려지거나 흐리면 절대 단정하지 말고 "추가 확인 필요"라고 표시한다.
3. 영어 문법, 단어, 리딩, 영작 문제는 원어민 교사 수준으로 오류 없이 판단한다.
4. 학생 피드백은 혼내는 말투가 아니라 무엇을 고치면 좋아지는지 분명하게 쓴다.
5. 학부모 피드백은 따뜻하지만 구체적으로, 모바일 문자/카카오톡으로 읽기 좋게 작성한다.

[학생 및 숙제 정보]
- 학생명: ${student.name || "학생"}
- 반/학년: ${student.classGroup || student.grade || "-"}
- 숙제명: ${payload.title || "-"}
- 과목/교재: ${payload.subject || "-"}
- 선생님 메모: ${payload.memo || "-"}

[반환 형식]
반드시 JSON 객체만 반환하라. 마크다운 설명은 금지한다.
{
  "title": "숙제명",
  "student_name": "학생명",
  "subject": "과목/교재",
  "total_questions": 숫자,
  "correct_count": 숫자,
  "score": 숫자,
  "items": [
    {
      "number": "문항 번호 또는 단계값",
      "question_type": "단어/문법/리딩/영작/기타",
      "student_answer": "학생 답 또는 추가 확인 필요",
      "answer_key": "예상 정답 또는 추가 확인 필요",
      "result": "정답/오답/부분정답/추가 확인 필요",
      "explanation": "왜 그렇게 판단했는지 짧은 해설",
      "feedback": "학생에게 줄 구체 피드백"
    }
  ],
  "summary": "전체 결과 요약",
  "feedback": "학생별 피드백",
  "parent_feedback": "학부모 발송용 피드백",
  "needs_review": true 또는 false
}`;

  const content = [
    {type: "input_text", text: prompt},
    ...images.map(image => ({type: "input_image", image_url: image.dataUrl, detail: "high"}))
  ];

  const aiRes = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-5",
      input: [{role: "user", content}],
      max_output_tokens: 2200,
      reasoning: {effort: "minimal"},
      text: {verbosity: "low"}
    })
  });

  const data = await aiRes.json();
  if (!aiRes.ok) return fallbackHomeworkResult(payload, data.error?.message || "OpenAI API 호출 실패");

  const parsed = parseJsonText(extractResponseText(data));
  const total = Number(parsed.total_questions || parsed.items?.length || 0);
  const correct = Number(parsed.correct_count || (parsed.items || []).filter(item => item.result === "정답").length);
  const score = Number(parsed.score || (total ? Math.round((correct / total) * 100) : 0));

  return {
    ok: true,
    source: "openai",
    ...parsed,
    title: parsed.title || payload.title || "숙제 사진 분석",
    student_name: parsed.student_name || student.name || "학생",
    subject: parsed.subject || payload.subject || "",
    total_questions: total,
    correct_count: correct,
    score,
    items: Array.isArray(parsed.items) ? parsed.items : []
  };
}
