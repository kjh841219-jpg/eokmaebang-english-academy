import {readPersistentState, writePersistentState} from "../../lib/dashboard-state.js";
import {handleOptions, readJson, sendJson} from "../../lib/solapi.js";
import {ADMIN_STATUS_CODES, STATUS_LABELS, koreanParts, last4, normalizeSettings, parentPhone, recordId, requireAdmin, signSmsRecord, studentPhone} from "../../lib/attendance.js";

const STATUS_CODES = {"출석": "present", "지각": "late", "결석": "absent", "보강": "makeup", "하원": "leave"};

function normalizeRecords(records = []) {
  let changed = false;
  const normalized = records.map(record => {
    const patch = {};
    if (!record.id) { patch.id = recordId(); changed = true; }
    if (!record.statusCode && STATUS_CODES[record.status]) { patch.statusCode = STATUS_CODES[record.status]; changed = true; }
    if (!record.createdAt) { patch.createdAt = `${record.date || "1970-01-01"}T00:00:00.000Z`; changed = true; }
    return {...record, ...patch};
  });
  return {normalized, changed};
}

function decorateRecord(record) {
  const token = signSmsRecord(record.id);
  return {...record, smsUrl: token ? `/api/student-attendance/sms?id=${encodeURIComponent(record.id)}&token=${encodeURIComponent(token)}` : ""};
}

function adminPayload(state) {
  return {
    students: (state.students || []).map(student => ({...student, studentPhoneLast4: last4(student)})),
    attendanceRecords: (state.attendanceRecords || []).map(decorateRecord),
    attendanceSettings: normalizeSettings(state.attendanceSettings)
  };
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req)) return sendJson(res, 401, {ok: false, error: "관리자 비밀번호를 확인해 주세요."});
  try {
    const state = await readPersistentState();
    const migrated = normalizeRecords(state.attendanceRecords);
    if (migrated.changed) {
      state.attendanceRecords = migrated.normalized;
      await writePersistentState(state);
    }
    if (req.method === "GET") return sendJson(res, 200, {ok: true, ...adminPayload(state)});
    if (req.method !== "POST") return sendJson(res, 405, {ok: false, error: "GET 또는 POST 요청만 사용할 수 있습니다."});
    const data = await readJson(req);
    const action = String(data.action || "");
    const records = Array.isArray(state.attendanceRecords) ? [...state.attendanceRecords] : [];
    let students = Array.isArray(state.students) ? [...state.students] : [];

    if (action === "save-settings") {
      state.attendanceSettings = normalizeSettings(data.settings);
    } else if (action === "save-student") {
      const patch = data.student || {};
      students = students.map(student => String(student.id) === String(patch.id) ? {...student, ...patch, studentPhoneLast4: String(studentPhone(patch) || studentPhone(student)).slice(-4)} : student);
      state.students = students;
    } else if (action === "create-record") {
      const student = students.find(item => String(item.id) === String(data.studentId));
      if (!student || !ADMIN_STATUS_CODES.has(data.statusCode)) return sendJson(res, 400, {ok: false, error: "학생과 출결 상태를 확인해 주세요."});
      const parts = koreanParts(data.dateTime ? new Date(data.dateTime) : new Date());
      records.unshift({id: recordId(), studentId: student.id, name: student.name, date: data.date || parts.date, time: data.time || parts.time, status: STATUS_LABELS[data.statusCode], statusCode: data.statusCode, reason: "관리자 수동 등록", parentSent: parentPhone(student) ? "문자 선택 대기" : "학부모 번호 없음", smsStatus: parentPhone(student) ? "ready" : "no-phone", memo: String(data.memo || ""), createdAt: parts.createdAt, updatedAt: parts.createdAt});
      state.attendanceRecords = records;
      state.students = students.map(item => String(item.id) === String(student.id) ? {...item, attendance: STATUS_LABELS[data.statusCode], attendanceDate: data.date || parts.date, attendanceTime: data.time || parts.time} : item);
    } else if (action === "update-record") {
      const record = records.find(item => String(item.id) === String(data.id));
      if (!record) return sendJson(res, 404, {ok: false, error: "출결 기록을 찾지 못했습니다."});
      const allowed = ["date", "time", "memo", "statusCode", "smsStatus", "parentSent"];
      allowed.forEach(key => { if (data.patch?.[key] !== undefined) record[key] = data.patch[key]; });
      if (record.statusCode) record.status = STATUS_LABELS[record.statusCode] || record.status;
      record.updatedAt = new Date().toISOString();
      state.attendanceRecords = records;
    } else if (action === "delete-record") {
      const removed = records.find(item => String(item.id) === String(data.id));
      state.attendanceRecords = records.filter(item => String(item.id) !== String(data.id));
      if (removed) {
        const latest = state.attendanceRecords.find(item => String(item.studentId) === String(removed.studentId));
        state.students = students.map(item => String(item.id) === String(removed.studentId) ? {...item, attendance: latest?.status || "미출석", attendanceDate: latest?.date || "", attendanceTime: latest?.time || ""} : item);
      }
    } else {
      return sendJson(res, 400, {ok: false, error: "지원하지 않는 관리자 작업입니다."});
    }
    const saved = await writePersistentState(state);
    return sendJson(res, 200, {ok: true, ...adminPayload(saved)});
  } catch (error) {
    return sendJson(res, 500, {ok: false, error: error.message || "관리자 작업을 저장하지 못했습니다."});
  }
}
