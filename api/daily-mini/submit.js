import {readPersistentState, writePersistentState} from "../../lib/dashboard-state.js";
import {handleOptions, readJson, sendJson} from "../../lib/solapi.js";

const koreaDate = () => new Date().toLocaleDateString("en-CA", {timeZone: "Asia/Seoul"});
const koreaTime = () => new Date().toLocaleTimeString("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const toInt = value => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
};

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return sendJson(res, 405, {ok: false, error: "POST 요청만 사용할 수 있습니다."});
  }

  try {
    const data = await readJson(req);
    const record = {
      date: String(data.date || koreaDate()),
      time: String(data.time || koreaTime()),
      studentId: data.studentId || "",
      name: String(data.name || "학생"),
      phone: String(data.phone || ""),
      level: String(data.level || ""),
      type: String(data.type || ""),
      typeKey: String(data.typeKey || ""),
      score: toInt(data.score),
      correct: toInt(data.correct),
      total: toInt(data.total),
      areas: data.areas && typeof data.areas === "object" ? data.areas : {},
      memo: String(data.memo || ""),
      source: "url-cbt"
    };

    const state = await readPersistentState();
    const dailyMiniTests = Array.isArray(state.dailyMiniTests) ? [...state.dailyMiniTests] : [];
    dailyMiniTests.unshift(record);
    await writePersistentState({...state, dailyMiniTests: dailyMiniTests.slice(0, 1000)});

    return sendJson(res, 200, {ok: true, result: {record}});
  } catch (error) {
    return sendJson(res, 400, {ok: false, error: error.message || "Daily CBT 결과 저장에 실패했습니다."});
  }
}
