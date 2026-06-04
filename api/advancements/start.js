const workerUrl = process.env.WORKER_URL;
const workerSecret = process.env.WORKER_SECRET;
const cache = require("../../lib/cache");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  if (!workerUrl || !workerSecret) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "WORKER_URL or WORKER_SECRET not configured" }));
    return;
  }

  const session = cache.getSession();
  if (!session) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Not logged in" }));
    return;
  }

  // mark running
  cache.setStatus("running");
  cache.setError(null);

  // forward to worker
  try {
    const r = await fetch(`${workerUrl.replace(/\/$/, "")}/advancements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify({ session }),
    });
    const json = await r.json();
    if (!r.ok) {
      cache.setStatus("error");
      cache.setError(new Error(json.error || "Worker error"));
      res.statusCode = r.status;
      res.end(JSON.stringify(json));
      return;
    }

    await cache.setAdvancements(json.data || null);
    cache.setStatus("ready");
    res.statusCode = 202;
    res.end(JSON.stringify({ status: cache.getStatus() }));
  } catch (err) {
    cache.setStatus("error");
    cache.setError(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Worker request failed", details: err.message }));
  }
};
