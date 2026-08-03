import {get, put} from "@vercel/blob";
import fs from "node:fs";
import vm from "node:vm";

const STATE_PATH = "academy/dashboard-state.json";
const SUPABASE_TABLE = "academy_dashboard_state";
const SUPABASE_STATE_ID = "main";
let cachedFallbackStudents = null;

function normalizeStudents(students) {
  if (!Array.isArray(students)) return [];
  return students.map((student, index) => {
    if (Array.isArray(student)) {
      return {
        id: index + 1,
        name: student[0] || `학생${index + 1}`,
        school: student[1] === "-" ? "" : (student[1] || ""),
        phone: student[2] === "-" ? "" : (student[2] || ""),
        studentPhone: student[3] === "-" ? "" : (student[3] || ""),
        grade: student[0] === "김정해" ? "초등 1학년" : "",
        parentName: "보호자",
        classGroup: student[0] === "김정해" ? "초등반" : (index < 35 ? "초등반" : (index < 45 ? "중등반" : "고등반")),
        enrollDate: "2026-06-25",
        monthlyFee: index < 35 ? 150000 : (index < 45 ? 200000 : 250000),
        payDay: 5,
        attendance: student[4] || "미입력",
        attendanceTime: student[5] || "",
        note: student[6] || "",
        status: "재원생"
      };
    }
    return {
      ...student,
      id: student.id || index + 1,
      name: student.name || `학생${index + 1}`,
      phone: student.phone || student.parentPhone || "",
      studentPhone: student.studentPhone || ""
    };
  });
}

function extractStudentsFromDashboard() {
  if (cachedFallbackStudents) return cachedFallbackStudents;
  try {
    const dashboardPath = new URL("../index.html", import.meta.url);
    const html = fs.readFileSync(dashboardPath, "utf8");
    const startToken = "let students = [";
    const start = html.indexOf(startToken);
    if (start < 0) return [];
    const firstBracket = html.indexOf("[", start);
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let i = firstBracket; i < html.length; i += 1) {
      const ch = html[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === "\"" || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === "[") depth += 1;
      if (ch === "]") {
        depth -= 1;
        if (depth === 0) {
          cachedFallbackStudents = normalizeStudents(vm.runInNewContext(html.slice(firstBracket, i + 1)));
          return cachedFallbackStudents;
        }
      }
    }
  } catch {
    cachedFallbackStudents = [];
  }
  return cachedFallbackStudents || [];
}

export const emptyState = () => ({
  savedAt: new Date().toISOString(),
  students: extractStudentsFromDashboard(),
  messages: [],
  smsContentTemplates: [],
  attendanceRecords: [],
  academySchedules: [],
  homeworkSubmissions: [],
  dailyMiniTests: [],
  dailyMiniBank: {}
});

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return {url, serviceKey, configured: Boolean(url && serviceKey)};
}

function supabaseHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
}

async function readSupabaseState() {
  const {url, serviceKey, configured} = supabaseConfig();
  if (!configured) return null;
  const response = await fetch(
    `${url}/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(SUPABASE_STATE_ID)}&select=state`,
    {headers: supabaseHeaders(serviceKey), cache: "no-store"}
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase 저장소 읽기 실패(${response.status}): ${text || response.statusText}`);
  }
  const rows = await response.json();
  const stored = Array.isArray(rows) && rows[0]?.state ? rows[0].state : null;
  return stored ? {...emptyState(), ...stored, students: normalizeStudents(stored.students)} : emptyState();
}

async function writeSupabaseState(state) {
  const {url, serviceKey, configured} = supabaseConfig();
  if (!configured) return null;
  const response = await fetch(
    `${url}/rest/v1/${SUPABASE_TABLE}?on_conflict=id`,
    {
      method: "POST",
      headers: {
        ...supabaseHeaders(serviceKey),
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([{
        id: SUPABASE_STATE_ID,
        state,
        updated_at: new Date().toISOString()
      }])
    }
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase 저장소 저장 실패(${response.status}): ${text || response.statusText}`);
  }
  return state;
}

export async function readPersistentState() {
  if (supabaseConfig().configured) {
    return await readSupabaseState();
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    globalThis.__beolgyoDashboardState ||= emptyState();
    return globalThis.__beolgyoDashboardState;
  }
  try {
    const result = await get(STATE_PATH, {access: "private", useCache: false});
    if (!result?.stream) return emptyState();
    const stored = JSON.parse(await new Response(result.stream).text());
    return {...emptyState(), ...stored, students: normalizeStudents(stored.students)};
  } catch (error) {
    const message = String(error?.message || "");
    const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
    const lowerMessage = message.toLowerCase();
    if (status === 404 || lowerMessage.includes("not found") || status === 403 || lowerMessage.includes("403 forbidden")) {
      return emptyState();
    }
    throw new Error(`Vercel Blob 저장소 읽기 실패: ${message || "알 수 없는 오류"}`);
  }
}

export function persistentStorageStatus() {
  const supabase = supabaseConfig();
  return {
    configured: supabase.configured || Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    mode: supabase.configured ? "supabase" : (process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "server-memory"),
    supabaseConfigured: supabase.configured,
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  };
}

function ensurePersistentStorage() {
  if (supabaseConfig().configured) return;
  if (process.env.BLOB_READ_WRITE_TOKEN) return;
  if (process.env.VERCEL) {
    throw new Error("실시간 공유 저장소가 설정되지 않았습니다. SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 Vercel 환경변수에 추가해 주세요.");
  }
}

export async function readPersistentStateSafe() {
  try {
    return await readPersistentState();
  } catch {
    return emptyState();
  }
}

export async function writePersistentState(state) {
  ensurePersistentStorage();
  const merged = {...emptyState(), ...state, students: normalizeStudents(state.students), savedAt: new Date().toISOString()};
  if (supabaseConfig().configured) {
    await writeSupabaseState(merged);
    return merged;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    globalThis.__beolgyoDashboardState = merged;
    return merged;
  }
  await put(STATE_PATH, JSON.stringify(merged), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });
  return merged;
}
