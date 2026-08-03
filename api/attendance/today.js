import {handleOptions, sendJson} from "../../lib/solapi.js";

function publicOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") {
    return sendJson(res, 405, {ok: false, error: "GET 요청만 사용할 수 있습니다."});
  }
  const origin = publicOrigin(req);
  return sendJson(res, 200, {
    ok: true,
    date: new Date().toLocaleDateString("en-CA", {timeZone: "Asia/Seoul"}),
    studentUrl: `${origin}/student-attendance`,
    localUrl: `${origin}/student-attendance`,
    dailyCbtStudentUrl: `${origin}/daily-cbt`,
    dailyCbtLocalUrl: `${origin}/daily-cbt`
  });
}
