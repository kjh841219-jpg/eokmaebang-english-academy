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
    const data = JSON.parse(body || "{}");
    const reportType = data.reportType === "middle" ? "middle" : "elementary";
    const prompt = reportType === "middle"
      ? middleSchoolPrompt(data)
      : elementaryPrompt(data);

    const aiRes = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5",
        input: prompt
      })
    });

    const result = await aiRes.json();
    if (!aiRes.ok) {
      return json(res, aiRes.status, {
        error: result.error?.message || "OpenAI API 호출 중 오류가 발생했습니다."
      });
    }

    return json(res, 200, {
      reportType,
      report: result.output_text || "보고서 내용을 불러오지 못했습니다."
    });
  } catch (error) {
    return json(res, 500, {
      error: error.message || "보고서 생성 중 오류가 발생했습니다."
    });
  }
}

function elementaryPrompt(data) {
  return `
당신은 '벌교미래엔영어학원'의 원장입니다. 초등부 학부모님께 발송할, 아이의 공부 습관과 영어 자신감을 심어주는 따뜻하고 정성스러운 '초등부 학습보고서'를 생성합니다.

[교육 목표]
1:1 맞춤형 자기주도 학습을 통한 영어 자신감 고취, 매일 꾸준히 공부하는 올바른 습관 형성.

[문체 및 분량]
- 원장 선생님 시선에서 아이를 따뜻하게 격려하는 문체
- 모바일 카카오톡 가독성을 고려한 500자 내외

[보고서 출력 구성]
1. [한 줄 성장 요약]
2. [이번 달 학습 내용] 교재 및 진도
3. [영역별 성취 및 태도] 어휘/독해/문법/학습 태도
4. [원장 선생님의 칭찬 한마디] 자기주도적 행동 구체적 칭찬
5. [앞으로의 지도 방향] 다음 달 목표 및 당부

[입력 데이터]
- 학생 이름: ${data.studentName || "-"}
- 학년/반: ${data.gradeClass || "-"}
- 보고 기간: ${data.reportPeriod || "-"}
- 교재/레벨: ${data.bookLevel || "-"}
- 어휘(단어테스트): ${data.vocabResult || "-"}
- 독해/문법 성취도: ${data.readingGrammar || "-"}
- 학습 태도: ${data.studyAttitude || "-"}
- 원장 메모: ${data.directorMemo || "-"}

위 구성 제목을 그대로 사용하고, 학부모님께 바로 보낼 수 있는 완성 문장으로 작성하십시오.
`;
}

function middleSchoolPrompt(data) {
  return `
당신은 '벌교미래엔영어학원'의 원장입니다. 중등부 학부모님께 발송할, 철저한 성적 분석과 명확한 대안을 제시하는 전문적이고 신뢰감 있는 '중등부 학습보고서'를 생성합니다.

[교육 목표]
학교별 내신 완벽 대비, 서술형 문장제 완벽 정복, 고등 영어로 이어지는 심화 문법 및 독해 실력 완성.

[문체 및 분량]
- 원장으로서의 전문성과 분석력이 돋보이는 객관적이고 신뢰감 있는 문체
- 정확한 피드백을 전달하는 600~700자 내외

[보고서 출력 구성]
1. [학습 종합 평가] 이번 달 성취도 총평
2. [주요 학습 진도 및 성적 분석] 단어 통과율, 주간/월간 테스트 결과
3. [취약 영역 및 보완점] 오답 분석 및 서술형 평가 피드백
4. [과제 수행 및 면학 태도] 숙제 이행률, 수업 집중도
5. [원장의 향후 내신/학습 전략] 다음 기간 구체적인 성적 향상 계획

[입력 데이터]
- 학생 이름: ${data.studentName || "-"}
- 학년/학교: ${data.gradeSchool || "-"}
- 보고 기간: ${data.reportPeriod || "-"}
- 교재/과정: ${data.courseBook || "-"}
- 단어 통과율: ${data.vocabRate || "-"}
- 평가 점수: ${data.testScores || "-"}
- 취약 영역: ${data.weakArea || "-"}
- 과제 이행률: ${data.homeworkRate || "-"}
- 원장 메모: ${data.directorMemo || "-"}

위 구성 제목을 그대로 사용하고, 학부모님께 바로 보낼 수 있는 완성 문장으로 작성하십시오.
`;
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
