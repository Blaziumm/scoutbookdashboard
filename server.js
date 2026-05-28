const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const publicDir = __dirname;
const port = process.env.PORT || 3000;
let sessionState = null;
let advancementsCache = null;
let advancementsStatus = "idle";
let advancementsError = null;

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function runAdvancementsJob(callback) {
  if (!sessionState) {
    callback(new Error("Not logged in"));
    return;
  }

  const tempPath = path.join(__dirname, "session.json");
  fs.writeFileSync(tempPath, JSON.stringify(sessionState), "utf8");
  const scriptPath = path.join(__dirname, "scripts", "run.js");
  const child = execFile(
    "node",
    [scriptPath, "read:advancements", "--quiet", "--session", tempPath],
    {
      cwd: __dirname,
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
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

  child.on("close", (code) => {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    if (code !== 0) {
      const isUnauthorized =
        (stderr || stdout).includes("Unauthorized") ||
        (stderr || stdout).includes("Missing JWT Token");
      const status = isUnauthorized ? 401 : 500;
      const error = new Error("Failed to run read:advancements");
      error.status = status;
      error.details = stderr || stdout;
      callback(error);
      return;
    }

    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No JSON output from script" }));
      return;
    }

    const jsonText = stdout.slice(jsonStart);
    callback(null, jsonText);
  });
}

function startAdvancements() {
  if (advancementsStatus === "running") {
    return;
  }
  advancementsStatus = "running";
  advancementsError = null;
  runAdvancementsJob((error, jsonText) => {
    if (error) {
      advancementsStatus = "error";
      advancementsError = error;
      if (error.status === 401) {
        sessionState = null;
      }
      return;
    }
    try {
      advancementsCache = JSON.parse(jsonText);
      advancementsStatus = "ready";
    } catch (parseError) {
      advancementsStatus = "error";
      advancementsError = parseError;
    }
  });
}

function runLogin(res, body) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  if (!payload.username || !payload.password) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing username or password" }));
    return;
  }

  const scriptPath = path.join(__dirname, "scripts", "login.js");
  const child = execFile("node", [scriptPath], {
    cwd: __dirname,
    env: {
      ...process.env,
      ADVSCOUT_USERNAME: payload.username,
      ADVSCOUT_PASSWORD: payload.password,
    },
    maxBuffer: 10 * 1024 * 1024,
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.on("close", (code) => {
    if (code !== 0) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Login failed",
          details: stderr || stdout,
        })
      );
      return;
    }

    try {
      const jsonStart = stdout.indexOf("{");
      if (jsonStart === -1) {
        throw new Error("No JSON session output");
      }
      sessionState = JSON.parse(stdout.slice(jsonStart));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to parse session" }));
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/advancements/start") {
    if (!sessionState) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not logged in" }));
      return;
    }
    startAdvancements();
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: advancementsStatus }));
    return;
  }

  if (req.url === "/api/advancements/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: advancementsStatus,
        error: advancementsError ? advancementsError.message : null,
      })
    );
    return;
  }

  if (req.url === "/api/advancements/data") {
    if (!sessionState) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not logged in" }));
      return;
    }
    if (advancementsStatus !== "ready" || !advancementsCache) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Data not ready" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(advancementsCache));
    return;
  }

  if (req.url === "/api/login" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      runLogin(res, body);
    });
    return;
  }

  if (req.url === "/login") {
    serveFile(path.join(publicDir, "login.html"), res);
    return;
  }

  if (req.url === "/loading") {
    serveFile(path.join(publicDir, "loading.html"), res);
    return;
  }

  if (req.url === "/" && !sessionState) {
    res.writeHead(302, { Location: "/login" });
    res.end();
    return;
  }

  const requestPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(publicDir, decodeURIComponent(requestPath));
  serveFile(filePath, res);
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
