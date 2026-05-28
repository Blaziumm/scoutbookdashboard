const { launchBrowser, newContextWithStorage, storageStateExists } = require("./browser");
const { STORAGE_STATE_PATH } = require("./config");
const fs = require("fs");
const path = require("path");

async function ensureLoggedIn(page) {
  await page.goto("https://advancements.scouting.org/", { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    throw new Error("Session expired or missing. Run: npm run login");
  }
}

function extractIdsFromUrl(url) {
  const personIdMatch = url.match(/persons\/v2\/(\d+)\/personprofile/i);
  const personGuidMatch = url.match(/persons\/([0-9a-fA-F-]{36})\//i);
  return {
    personId: personIdMatch ? personIdMatch[1] : null,
    personGuid: personGuidMatch ? personGuidMatch[1] : null,
  };
}

async function captureContextIds(page) {
  let personId = null;
  let personGuid = null;
  let token = null;

  const responseHandler = (response) => {
    const url = response.url();
    if (!url.includes("api.scouting.org")) {
      return;
    }
    const ids = extractIdsFromUrl(url);
    if (ids.personId) {
      personId = ids.personId;
    }
    if (ids.personGuid) {
      personGuid = ids.personGuid;
    }
  };

  const requestHandler = (request) => {
    const url = request.url();
    if (!url.includes("api.scouting.org")) {
      return;
    }
    const headers = request.headers();
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    }
  };

  page.on("response", responseHandler);
  page.on("request", requestHandler);
  await page.goto("https://advancements.scouting.org/profile", { waitUntil: "networkidle" });

  const start = Date.now();
  while ((!personId || !personGuid || !token) && Date.now() - start < 15000) {
    await page.waitForTimeout(250);
  }

  page.off("response", responseHandler);
  page.off("request", requestHandler);

  return { personId, personGuid, token };
}

async function findJwtToken(page) {
  const token = await page.evaluate(() => {
    const looksLikeJwt = (value) => {
      if (!value || typeof value !== "string") {
        return false;
      }
      const parts = value.split(".");
      return parts.length === 3 && parts[0].length > 10 && parts[1].length > 10;
    };

    const scanStorage = (storage) => {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        const value = storage.getItem(key);
        if (looksLikeJwt(value)) {
          return value;
        }

        if (value && value.includes("access_token")) {
          try {
            const parsed = JSON.parse(value);
            if (looksLikeJwt(parsed.access_token)) {
              return parsed.access_token;
            }
          } catch (error) {
            // ignore
          }
        }
      }
      return null;
    };

    return scanStorage(window.localStorage) || scanStorage(window.sessionStorage);
  });

  return token;
}

async function apiGetJson(context, url, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const response = await context.request.get(url, { headers });
  if (!response.ok()) {
    const status = response.status();
    const body = await response.text();
    throw new Error(`Request failed (${status}) for ${url}: ${body}`);
  }
  return response.json();
}

async function readAdvancements(context, page) {
  const { personId, token: capturedToken } = await captureContextIds(page);
  if (!personId) {
    throw new Error("Unable to determine personId from profile page.");
  }

  const token = capturedToken || (await findJwtToken(page));
  if (!token) {
    throw new Error("Unable to find JWT token in browser storage.");
  }

  const base = "https://api.scouting.org";
  const ranks = await apiGetJson(
    context,
    `${base}/advancements/v2/youth/${personId}/ranks`,
    token
  );
  const meritBadges = await apiGetJson(
    context,
    `${base}/advancements/v2/youth/${personId}/meritBadges`,
    token
  );
  const awards = await apiGetJson(
    context,
    `${base}/advancements/v2/youth/${personId}/awards`,
    token
  );
  const userActivitySummary = await apiGetJson(
    context,
    `${base}/advancements/v2/${personId}/userActivitySummary`,
    token
  );
  const leadershipPositionHistory = await apiGetJson(
    context,
    `${base}/advancements/youth/${personId}/leadershipPositionHistory?summary=true`,
    token
  );

  return {
    personId,
    ranks,
    meritBadges,
    awards,
    userActivitySummary,
    leadershipPositionHistory,
  };
}

async function readMeritBadges(context, page) {
  const { personId, token: capturedToken } = await captureContextIds(page);
  if (!personId) {
    throw new Error("Unable to determine personId from profile page.");
  }

  const token = capturedToken || (await findJwtToken(page));
  if (!token) {
    throw new Error("Unable to find JWT token in browser storage.");
  }

  const base = "https://api.scouting.org";
  const meritBadges = await apiGetJson(
    context,
    `${base}/advancements/v2/youth/${personId}/meritBadges`,
    token
  );

  return { personId, meritBadges };
}

async function readEvents() {
  throw new Error(
    "Events endpoint not discovered yet. Run: npm run probe and click Events to capture the API URL."
  );
}

async function readProfile(context, page) {
  const { personId, personGuid, token: capturedToken } = await captureContextIds(page);
  if (!personId && !personGuid) {
    throw new Error("Unable to determine person identifiers from profile page.");
  }

  const token = capturedToken || (await findJwtToken(page));
  if (!token) {
    throw new Error("Unable to find JWT token in browser storage.");
  }

  const base = "https://api.scouting.org";
  if (personId) {
    const profile = await apiGetJson(
      context,
      `${base}/persons/v2/${personId}/personprofile`,
      token
    );
    return { personId, profile };
  }

  const profile = await apiGetJson(
    context,
    `${base}/persons/v2/${personGuid}/personprofile`,
    token
  );
  return { personGuid, profile };
}

async function main() {
  const action = process.argv[2];
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex !== -1 ? process.argv[outIndex + 1] : null;
  const isQuiet = process.argv.includes("--quiet");
  const sessionIndex = process.argv.indexOf("--session");
  const sessionPath = sessionIndex !== -1 ? process.argv[sessionIndex + 1] : null;
  if (!action) {
    throw new Error("Missing action. Example: node scripts/run.js read:advancements");
  }

  if (outIndex !== -1 && !outPath) {
    throw new Error("Missing value after --out");
  }

  if (sessionIndex !== -1 && !sessionPath) {
    throw new Error("Missing value after --session");
  }

  let storageState = null;
  if (sessionPath) {
    if (!fs.existsSync(sessionPath)) {
      throw new Error("Session file not found. Run login first.");
    }
    const content = fs.readFileSync(sessionPath, "utf8");
    storageState = JSON.parse(content);
  } else if (storageStateExists(STORAGE_STATE_PATH)) {
    storageState = STORAGE_STATE_PATH;
  } else {
    throw new Error("No stored session found. Run: npm run login");
  }

  const browser = await launchBrowser();
  const context = await newContextWithStorage(browser, storageState);
  const page = await context.newPage();

  await ensureLoggedIn(page);

  let result;
  switch (action) {
    case "read:advancements":
      result = await readAdvancements(context, page);
      break;
    case "read:meritbadges":
      result = await readMeritBadges(context, page);
      break;
    case "read:events":
      result = await readEvents(context, page);
      break;
    case "read:profile":
      result = await readProfile(context, page);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }

  const output = JSON.stringify(result, null, 2);
  if (outPath) {
    fs.writeFileSync(outPath, `${output}\n`, "utf8");
    if (!isQuiet) {
      console.log(`Saved output to ${outPath}`);
    }
  }

  if (!isQuiet && action === "read:advancements" && !outPath) {
    const debugPath = path.join(__dirname, "..", "debug-advancements.txt");
    fs.writeFileSync(debugPath, `${output}\n`, "utf8");
    console.log(`Saved output to ${debugPath}`);
  }

  console.log(output);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
