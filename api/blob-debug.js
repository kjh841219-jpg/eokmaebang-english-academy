import {get, put} from "@vercel/blob";
import {sendJson} from "./_solapi.js";

const TEST_PATH = "academy/blob-debug.json";

function safeError(error) {
  return {
    name: error?.name || "",
    message: String(error?.message || "").slice(0, 300),
    status: error?.status || error?.statusCode || error?.cause?.status || ""
  };
}

export default async function handler(req, res) {
  const result = {
    ok: true,
    hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    hasStoreId: Boolean(process.env.BLOB_STORE_ID),
    put: null,
    get: null
  };

  try {
    const uploaded = await put(TEST_PATH, JSON.stringify({checkedAt: new Date().toISOString()}), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60
    });
    result.put = {ok: true, pathname: uploaded.pathname};
  } catch (error) {
    result.put = {ok: false, error: safeError(error)};
  }

  try {
    const downloaded = await get(TEST_PATH, {access: "private", useCache: false});
    result.get = {ok: Boolean(downloaded?.stream), pathname: downloaded?.blob?.pathname || ""};
  } catch (error) {
    result.get = {ok: false, error: safeError(error)};
  }

  return sendJson(res, 200, result);
}
