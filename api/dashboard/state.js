import {handleOptions, readJson, sendJson} from "../_solapi.js";

const emptyState = () => ({
  savedAt: new Date().toISOString(),
  students: [],
  messages: []
});

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  globalThis.__beolgyoDashboardState ||= emptyState();

  if (req.method === "GET") {
    return sendJson(res, 200, {ok: true, ...globalThis.__beolgyoDashboardState});
  }

  if (req.method === "POST") {
    try {
      const data = await readJson(req);
      globalThis.__beolgyoDashboardState = {
        savedAt: new Date().toISOString(),
        students: Array.isArray(data.students) ? data.students : [],
        messages: Array.isArray(data.messages) ? data.messages : []
      };
      const messageIds = {};
      globalThis.__beolgyoDashboardState.messages.forEach(message => {
        if (message.clientId && !message.dbId) messageIds[message.clientId] = message.clientId;
      });
      return sendJson(res, 200, {ok: true, result: {messageIds}});
    } catch (error) {
      return sendJson(res, 400, {ok: false, error: error.message || "대시보드 저장에 실패했습니다."});
    }
  }

  return sendJson(res, 405, {ok: false, error: "GET 또는 POST 요청만 사용할 수 있습니다."});
}
