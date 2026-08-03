import {readPersistentState, writePersistentState} from "../_dashboard-state.js";
import {handleOptions, readJson, sendJson} from "../_solapi.js";
import {analyzeHomeworkPayload, fallbackHomeworkResult} from "../../lib/homework-ai.js";

const digits = value => String(value || "").replace(/[^0-9]/g, "");
const koreaDate = () => new Date().toLocaleDateString("en-CA", {timeZone: "Asia/Seoul"});

function phoneCandidates(student) {
  return [
    student.studentPhone,
    student.phone,
    student.parentPhone,
    student.guardianPhone,
    student.mobile,
    student.contact
  ].map(digits).filter(value => value.length >= 4);
}

function normalizeRecord(result, payload, student) {
  const items = Array.isArray(result.items) ? result.items.map((item, index) => ({
    number: item.number || index + 1,
    question_type: item.question_type || "기타",
    student_answer: item.student_answer || "추가 확인 필요",
    answer_key: item.answer_key || "추가 확인 필요",
    result: item.result || "추가 확인 필요",
    explanation: item.explanation || "",
    feedback: item.feedback || ""
  })) : [];
  const total = Number(result.total_questions || items.length || 0);
  const correct = Number(result.correct_count || items.filter(item => item.result === "정답").length);
  const score = Number(result.score || (total ? Math.round((correct / total) * 100) : 0));
  return {
    id: globalThis.crypto?.randomUUID?.() || `homework-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: String(payload.date || koreaDate()),
    createdAt: new Date().toISOString(),
    studentId: student.id,
    name: student.name,
    classGroup: student.classGroup || student.grade || "",
    title: result.title || payload.title || "숙제 사진 제출",
    subject: result.subject || payload.subject || "",
    memo: payload.memo || "",
    totalQuestions: total,
    correctCount: correct,
    score,
    items,
    summary: result.summary || "",
    feedback: result.feedback || "",
    parentFeedback: result.parent_feedback || result.parentFeedback || "",
    needsReview: Boolean(result.needs_review),
    imageNames: (payload.images || []).map(image => image.name || "숙제사진"),
    imageDataUrls: (payload.images || []).map(image => image.dataUrl).filter(Boolean).slice(0, 6),
    source: result.source || "openai",
    status: result.source === "fallback" ? "확인필요" : "AI분석완료",
    submittedFrom: payload.studentSubmit ? "student-homework-submit" : "dashboard"
  };
}

async function handleStudentSubmit(payload) {
  const last4 = digits(payload.last4).slice(-4);
  const selectedStudentId = String(payload.selectedStudentId || payload.studentId || "");
  if (last4.length !== 4) {
    const error = new Error("휴대폰 번호 뒷자리 4자리를 입력해 주세요.");
    error.statusCode = 400;
    throw error;
  }

  const state = await readPersistentState();
  const students = Array.isArray(state.students) ? state.students : [];
  const matches = students.filter(student => phoneCandidates(student).some(phone => phone.slice(-4) === last4));

  if (!matches.length) {
    const error = new Error(`뒷자리 ${last4}와 일치하는 학생을 찾지 못했습니다. 학원에 등록된 연락처를 확인해 주세요.`);
    error.statusCode = 404;
    throw error;
  }

  if (matches.length > 1 && !selectedStudentId) {
    return {
      ok: true,
      needsSelection: true,
      needSelect: true,
      choices: matches.map(student => ({
        id: student.id,
        studentId: student.id,
        name: student.name,
        classGroup: student.classGroup || student.grade || "",
        school: student.school || "",
        phoneLast4: phoneCandidates(student)[0]?.slice(-4) || last4
      }))
    };
  }

  const student = selectedStudentId ? matches.find(item => String(item.id) === selectedStudentId) : matches[0];
  if (!student) {
    const error = new Error("선택한 학생 정보를 찾지 못했습니다.");
    error.statusCode = 404;
    throw error;
  }

  const imageCount = Array.isArray(payload.images) ? payload.images.length : 0;
  if (!imageCount) {
    const error = new Error("제출할 숙제 사진을 업로드해 주세요.");
    error.statusCode = 400;
    throw error;
  }

  const analysisPayload = {
    ...payload,
    student: {id: student.id, name: student.name, grade: student.grade, classGroup: student.classGroup}
  };
  let analysis;
  try {
    analysis = await analyzeHomeworkPayload(analysisPayload);
  } catch (error) {
    if (error.statusCode) throw error;
    analysis = fallbackHomeworkResult(analysisPayload, error.message);
  }

  const record = normalizeRecord(analysis, payload, student);
  const homeworkSubmissions = Array.isArray(state.homeworkSubmissions) ? [...state.homeworkSubmissions] : [];
  homeworkSubmissions.unshift(record);
  await writePersistentState({...state, homeworkSubmissions: homeworkSubmissions.slice(0, 300)});

  return {
    ok: true,
    message: `${student.name} 학생 숙제가 제출되었습니다.`,
    student: {id: student.id, name: student.name},
    result: {record}
  };
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return sendJson(res, 405, {ok: false, error: "POST 요청만 사용할 수 있습니다."});
  }

  let payload = {};
  try {
    payload = await readJson(req);
    if (payload.studentSubmit) {
      return sendJson(res, 200, await handleStudentSubmit(payload));
    }
    const result = await analyzeHomeworkPayload(payload);
    return sendJson(res, 200, result);
  } catch (error) {
    if (error.statusCode) return sendJson(res, error.statusCode, {ok: false, error: error.message});
    return sendJson(res, 200, fallbackHomeworkResult(payload, error.message || "숙제 사진 분석에 실패했습니다."));
  }
}
