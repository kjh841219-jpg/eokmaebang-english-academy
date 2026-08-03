import {handleOptions, sendJson, solapiStatus} from "../lib/solapi.js";
import {persistentStorageStatus} from "../lib/dashboard-state.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") {
    return sendJson(res, 405, {ok: false, error: "GET 요청만 사용할 수 있습니다."});
  }
  return sendJson(res, 200, {...solapiStatus(), storage: persistentStorageStatus()});
}
