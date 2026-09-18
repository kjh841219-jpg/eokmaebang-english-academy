import {readPersistentState, writePersistentState} from "../../lib/dashboard-state.js";
import {handleOptions, readJson, sendJson} from "../../lib/solapi.js";
import {attendanceMessage, parentPhone, validSmsSignature} from "../../lib/attendance.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!["GET", "POST"].includes(req.method)) return sendJson(res, 405, {ok: false, error: "GET 또는 POST 요청만 사용할 수 있습니다."});
  const body = req.method === "POST" ? await readJson(req) : req.query;
  const id = String(body.id || "");
  if (!validSmsSignature(id, String(body.token || ""))) return sendJson(res, 403, {ok: false, error: "유효하지 않은 문자 연결입니다."});
  try {
    const state = await readPersistentState();
    const records = Array.isArray(state.attendanceRecords) ? [...state.attendanceRecords] : [];
    const record = records.find(item => String(item.id) === id);
    const student = (state.students || []).find(item => String(item.id) === String(record?.studentId));
    const phone = parentPhone(student);
    if (!record || !student || phone.length < 10) return sendJson(res, 404, {ok: false, error: "등록된 학부모 전화번호가 없습니다."});
    if (req.method === "POST") {
      record.smsStatus = "skipped";
      record.parentSent = "문자 보내지 않음";
      record.updatedAt = new Date().toISOString();
      await writePersistentState({...state, attendanceRecords: records});
      return sendJson(res, 200, {ok: true});
    }
    record.smsStatus = "opened";
    record.parentSent = "문자 앱 열기 완료";
    record.updatedAt = new Date().toISOString();
    await writePersistentState({...state, attendanceRecords: records});
    const [, month, day] = String(record.date).split("-");
    const message = attendanceMessage(student, record.statusCode, {displayDate: `${Number(month)}월 ${Number(day)}일`, time: record.time}, state.attendanceSettings);
    res.statusCode = 302;
    res.setHeader("Location", `sms:${phone}?body=${encodeURIComponent(message)}`);
    res.setHeader("Cache-Control", "no-store");
    return res.end();
  } catch {
    return sendJson(res, 500, {ok: false, error: "문자 앱 연결에 실패했습니다."});
  }
}
