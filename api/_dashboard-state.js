import {get, put} from "@vercel/blob";
import fs from "node:fs";
import vm from "node:vm";

const STATE_PATH = "academy/dashboard-state.json";
let cachedFallbackStudents = null;

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
          cachedFallbackStudents = vm.runInNewContext(html.slice(firstBracket, i + 1));
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
    return {...emptyState(), ...stored};
  } catch {
    return emptyState();
  }
}

export async function writePersistentState(state) {
  const merged = {...emptyState(), ...state, savedAt: new Date().toISOString()};
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    globalThis.__beolgyoDashboardState = merged;
    return merged;
  }
  await put(STATE_PATH, JSON.stringify(merged), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  }).catch(error => {
    const message = String(error?.message || "");
    if (!message.toLowerCase().includes("suspended")) throw error;
  });
  return merged;
}
