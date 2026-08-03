const TABLE = "homework_submissions";

const clean = value => String(value || "").trim();

export function publicSupabaseConfig() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL).replace(/\/+$/, "");
  const anonKey = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);
  return {url, anonKey, configured: Boolean(url && anonKey)};
}

export function homeworkDbConfig() {
  const url = clean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {url, serviceKey, configured: Boolean(url && serviceKey)};
}

export function homeworkDbConfigured() {
  return homeworkDbConfig().configured;
}

function headers(extra = {}) {
  const {serviceKey} = homeworkDbConfig();
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json; charset=utf-8",
    ...extra
  };
}

function endpoint(query = "") {
  const {url, configured} = homeworkDbConfig();
  if (!configured) throw new Error("Supabase 숙제 DB 환경변수 SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정이 필요합니다.");
  return `${url}/rest/v1/${TABLE}${query}`;
}

function parseContent(row) {
  try {
    return row?.homework_content ? JSON.parse(row.homework_content) : {};
  } catch {
    return {rawContent: row?.homework_content || ""};
  }
}

export function rowToHomeworkRecord(row = {}) {
  const content = parseContent(row);
  const submittedAt = row.submitted_at || content.createdAt || new Date().toISOString();
  return {
    id: String(row.id || content.id || ""),
    dbId: row.id || "",
    date: content.date || String(submittedAt).slice(0, 10),
    time: content.time || "",
    createdAt: submittedAt,
    updatedAt: row.updated_at || content.updatedAt || submittedAt,
    studentId: row.student_id || content.studentId || "",
    name: row.student_name || content.name || "학생",
    phone: row.phone || content.phone || "",
    classGroup: content.classGroup || "",
    title: row.homework_title || content.title || "숙제 제출",
    subject: content.subject || "",
    memo: content.memo || "",
    totalQuestions: Number(content.totalQuestions || 0),
    correctCount: Number(content.correctCount || 0),
    score: Number(content.score || 0),
    items: Array.isArray(content.items) ? content.items : [],
    summary: content.summary || "",
    feedback: content.feedback || "",
    parentFeedback: content.parentFeedback || "",
    needsReview: Boolean(content.needsReview),
    imageNames: Array.isArray(content.imageNames) ? content.imageNames : [],
    attachmentUrl: row.attachment_url || content.attachmentUrl || "",
    source: content.source || "supabase",
    status: row.submission_status || content.status || "submitted",
    feedbackSent: content.feedbackSent || "미발송",
    feedbackSentAt: content.feedbackSentAt || "",
    submittedFrom: content.submittedFrom || ""
  };
}

function storageContent(record = {}) {
  return {
    clientId: record.id || "",
    date: record.date || "",
    time: record.time || "",
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || new Date().toISOString(),
    studentId: record.studentId || "",
    name: record.name || record.studentName || "",
    classGroup: record.classGroup || "",
    subject: record.subject || "",
    memo: record.memo || "",
    totalQuestions: Number(record.totalQuestions || 0),
    correctCount: Number(record.correctCount || 0),
    score: Number(record.score || 0),
    items: Array.isArray(record.items) ? record.items : [],
    summary: record.summary || "",
    feedback: record.feedback || "",
    parentFeedback: record.parentFeedback || "",
    needsReview: Boolean(record.needsReview),
    imageNames: Array.isArray(record.imageNames) ? record.imageNames : [],
    attachmentUrl: record.attachmentUrl || "",
    source: record.source || "supabase",
    status: record.status || "submitted",
    feedbackSent: record.feedbackSent || "미발송",
    feedbackSentAt: record.feedbackSentAt || "",
    submittedFrom: record.submittedFrom || ""
  };
}

export function recordToRow(record = {}) {
  const now = new Date().toISOString();
  const title = record.title || record.homework_title || record.homeworkTitle || "숙제 제출";
  const studentName = record.name || record.student_name || record.studentName || "";
  if (!studentName.trim()) throw new Error("학생 이름은 필수입니다.");
  return {
    student_id: record.studentId || record.student_id || "",
    student_name: studentName,
    phone: record.phone || "",
    homework_title: title,
    homework_content: JSON.stringify(storageContent({...record, title, name: studentName, updatedAt: now})),
    submission_status: record.status || record.submission_status || "submitted",
    attachment_url: record.attachmentUrl || record.attachment_url || "",
    submitted_at: record.createdAt || record.submittedAt || now,
    updated_at: now
  };
}

export async function listHomeworkSubmissions() {
  const response = await fetch(endpoint("?select=*&order=submitted_at.desc,id.desc"), {
    headers: headers(),
    cache: "no-store"
  });
  const text = await response.text();
  const rows = text ? JSON.parse(text) : [];
  if (!response.ok) throw new Error(`숙제 목록 조회 실패(${response.status}): ${text || response.statusText}`);
  return rows.map(rowToHomeworkRecord);
}

export async function insertHomeworkSubmission(record) {
  const response = await fetch(endpoint("?select=*"), {
    method: "POST",
    headers: headers({Prefer: "return=representation"}),
    body: JSON.stringify(recordToRow(record)),
    cache: "no-store"
  });
  const text = await response.text();
  const rows = text ? JSON.parse(text) : [];
  if (!response.ok) throw new Error(`숙제 저장 실패(${response.status}): ${text || response.statusText}`);
  return rowToHomeworkRecord(rows[0] || {});
}

export async function updateHomeworkSubmission(id, patch = {}) {
  if (!id) throw new Error("수정할 숙제 id가 없습니다.");
  const previous = (await listHomeworkSubmissions()).find(record => String(record.id) === String(id));
  if (!previous) throw new Error("수정할 숙제 제출 건을 찾지 못했습니다.");
  const merged = {...previous, ...patch, id: previous.id};
  const row = recordToRow(merged);
  delete row.submitted_at;
  const response = await fetch(endpoint(`?id=eq.${encodeURIComponent(id)}&select=*`), {
    method: "PATCH",
    headers: headers({Prefer: "return=representation"}),
    body: JSON.stringify(row),
    cache: "no-store"
  });
  const text = await response.text();
  const rows = text ? JSON.parse(text) : [];
  if (!response.ok) throw new Error(`숙제 수정 실패(${response.status}): ${text || response.statusText}`);
  return rowToHomeworkRecord(rows[0] || {});
}

export async function deleteHomeworkSubmission(id) {
  if (!id) throw new Error("삭제할 숙제 id가 없습니다.");
  const response = await fetch(endpoint(`?id=eq.${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: headers({Prefer: "return=minimal"}),
    cache: "no-store"
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`숙제 삭제 실패(${response.status}): ${text || response.statusText}`);
  return {id};
}
