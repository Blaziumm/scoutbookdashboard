const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const workerUrl = process.env.WORKER_URL;
const workerSecret = process.env.WORKER_SECRET;
const cache = require("../../lib/cache");

async function runLocalAdvancements(session) {
  const tempPath = path.join(__dirname, "..", "..", `session-${Date.now()}.json`);
  fs.writeFileSync(tempPath, JSON.stringify(session), "utf8");

  const scriptPath = path.join(__dirname, "..", "..", "scripts", "run.js");
  const child = execFile(
    "node",
    [scriptPath, "read:advancements", "--quiet", "--session", tempPath],
    {
      cwd: path.join(__dirname, "..", ".."),
      env: process.env,
      maxBuffer: 50 * 1024 * 1024,
    }
  );

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

      if (code !== 0) {
        reject(new Error(stderr || stdout || "Advancements job failed"));
        return;
      }

      const jsonStart = stdout.indexOf("{");
      if (jsonStart === -1) {
        reject(new Error("No JSON output from run.js"));
        return;
      }

      try {
        resolve(JSON.parse(stdout.slice(jsonStart)));
      } catch (error) {
        reject(error);
      }
    });
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
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

  try {
    if (workerUrl && workerSecret) {
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
    } else {
      const data = await runLocalAdvancements(session);
      await cache.setAdvancements(data || null);
    }

    cache.setStatus("ready");
    res.statusCode = 202;
    res.end(JSON.stringify({ status: cache.getStatus() }));
  } catch (err) {
    cache.setStatus("error");
    cache.setError(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Advancements job failed", details: err.message }));
  }
};
