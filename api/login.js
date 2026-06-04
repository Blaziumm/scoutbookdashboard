/**
 * POST /api/login
 * Body: { username, password }
 * Forwards the credentials to the worker and stores session in-memory for this instance.
 */

const workerUrl = process.env.WORKER_URL;
const workerSecret = process.env.WORKER_SECRET;
const cache = require("../lib/cache");

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

  let body;
  try {
    body = req.body || (await new Promise((r) => {
      let d = "";
      req.on("data", (c) => (d += c.toString()));
      req.on("end", () => r(JSON.parse(d || "{}")));
    }));
  } catch (err) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const { username, password } = body || {};
  if (!username || !password) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Missing username or password" }));
    return;
  }

  try {
    const r = await fetch(`${workerUrl.replace(/\/$/, "")}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify({ username, password }),
    });

    const json = await r.json();
    if (!r.ok) {
      res.statusCode = r.status;
      res.end(JSON.stringify(json));
      return;
    }

    // store session in memory and durable store (if configured)
    await cache.setSession(json.session || null);

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Worker request failed", details: err.message }));
  }
};

module.exports._getSession = () => sessionState;

if (require.main === module) {
  // for testing, run with: node api/login.js
  const http = require("http");
  const port = process.env.PORT || 3000;
  http.createServer(module.exports).listen(port, () => {
    console.log(`Login API running on port ${port}`);
  });
}