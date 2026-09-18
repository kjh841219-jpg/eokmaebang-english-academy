import {readPersistentState, writePersistentState} from "../../lib/dashboard-state.js";
import {handleOptions, readJson, sendJson, sendSolapiMessages} from "../../lib/solapi.js";
import {attendanceMessage, parentPhone, validSmsSignature} from "../../lib/attendance.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!["GET", "POST"].includes(req.method)) return sendJson(res, 405, {ok: false, error: "GET 또는 POST 요청만 사용할 수 있습니다."});
  const body = req.method === "POST" ? await readJson(req) : req.query;
  const id = String(body.id || "");
  if (!validSmsSignature(id, String(body.token || ""))) return sendJson(res, 403, {ok: false, error: "유효하지 않은 문자 연결입니다."});
  try {
    const state = await readPersistentState();
    const records = Array.isArray(state.attendanceRecords) ? [...state.attendanceRecords] : [];
    const record = records.find(item => String(item.id) === id);
    const student = (state.students || []).find(item => String(item.id) === String(record?.studentId));
    const phone = parentPhone(student);
    if (!record || !student || phone.length < 10) return sendJson(res, 404, {ok: false, error: "등록된 학부모 전화번호가 없습니다."});
    if (req.method === "POST") {
      if (body.action === "send-solapi") {
        if (record.smsStatus === "solapi-sent") return sendJson(res, 409, {ok: false, sent: true, error: "이미 솔라피로 발송된 출결 문자입니다."});
        const [, month, day] = String(record.date).split("-");
        const message = attendanceMessage(student, record.statusCode, {displayDate: `${Number(month)}월 ${Number(day)}일`, time: record.time}, state.attendanceSettings);
        const result = await sendSolapiMessages(phone, message);
        record.smsStatus = "solapi-sent";
        record.parentSent = "솔라피 문자 발송 완료";
        record.smsSentAt = new Date().toISOString();
        record.solapiGroupId = String(result?.groupInfo?.groupId || result?.groupId || "");
        record.updatedAt = record.smsSentAt;
        await writePersistentState({...state, attendanceRecords: records});
        return sendJson(res, 200, {ok: true, message: "학부모님께 출결 문자를 발송했습니다."});
      }
      if (body.status === "native-sent") {
        record.smsStatus = "native-sent";
        record.parentSent = "안드로이드 일반 문자 발송 완료";
        record.smsSentAt = new Date().toISOString();
        record.updatedAt = record.smsSentAt;
        await writePersistentState({...state, attendanceRecords: records});
        return sendJson(res, 200, {ok: true});
      }
      const opened = body.status === "opened";
      record.smsStatus = opened ? "opened" : "skipped";
      record.parentSent = opened ? "문자 앱 열기 완료" : "문자 보내지 않음";
      record.updatedAt = new Date().toISOString();
      await writePersistentState({...state, attendanceRecords: records});
      return sendJson(res, 200, {ok: true});
    }
    const [, month, day] = String(record.date).split("-");
    const message = attendanceMessage(student, record.statusCode, {displayDate: `${Number(month)}월 ${Number(day)}일`, time: record.time}, state.attendanceSettings);
    const smsHref = `smsto:${phone}?body=${encodeURIComponent(message)}`;
    const postBody = JSON.stringify({id, token: String(body.token || ""), status: "opened"});
    const nativePostBody = JSON.stringify({id, token: String(body.token || ""), status: "native-sent"});
    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>출결 문자 보내기</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#edf8f4;color:#123b31;font-family:system-ui,-apple-system,"Malgun Gothic",sans-serif}
    main{width:min(92vw,520px);margin:7vh auto;background:#fff;border:1px solid #c8e3d9;border-radius:16px;padding:26px;box-shadow:0 14px 36px rgba(18,59,49,.12)}
    h1{margin:0 0 12px;font-size:25px;letter-spacing:0}p{line-height:1.65;margin:8px 0}.notice{padding:13px;background:#fff8df;border:1px solid #efd889;border-radius:9px;color:#725614}
    .message{margin:18px 0;padding:15px;white-space:pre-wrap;background:#f7fbfa;border:1px solid #d5e8e1;border-radius:9px;color:#244b42}
    .primary,.secondary{display:flex;width:100%;min-height:54px;align-items:center;justify-content:center;border-radius:9px;font-size:18px;font-weight:800;text-decoration:none;cursor:pointer}
    .primary{background:#087c59;color:#fff;border:0}.secondary{margin-top:10px;background:#fff;color:#17634f;border:1px solid #9fcfbe}.back{display:block;margin-top:18px;text-align:center;color:#507269}
  </style>
</head>
<body>
  <main>
    <h1>출결 문자 보내기</h1>
    <p><strong>${escapeHtml(student.name)}</strong> 학생의 학부모님께 보낼 문자입니다.</p>
    <p class="notice" id="notice">아래 버튼을 누르면 휴대폰의 기본 문자 앱이 열립니다. 문자 앱에서 <strong>전송 버튼을 한 번 더 눌러야</strong> 실제로 발송됩니다.</p>
    <div class="message">${escapeHtml(message)}</div>
    <a class="primary" id="openSms" href="${escapeHtml(smsHref)}">문자 앱 열기</a>
    <button class="secondary" id="copyMessage" type="button">문자 내용 복사</button>
    <a class="back" href="/student-attendance">출결 화면으로 돌아가기</a>
  </main>
  <script>
    const message = ${JSON.stringify(message)};
    const phone = ${JSON.stringify(phone)};
    window.nativeSmsResult = async (ok, detail) => {
      const notice = document.getElementById("notice");
      if (!ok) {
        notice.textContent = detail || "일반 문자 발송에 실패했습니다. SMS 권한을 확인해 주세요.";
        return;
      }
      notice.textContent = "일반 문자를 발송했습니다. 출결 화면으로 돌아갑니다.";
      await fetch("/api/student-attendance/sms", {method:"POST",headers:{"Content-Type":"application/json"},body:${JSON.stringify(nativePostBody)},keepalive:true}).catch(() => {});
      setTimeout(() => location.href = "/student-attendance", 1200);
    };
    if (window.AcademySms && typeof window.AcademySms.send === "function") {
      document.getElementById("notice").textContent = "휴대폰 일반 문자를 자동 발송하는 중입니다.";
      document.getElementById("openSms").style.display = "none";
      window.AcademySms.send(phone, message);
    }
    document.getElementById("openSms").addEventListener("click", () => {
      fetch("/api/student-attendance/sms", {method:"POST",headers:{"Content-Type":"application/json"},body:${JSON.stringify(postBody)},keepalive:true}).catch(() => {});
    });
    document.getElementById("copyMessage").addEventListener("click", async event => {
      try { await navigator.clipboard.writeText(message); event.currentTarget.textContent = "복사되었습니다"; }
      catch { window.prompt("아래 문자를 길게 눌러 복사해 주세요.", message); }
    });
  </script>
</body>
</html>`;
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(html);
  } catch (error) {
    return sendJson(res, 500, {ok: false, error: error?.message || "문자 발송 처리에 실패했습니다."});
  }
}
