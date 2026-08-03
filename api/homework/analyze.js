import {handleOptions, readJson, sendJson} from "../_solapi.js";
import {analyzeHomeworkPayload, fallbackHomeworkResult} from "./_homework-ai.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return sendJson(res, 405, {ok: false, error: "POST 요청만 사용할 수 있습니다."});
  }

  let payload = {};
  try {
    payload = await readJson(req);
    const result = await analyzeHomeworkPayload(payload);
    return sendJson(res, 200, result);
  } catch (error) {
    if (error.statusCode) return sendJson(res, error.statusCode, {ok: false, error: error.message});
    return sendJson(res, 200, fallbackHomeworkResult(payload, error.message || "숙제 사진 분석에 실패했습니다."));
  }
}
