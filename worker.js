const express = require("express");
const bodyParser = require("body-parser");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(bodyParser.json({ limit: "5mb" }));
const s3 = process.env.AWS_S3_BUCKET ? require("./lib/store-s3") : null;

// Simple secret-based auth for the worker API. Set WORKER_SECRET in env.
const WORKER_SECRET = process.env.WORKER_SECRET || null;
function requireAuth(req, res, next) {
  if (!WORKER_SECRET) {
    return res.status(500).json({ error: "Worker not configured (no WORKER_SECRET)" });
  }
  const header = req.get("authorization") || req.get("x-worker-secret");
  if (!header || header !== `Bearer ${WORKER_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// POST /login
// body: { username, password }
// Runs scripts/login.js with provided credentials and returns the storage state JSON.
app.post("/login", requireAuth, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Missing username or password" });
  }

  const env = { ...process.env, ADVSCOUT_USERNAME: username, ADVSCOUT_PASSWORD: password };
  const scriptPath = path.join(__dirname, "scripts", "login.js");
  const child = execFile("node", [scriptPath], { env, cwd: __dirname, maxBuffer: 50 * 1024 * 1024 });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (c) => (stdout += c.toString()));
  child.stderr.on("data", (c) => (stderr += c.toString()));

  child.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: "Login failed", details: stderr || stdout });
    }
    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) {
      return res.status(500).json({ error: "No JSON output from login", details: stderr || stdout });
    }
    try {
      const session = JSON.parse(stdout.slice(jsonStart));
      // persist to S3 if configured
      if (s3) {
        try {
          await s3.putJson("shared/session.json", session);
        } catch (err) {
          // ignore
        }
      }
      return res.json({ ok: true, session });
    } catch (err) {
      return res.status(500).json({ error: "Failed to parse session", details: err.message });
    }
  });
});

// POST /advancements
// body: { session } where session is the storageState JSON produced by login
// Runs scripts/run.js read:advancements --session <tempfile> and returns the JSON result
app.post("/advancements", requireAuth, async (req, res) => {
  const session = req.body && req.body.session;
  if (!session) {
    return res.status(400).json({ error: "Missing session in request body" });
  }

  const tmpPath = path.join(__dirname, `session-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(session), "utf8");
  } catch (err) {
    return res.status(500).json({ error: "Failed to write session file", details: err.message });
  }

  const scriptPath = path.join(__dirname, "scripts", "run.js");
  const child = execFile("node", [scriptPath, "read:advancements", "--quiet", "--session", tmpPath], {
    env: process.env,
    cwd: __dirname,
    maxBuffer: 50 * 1024 * 1024,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (c) => (stdout += c.toString()));
  child.stderr.on("data", (c) => (stderr += c.toString()));

  child.on("close", (code) => {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (e) {
      // ignore
    }
    if (code !== 0) {
      return res.status(500).json({ error: "Advancements job failed", details: stderr || stdout });
    }
    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) {
      return res.status(500).json({ error: "No JSON output from run.js", details: stderr || stdout });
    }
    try {
      const data = JSON.parse(stdout.slice(jsonStart));
      if (s3) {
        try {
          await s3.putJson("shared/advancements.json", data);
        } catch (err) {
          // ignore
        }
      }
      return res.json({ ok: true, data });
    } catch (err) {
      return res.status(500).json({ error: "Failed to parse output", details: err.message });
    }
  });
});

const port = process.env.WORKER_PORT || 4000;
app.listen(port, () => {
  console.log(`Worker listening on port ${port}`);
});

module.exports = app;
