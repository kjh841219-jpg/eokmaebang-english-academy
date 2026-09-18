import {readPersistentState, writePersistentState} from "../../lib/dashboard-state.js";
import {handleOptions, readJson, sendJson} from "../../lib/solapi.js";
import {STATUS_LABELS, STUDENT_STATUS_CODES, attendanceMessage, digits, koreanParts, last4 as studentLast4, parentPhone, publicStudent, recordId, signSmsRecord} from "../../lib/attendance.js";

const TEN_MINUTES = 10 * 60 * 1000;
const activeStudents = state => (Array.isArray(state.students) ? state.students : []).filter(student => !["퇴원", "퇴원생"].includes(String(student.status || "재원생")));
const findMatches = (state, enteredLast4) => activeStudents(state).filter(student => studentLast4(student) === enteredLast4);
const duplicateRecord = (records, studentId, statusCode, now) => records.find(record => String(record.studentId) === String(studentId) && record.statusCode === statusCode && now.getTime() - new Date(record.createdAt || 0).getTime() < TEN_MINUTES);

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, {ok: false, error: "POST 요청만 사용할 수 있습니다."});
  try {
    const data = await readJson(req);
    const action = String(data.action || "search");
    const enteredLast4 = digits(data.last4).slice(-4);
    if (enteredLast4.length !== 4) return sendJson(res, 400, {ok: false, error: "전화번호 뒷자리 4개를 입력해 주세요."});
    const state = await readPersistentState();
    const matches = findMatches(state, enteredLast4);
    if (!matches.length) return sendJson(res, 404, {ok: false, error: "등록된 학생 정보를 찾을 수 없습니다. 선생님께 문의해 주세요."});
    if (action === "search") return sendJson(res, 200, {ok: true, students: matches.map(publicStudent)});
    if (action !== "record") return sendJson(res, 400, {ok: false, error: "지원하지 않는 요청입니다."});

    const statusCode = String(data.statusCode || "");
    if (!STUDENT_STATUS_CODES.has(statusCode)) return sendJson(res, 400, {ok: false, error: "학생 화면에서는 출석, 지각, 보강, 하원만 선택할 수 있습니다."});
    const student = matches.find(item => String(item.id) === String(data.studentId));
    if (!student) return sendJson(res, 404, {ok: false, error: "선택한 학생 정보를 다시 확인해 주세요."});

    const now = new Date();
    const records = Array.isArray(state.attendanceRecords) ? [...state.attendanceRecords] : [];
    if (duplicateRecord(records, student.id, statusCode, now)) return sendJson(res, 409, {ok: false, duplicate: true, error: "이미 출결 처리가 완료된 학생입니다."});

    const parts = koreanParts(now);
    const id = recordId();
    const hasParentPhone = parentPhone(student).length >= 10;
    const record = {id, studentId: student.id, name: student.name, date: parts.date, time: parts.time, status: STATUS_LABELS[statusCode], statusCode, reason: "학생 직접 출결", parentSent: hasParentPhone ? "문자 선택 대기" : "학부모 번호 없음", smsStatus: hasParentPhone ? "ready" : "no-phone", memo: "", previousAttendance: student.attendance || "미출석", previousAttendanceDate: student.attendanceDate || "", previousAttendanceTime: student.attendanceTime || "", createdAt: parts.createdAt, updatedAt: parts.createdAt};
    records.unshift(record);
    const students = (state.students || []).map(item => String(item.id) === String(student.id) ? {...item, studentPhoneLast4: studentLast4(item), attendance: record.status, attendanceDate: record.date, attendanceTime: record.time, parentSent: record.parentSent} : item);
    await writePersistentState({...state, students, attendanceRecords: records});
    const signature = hasParentPhone ? signSmsRecord(id) : "";
    return sendJson(res, 200, {ok: true, result: {id, smsToken: signature, studentName: student.name, maskedName: publicStudent(student).maskedName, status: record.status, date: record.date, time: record.time, hasParentPhone, smsUrl: signature ? `/api/student-attendance/sms?id=${encodeURIComponent(id)}&token=${encodeURIComponent(signature)}` : "", messagePreview: attendanceMessage(student, statusCode, parts, state.attendanceSettings)}});
  } catch {
    return sendJson(res, 500, {ok: false, error: "출결 저장에 실패했습니다. 다시 시도해 주세요."});
  }
}
