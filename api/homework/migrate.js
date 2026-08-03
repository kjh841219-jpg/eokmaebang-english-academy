import {handleOptions, readJson, sendJson} from "../_solapi.js";
import {insertHomeworkSubmission, listHomeworkSubmissions} from "./_db.js";

function recordKey(record = {}) {
  return String(record.id || `${record.name || record.student_name || ""}|${record.title || record.homework_title || ""}|${record.createdAt || record.submitted_at || record.date || ""}`);
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return sendJson(res, 405, {ok: false, error: "POST 요청만 사용할 수 있습니다."});
  }

  try {
    const data = await readJson(req);
    const incoming = Array.isArray(data.records) ? data.records : [];
    const existing = await listHomeworkSubmissions();
    const existingKeys = new Set(existing.map(recordKey));
    const inserted = [];
    const skipped = [];

    for (const record of incoming) {
      const key = recordKey(record);
      if (!key || existingKeys.has(key)) {
        skipped.push(key);
        continue;
      }
      const saved = await insertHomeworkSubmission(record);
      inserted.push(saved);
      existingKeys.add(key);
    }

    return sendJson(res, 200, {
      ok: true,
      insertedCount: inserted.length,
      skippedCount: skipped.length,
      inserted
    });
  } catch (error) {
    return sendJson(res, 500, {ok: false, error: error.message || "숙제 데이터 이전에 실패했습니다."});
  }
}
