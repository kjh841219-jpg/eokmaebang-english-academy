import {handleOptions, kakaoOptions, readJson, sendJson, sendSolapiMessages} from "../../lib/solapi.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, {ok: false, error: "POST 요청만 사용할 수 있습니다."});
  try {
    const data = await readJson(req);
    const kind = String(data.kind || "attendance");
    const options = kakaoOptions(kind, data.variables || null);
    const result = await sendSolapiMessages(data.to, String(data.text || ""), options, String(data.scheduledDate || ""));
    return sendJson(res, 200, {ok: true, result});
  } catch (error) {
    return sendJson(res, 400, {ok: false, error: error.message || "카카오 알림톡 발송에 실패했습니다."});
  }
}
