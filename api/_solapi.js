import crypto from "node:crypto";

const SOLAPI_SEND_URL = "https://api.solapi.com/messages/v4/send-many/detail";

export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export function handleOptions(req, res) {
  if (req.method !== "OPTIONS") return false;
  sendJson(res, 204, {});
  return true;
}

export async function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function solapiConfig() {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const sender = (process.env.SOLAPI_FROM || "").replace(/[^0-9]/g, "");
  if (!apiKey || !apiSecret || !sender) {
    throw new Error("Vercel 환경변수 SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_FROM 설정이 필요합니다.");
  }
  return {apiKey, apiSecret, sender};
}

async function solapiRequest(url, payload) {
  const {apiKey, apiSecret} = solapiConfig();
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto.createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  const authorization = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {raw: text};
  }
  if (!response.ok) {
    throw new Error(data?.errorMessage || data?.message || `SOLAPI 요청 오류 (${response.status})`);
  }
  return data;
}

export async function sendSolapiMessages(recipients, text, kakaoOptions = null) {
  const {sender} = solapiConfig();
  const phones = (Array.isArray(recipients) ? recipients : [recipients])
    .map(value => String(value || "").replace(/[^0-9]/g, ""))
    .filter(value => value.length >= 10);
  if (!phones.length) throw new Error("발송할 수신번호가 없습니다.");
  if (!String(text || "").trim() && !kakaoOptions) throw new Error("발송할 메시지 내용이 없습니다.");

  const messages = phones.map(to => {
    const message = {to, from: sender};
    if (kakaoOptions) {
      message.kakaoOptions = kakaoOptions;
      if (!kakaoOptions.variables) message.text = text;
    } else {
      message.text = text;
    }
    return message;
  });

  const result = await solapiRequest(SOLAPI_SEND_URL, {messages, allowDuplicates: false});
  const failed = result.failedMessageList || [];
  const registeredSuccess = Number(result.groupInfo?.count?.registeredSuccess || 0);
  if (failed.length && registeredSuccess === 0) {
    const first = typeof failed[0] === "object" ? failed[0] : {};
    throw new Error(`SOLAPI 발송 실패 ${first.statusCode || ""} ${first.statusMessage || ""}`.trim());
  }
  return result;
}

export function kakaoOptions(kind, variables = null) {
  const pfId = process.env.SOLAPI_KAKAO_PFID?.trim();
  const templateKey = {
    leave: "SOLAPI_KAKAO_LEAVE_TEMPLATE_ID",
    daily: "SOLAPI_KAKAO_DAILY_TEMPLATE_ID",
    weekly: "SOLAPI_KAKAO_DAILY_TEMPLATE_ID",
    attendance: "SOLAPI_KAKAO_TEMPLATE_ID"
  }[kind] || "SOLAPI_KAKAO_TEMPLATE_ID";
  const templateId = process.env[templateKey]?.trim() || process.env.SOLAPI_KAKAO_TEMPLATE_ID?.trim();
  if (!pfId || !templateId) {
    throw new Error("Vercel 환경변수 SOLAPI_KAKAO_PFID와 승인된 카카오 템플릿 ID가 필요합니다.");
  }
  const options = {pfId, templateId, disableSms: false};
  if (variables && Object.keys(variables).length) options.variables = variables;
  return options;
}
