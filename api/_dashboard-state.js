import {get, put} from "@vercel/blob";

const STATE_PATH = "academy/dashboard-state.json";

export const emptyState = () => ({
  savedAt: new Date().toISOString(),
  students: [],
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
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const status = Number(error?.status || error?.statusCode || error?.cause?.status || 0);
    if (status === 404 || message.includes("not found") || message.includes("no such")) {
      return emptyState();
    }
    throw error;
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
  });
  return merged;
}
