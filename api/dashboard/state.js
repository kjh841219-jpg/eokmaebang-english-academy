import {handleOptions, readJson, sendJson} from "../_solapi.js";
import {emptyState, readPersistentState, writePersistentState} from "../_dashboard-state.js";
import {homeworkDbConfigured, listHomeworkSubmissions} from "../homework/_db.js";

function itemKey(item, index = 0) {
  return String(
    item?.id ||
    item?.clientId ||
    item?.dbId ||
    item?.groupId ||
    `${item?.date || ""}|${item?.time || ""}|${item?.studentId || ""}|${item?.name || ""}|${item?.title || ""}|${item?.body || ""}|${index}`
  );
}

function mergeList(existing, incoming, limit = 1000) {
  const map = new Map();
  (Array.isArray(existing) ? existing : []).forEach((item, index) => {
    map.set(itemKey(item, index), item);
  });
  (Array.isArray(incoming) ? incoming : []).forEach((item, index) => {
    const key = itemKey(item, index);
    map.set(key, {...(map.get(key) || {}), ...item});
  });
  return [...map.values()]
    .sort((a, b) => String(b.createdAt || b.savedAt || b.date || "").localeCompare(String(a.createdAt || a.savedAt || a.date || "")))
    .slice(0, limit);
}

function mergeStudents(existing, incoming) {
  const map = new Map();
  (Array.isArray(existing) ? existing : []).forEach((student, index) => {
    map.set(String(student.id || student.name || index), student);
  });
  (Array.isArray(incoming) ? incoming : []).forEach((student, index) => {
    const key = String(student.id || student.name || index);
    map.set(key, {...(map.get(key) || {}), ...student});
  });
  return [...map.values()];
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method === "GET") {
    try {
      const state = await readPersistentState();
      if (homeworkDbConfigured()) {
        state.homeworkSubmissions = await listHomeworkSubmissions();
      }
      return sendJson(res, 200, {ok: true, ...state});
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("not found")) {
        return sendJson(res, 200, {ok: true, ...emptyState()});
      }
      return sendJson(res, 500, {ok: false, error: "저장된 학생 정보를 불러오지 못했습니다."});
    }
  }

  if (req.method === "POST") {
    try {
      const data = await readJson(req);
      const existing = await readPersistentState();
      const useHomeworkDb = homeworkDbConfigured();
      const state = {
        savedAt: new Date().toISOString(),
        students: mergeStudents(existing.students, data.students),
        messages: mergeList(existing.messages, data.messages, 1000),
        smsContentTemplates: mergeList(existing.smsContentTemplates, data.smsContentTemplates, 200),
        attendanceRecords: mergeList(existing.attendanceRecords, data.attendanceRecords, 1500),
        academySchedules: mergeList(existing.academySchedules, data.academySchedules, 500),
        homeworkSubmissions: useHomeworkDb ? (Array.isArray(existing.homeworkSubmissions) ? existing.homeworkSubmissions : []) : mergeList(existing.homeworkSubmissions, data.homeworkSubmissions, 500),
        dailyMiniTests: mergeList(existing.dailyMiniTests, data.dailyMiniTests, 1000),
        dailyMiniBank: data.dailyMiniBank && typeof data.dailyMiniBank === "object" ? data.dailyMiniBank : {}
      };
      const saved = await writePersistentState(state);
      if (useHomeworkDb) {
        saved.homeworkSubmissions = await listHomeworkSubmissions();
      }
      const messageIds = {};
      state.messages.forEach(message => {
        if (message.clientId && !message.dbId) messageIds[message.clientId] = message.clientId;
      });
      return sendJson(res, 200, {ok: true, result: {messageIds}, state: saved});
    } catch (error) {
      return sendJson(res, 400, {ok: false, error: error.message || "대시보드 저장에 실패했습니다."});
    }
  }

  return sendJson(res, 405, {ok: false, error: "GET 또는 POST 요청만 사용할 수 있습니다."});
}
