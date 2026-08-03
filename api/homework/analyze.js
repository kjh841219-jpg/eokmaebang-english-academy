import {readPersistentState, writePersistentState} from "../../lib/dashboard-state.js";
import {handleOptions, readJson, sendJson} from "../../lib/solapi.js";
import {analyzeHomeworkPayload, fallbackHomeworkResult} from "../../lib/homework-ai.js";
import {
  deleteHomeworkSubmission,
  homeworkDbConfigured,
  insertHomeworkSubmission,
  listHomeworkSubmissions,
  publicSupabaseConfig,
  updateHomeworkSubmission
} from "../../lib/homework-db.js";

const digits = value => String(value || "").replace(/[^0-9]/g, "");
const koreaDate = () => new Date().toLocaleDateString("en-CA", {timeZone: "Asia/Seoul"});
const koreaTime = () => new Date().toLocaleTimeString("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul"
});

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
  const now = new Date().toISOString();
  const items = Array.isArray(result.items) ? result.items.map((item, index) => ({
    number: item.number || index + 1,
    question_type: item.question_type || "湲고?",
    student_answer: item.student_answer || "異붽? ?뺤씤 ?꾩슂",
    answer_key: item.answer_key || "異붽? ?뺤씤 ?꾩슂",
    result: item.result || "異붽? ?뺤씤 ?꾩슂",
    explanation: item.explanation || "",
    feedback: item.feedback || ""
  })) : [];
  const total = Number(result.total_questions || items.length || 0);
  const correct = Number(result.correct_count || items.filter(item => item.result === "?뺣떟").length);
  const score = Number(result.score || (total ? Math.round((correct / total) * 100) : 0));
  return {
    id: globalThis.crypto?.randomUUID?.() || `homework-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: String(payload.date || koreaDate()),
    time: koreaTime(),
    createdAt: now,
    studentId: student.id,
    name: student.name,
    classGroup: student.classGroup || student.grade || "",
    title: result.title || payload.title || "?숈젣 ?ъ쭊 ?쒖텧",
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
    imageNames: (payload.images || []).map(image => image.name || "?숈젣?ъ쭊"),
    imageDataUrls: (payload.images || []).map(image => image.dataUrl).filter(Boolean).slice(0, 6),
    source: result.source || "openai",
    status: result.source === "fallback" ? "?뺤씤?꾩슂" : "AI遺꾩꽍?꾨즺",
    submittedFrom: payload.studentSubmit ? "student-homework-submit" : "dashboard"
  };
}

function requestAction(req) {
  if (req.query?.action) return String(req.query.action);
  try {
    return new URL(req.url, "http://localhost").searchParams.get("action") || "";
  } catch {
    return "";
  }
}

function recordKey(record = {}) {
  return String(record.id || `${record.name || record.student_name || ""}|${record.title || record.homework_title || ""}|${record.createdAt || record.submitted_at || record.date || ""}`);
}

async function handleHomeworkDataApi(req, res, action) {
  if (req.method === "GET" && action === "submissions") {
    return sendJson(res, 200, {
      ok: true,
      homeworkSubmissions: await listHomeworkSubmissions(),
      fetchedAt: new Date().toISOString()
    });
  }

  if (req.method === "GET" && action === "config") {
    const {url, anonKey, configured} = publicSupabaseConfig();
    return sendJson(res, 200, {
      ok: true,
      configured,
      url: configured ? url : "",
      anonKey: configured ? anonKey : "",
      table: "homework_submissions"
    });
  }

  if (req.method === "POST" && action === "submissions") {
    const data = await readJson(req);
    const record = await insertHomeworkSubmission(data.record || data);
    return sendJson(res, 200, {ok: true, result: {record}});
  }

  if (req.method === "PATCH" && action === "submissions") {
    const data = await readJson(req);
    const record = await updateHomeworkSubmission(data.id, data.patch || data.changes || {});
    return sendJson(res, 200, {ok: true, result: {record}});
  }

  if (req.method === "DELETE" && action === "submissions") {
    const data = await readJson(req);
    const result = await deleteHomeworkSubmission(data.id);
    return sendJson(res, 200, {ok: true, result});
  }

  if (req.method === "POST" && action === "migrate") {
    const data = await readJson(req);
    const incoming = Array.isArray(data.records) ? data.records : [];
    const existing = await listHomeworkSubmissions();
    const existingKeys = new Set(existing.map(recordKey));
    const inserted = [];
    let skippedCount = 0;
    for (const record of incoming) {
      const key = recordKey(record);
      if (!key || existingKeys.has(key)) {
        skippedCount += 1;
        continue;
      }
      const saved = await insertHomeworkSubmission(record);
      inserted.push(saved);
      existingKeys.add(key);
    }
    return sendJson(res, 200, {ok: true, insertedCount: inserted.length, skippedCount, inserted});
  }

  return sendJson(res, 405, {ok: false, error: "吏?먰븯吏 ?딅뒗 ?숈젣 API ?붿껌?낅땲??"});
}

async function handleStudentSubmit(payload) {
  const last4 = digits(payload.last4).slice(-4);
  const selectedStudentId = String(payload.selectedStudentId || payload.studentId || "");
  if (last4.length !== 4) {
    const error = new Error("?대???踰덊샇 ?룹옄由?4?먮━瑜??낅젰??二쇱꽭??");
    error.statusCode = 400;
    throw error;
  }

  const state = await readPersistentState();
  const students = Array.isArray(state.students) ? state.students : [];
  const matches = students.filter(student => phoneCandidates(student).some(phone => phone.slice(-4) === last4));

  if (!matches.length) {
    const error = new Error(`?룹옄由?${last4}? ?쇱튂?섎뒗 ?숈깮??李얠? 紐삵뻽?듬땲?? ?숈썝???깅줉???곕씫泥섎? ?뺤씤??二쇱꽭??`);
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
    const error = new Error("?좏깮???숈깮 ?뺣낫瑜?李얠? 紐삵뻽?듬땲??");
    error.statusCode = 404;
    throw error;
  }

  const imageCount = Array.isArray(payload.images) ? payload.images.length : 0;
  if (!imageCount) {
    const error = new Error("?쒖텧???숈젣 ?ъ쭊???낅줈?쒗빐 二쇱꽭??");
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

  let record = normalizeRecord(analysis, payload, student);
  if (homeworkDbConfigured()) {
    record = await insertHomeworkSubmission(record);
  } else {
    const homeworkSubmissions = Array.isArray(state.homeworkSubmissions) ? [...state.homeworkSubmissions] : [];
    homeworkSubmissions.unshift(record);
    await writePersistentState({...state, homeworkSubmissions: homeworkSubmissions.slice(0, 300)});
  }

  return {
    ok: true,
    message: `${student.name} ?숈깮 ?숈젣媛 ?쒖텧?섏뿀?듬땲??`,
    student: {id: student.id, name: student.name},
    result: {record}
  };
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  const action = requestAction(req);
  if (action) {
    try {
      return await handleHomeworkDataApi(req, res, action);
    } catch (error) {
      return sendJson(res, 500, {ok: false, error: error.message || "?숈젣 ?곗씠??泥섎━???ㅽ뙣?덉뒿?덈떎."});
    }
  }
  if (req.method !== "POST") {
    return sendJson(res, 405, {ok: false, error: "POST ?붿껌留??ъ슜?????덉뒿?덈떎."});
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
    if (payload.studentSubmit) {
      return sendJson(res, 500, {ok: false, error: error.message || "?숈젣 ?쒖텧 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎."});
    }
    return sendJson(res, 200, fallbackHomeworkResult(payload, error.message || "?숈젣 ?ъ쭊 遺꾩꽍???ㅽ뙣?덉뒿?덈떎."));
  }
}
