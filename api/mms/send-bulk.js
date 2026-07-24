import {handleOptions, readJson, sendJson, sendSolapiMessages} from "../_solapi.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, {ok: false, error: "POST 요청만 사용할 수 있습니다."});
  try {
    const data = await readJson(req);
    if (data.imageData) {
      return sendJson(res, 400, {
        ok: false,
        error: "Vercel 배포판에서는 이미지 MMS 업로드가 아직 제한됩니다. 텍스트 문자 또는 로컬 문자발송서버를 사용해주세요."
      });
    }
    const result = await sendSolapiMessages(data.to || [], String(data.text || ""));
    return sendJson(res, 200, {ok: true, result});
  } catch (error) {
    return sendJson(res, 400, {ok: false, error: error.message || "MMS 발송에 실패했습니다."});
  }
}
