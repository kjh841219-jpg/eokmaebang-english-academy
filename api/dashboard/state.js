import {handleOptions, readJson, sendJson} from "../_solapi.js";
import {get, put} from "@vercel/blob";

const emptyState = () => ({
  savedAt: new Date().toISOString(),
  students: [],
  messages: [],
  smsContentTemplates: []
});

const STATE_PATH = "academy/dashboard-state.json";

async function readPersistentState() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    globalThis.__beolgyoDashboardState ||= emptyState();
    return globalThis.__beolgyoDashboardState;
  }
  const result = await get(STATE_PATH, {access: "private"});
  if (!result?.stream) return emptyState();
  return JSON.parse(await new Response(result.stream).text());
}

async function writePersistentState(state) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    globalThis.__beolgyoDashboardState = state;
    return;
  }
  await put(STATE_PATH, JSON.stringify(state), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method === "GET") {
    try {
      return sendJson(res, 200, {ok: true, ...(await readPersistentState())});
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
      const state = {
        savedAt: new Date().toISOString(),
        students: Array.isArray(data.students) ? data.students : [],
        messages: Array.isArray(data.messages) ? data.messages : [],
        smsContentTemplates: Array.isArray(data.smsContentTemplates) ? data.smsContentTemplates : []
      };
      await writePersistentState(state);
      const messageIds = {};
      state.messages.forEach(message => {
        if (message.clientId && !message.dbId) messageIds[message.clientId] = message.clientId;
      });
      return sendJson(res, 200, {ok: true, result: {messageIds}});
    } catch (error) {
      return sendJson(res, 400, {ok: false, error: error.message || "대시보드 저장에 실패했습니다."});
    }
  }

  return sendJson(res, 405, {ok: false, error: "GET 또는 POST 요청만 사용할 수 있습니다."});
}
