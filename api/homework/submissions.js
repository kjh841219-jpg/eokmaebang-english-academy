import {handleOptions, readJson, sendJson} from "../_solapi.js";
import {
  deleteHomeworkSubmission,
  insertHomeworkSubmission,
  listHomeworkSubmissions,
  updateHomeworkSubmission
} from "./_db.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    if (req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        homeworkSubmissions: await listHomeworkSubmissions(),
        fetchedAt: new Date().toISOString()
      });
    }

    if (req.method === "POST") {
      const data = await readJson(req);
      const record = await insertHomeworkSubmission(data.record || data);
      return sendJson(res, 200, {ok: true, result: {record}});
    }

    if (req.method === "PATCH") {
      const data = await readJson(req);
      const record = await updateHomeworkSubmission(data.id, data.patch || data.changes || {});
      return sendJson(res, 200, {ok: true, result: {record}});
    }

    if (req.method === "DELETE") {
      const data = await readJson(req);
      const result = await deleteHomeworkSubmission(data.id);
      return sendJson(res, 200, {ok: true, result});
    }

    return sendJson(res, 405, {ok: false, error: "GET, POST, PATCH, DELETE 요청만 사용할 수 있습니다."});
  } catch (error) {
    return sendJson(res, 500, {ok: false, error: error.message || "숙제 제출 데이터 처리에 실패했습니다."});
  }
}
