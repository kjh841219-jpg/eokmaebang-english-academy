import {get, put} from "@vercel/blob";

const STATE_PATH = "academy/dashboard-state.json";

export const emptyState = () => ({
  savedAt: new Date().toISOString(),
  students: [],
  messages: [],
  smsContentTemplates: [],
  attendanceRecords: [],
  academySchedules: []
});

export async function readPersistentState() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    globalThis.__beolgyoDashboardState ||= emptyState();
    return globalThis.__beolgyoDashboardState;
  }
  const result = await get(STATE_PATH, {access: "private"});
  if (!result?.stream) return emptyState();
  return JSON.parse(await new Response(result.stream).text());
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
