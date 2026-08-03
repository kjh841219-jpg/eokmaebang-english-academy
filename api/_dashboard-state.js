import {get, put} from "@vercel/blob";
import fs from "node:fs";
import vm from "node:vm";

const STATE_PATH = "academy/dashboard-state.json";
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

export async function readPersistentState() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    globalThis.__beolgyoDashboardState ||= emptyState();
    return globalThis.__beolgyoDashboardState;
  }
  try {
    const result = await get(STATE_PATH, {access: "private"});
    if (!result?.stream) return emptyState();
    const stored = JSON.parse(await new Response(result.stream).text());
    return {...emptyState(), ...stored, students: normalizeStudents(stored.students)};
  } catch (error) {
    const message = String(error?.message || "");
    const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
    if (status === 404 || message.toLowerCase().includes("not found")) {
      return emptyState();
    }
    throw new Error(`Vercel Blob 저장소 읽기 실패: ${message || "알 수 없는 오류"}`);
  }
}

export function persistentStorageStatus() {
  return {
    configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    mode: process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "server-memory"
  };
}

function ensurePersistentStorage() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return;
  if (process.env.VERCEL) {
    throw new Error("Vercel Blob 저장소 토큰(BLOB_READ_WRITE_TOKEN)이 없어 두 프로그램 간 자료가 공유 저장되지 않습니다.");
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
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    globalThis.__beolgyoDashboardState = merged;
    return merged;
  }
  await put(STATE_PATH, JSON.stringify(merged), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0
  });
  return merged;
}
