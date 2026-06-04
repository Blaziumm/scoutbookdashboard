const { execFile } = require("child_process");
const path = require("path");
const workerUrl = process.env.WORKER_URL;
const workerSecret = process.env.WORKER_SECRET;
const cache = require("../lib/cache");

async function runLocalLogin(username, password) {
  const scriptPath = path.join(__dirname, "..", "scripts", "login.js");
  const child = execFile("node", [scriptPath], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      ADVSCOUT_USERNAME: username,
      ADVSCOUT_PASSWORD: password,
    },
    maxBuffer: 50 * 1024 * 1024,
  });

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
      if (code !== 0) {
        reject(new Error(stderr || stdout || "Login script failed"));
        return;
      }

      const jsonStart = stdout.indexOf("{");
      if (jsonStart === -1) {
        reject(new Error("No JSON session output"));
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
    if (workerUrl && workerSecret) {
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

      await cache.setSession(json.session || null);
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const session = await runLocalLogin(username, password);
    await cache.setSession(session || null);

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Login failed", details: err.message }));
  }
};