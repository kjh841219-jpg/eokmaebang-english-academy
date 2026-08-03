import {handleOptions, sendJson} from "../_solapi.js";
import {publicSupabaseConfig} from "./_db.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") {
    return sendJson(res, 405, {ok: false, error: "GET 요청만 사용할 수 있습니다."});
  }
  const {url, anonKey, configured} = publicSupabaseConfig();
  return sendJson(res, 200, {
    ok: true,
    configured,
    url: configured ? url : "",
    anonKey: configured ? anonKey : "",
    table: "homework_submissions"
  });
}
