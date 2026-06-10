const { chromium } = require("playwright-core");

function getBrowserlessEndpoint() {
  const url = process.env.BROWSERLESS_WS_ENDPOINT;
  if (url) return url;
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) return null;
  return `wss://chrome.browserless.io?token=${token}`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let body;
  try {
    body = req.body || await new Promise((resolve) => {
      let d = "";
      req.on("data", (c) => (d += c.toString()));
      req.on("end", () => resolve(JSON.parse(d || "{}")));
    });
  } catch {
    body = {};
  }

  const { username, password } = body || {};
  if (!username || !password) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Missing username or password" }));
    return;
  }

  const endpoint = getBrowserlessEndpoint();
  if (!endpoint) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        error:
          "BROWSERLESS_WS_ENDPOINT not configured. Set BROWSERLESS_WS_ENDPOINT or BROWSERLESS_TOKEN in environment.",
      })
    );
    return;
  }

  let browser;
  try {
    browser = await chromium.connectOverCDP(endpoint);
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(
      "https://advancements.scouting.org/login?redirectTo=https%3A%2F%2Fadvancements.scouting.org%2F",
      { waitUntil: "networkidle" }
    );

    await page.waitForSelector('input[type="text"], input[type="email"]');
    await page.fill('input[type="text"], input[type="email"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"], input[type="submit"]');

    try {
      await page.waitForURL("https://advancements.scouting.org/**", {
        timeout: 30000,
      });
    } catch {
      await page.waitForLoadState("networkidle");
    }

    if (page.url().includes("/login")) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Login failed. Check credentials." }));
      return;
    }

    let personId = null;
    let token = null;

    const responseHandler = (response) => {
      const url = response.url();
      const m = url.match(/persons\/v2\/(\d+)\/personprofile/i);
      if (m) personId = m[1];
    };

    const requestHandler = (request) => {
      if (!request.url().includes("api.scouting.org")) return;
      const auth =
        request.headers().authorization || request.headers().Authorization;
      if (auth && auth.startsWith("Bearer ")) {
        token = auth.replace("Bearer ", "");
      }
    };

    page.on("response", responseHandler);
    page.on("request", requestHandler);

    await page.goto("https://advancements.scouting.org/profile", {
      waitUntil: "networkidle",
    });

    const start = Date.now();
    while ((!personId || !token) && Date.now() - start < 8000) {
      await page.waitForTimeout(250);
    }

    page.off("response", responseHandler);
    page.off("request", requestHandler);

    if (!token) {
      token = await page.evaluate(() => {
        const looksLikeJwt = (value) => {
          if (!value || typeof value !== "string") return false;
          const parts = value.split(".");
          return parts.length === 3;
        };

        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          const value = localStorage.getItem(key);
          if (looksLikeJwt(value)) return value;
          if (value && value.includes("access_token")) {
            try {
              const parsed = JSON.parse(value);
              if (looksLikeJwt(parsed.access_token))
                return parsed.access_token;
            } catch {}
          }
        }
        return null;
      });
    }

    if (!token || !personId) {
      res.statusCode = 500;
      res.end(
        JSON.stringify({ error: "Failed to capture session token or person ID" })
      );
      return;
    }

    let events = {
      monthLabel: null,
      timezone: null,
      events: [],
      subscriptions: [],
    };
    try {
      await page.goto("https://advancements.scouting.org/calendar", {
        waitUntil: "domcontentloaded",
        timeout: 5000,
      });
      await page.waitForSelector(".rbc-month-view", { timeout: 3000 });
      events = await page.evaluate(() => {
        const cleanText = (value) =>
          value ? value.replace(/\s+/g, " ").trim() : null;

        const monthLookup = {
          Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
          Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
        };

        const formatMonthDay = (monthIndex, day) => {
          const monthName = new Intl.DateTimeFormat("en-US", {
            month: "short",
          }).format(new Date(2026, monthIndex, 1));
          return `${monthName} ${day}`;
        };

        const monthLabel = cleanText(
          document.querySelector(".rbc-toolbar-label")?.textContent
        );
        const timezone = cleanText(
          document.querySelector(".Calendar__tzNote___WU0zc span span")
            ?.textContent ||
            document.querySelector(".Calendar__tzNote___WU0zc span")
              ?.textContent
        );
        const [monthToken] = (monthLabel || "").split(/\s+/);
        const currentMonthIndex = monthLookup[monthToken] ?? null;
        const previousMonthIndex =
          currentMonthIndex === null ? null : (currentMonthIndex + 11) % 12;

        const resolveDateDisplay = (cell, rowIndex) => {
          if (!cell) return null;
          const rawText = cleanText(cell.textContent);
          if (!rawText) return null;
          if (/^[A-Za-z]{3}\s+\d{1,2}$/.test(rawText)) return rawText;
          const day = Number(rawText);
          if (!Number.isFinite(day) || currentMonthIndex === null)
            return rawText;
          if (cell.classList.contains("rbc-off-range") && rowIndex === 0 && day >= 20)
            return formatMonthDay(previousMonthIndex, day);
          return formatMonthDay(currentMonthIndex, day);
        };

        const events = [];
        document.querySelectorAll(".rbc-month-row").forEach((row, rowIndex) => {
          const dateCells = Array.from(row.querySelectorAll(".rbc-date-cell"));
          const segments = Array.from(row.querySelectorAll(".rbc-row-segment"));
          const rowRect = row.getBoundingClientRect();

          const dateCellOffsets = dateCells.map((cell) => {
            const rect = cell.getBoundingClientRect();
            return {
              cell,
              left: Math.round(rect.left - rowRect.left),
            };
          });

          segments.forEach((segment, index) => {
            const segmentRect = segment.getBoundingClientRect();
            const segmentLeft = Math.round(segmentRect.left - rowRect.left);
            const dateCell =
              dateCellOffsets.find((entry) => entry.left === segmentLeft)
                ?.cell || dateCells[index];
            const dateDisplay = resolveDateDisplay(dateCell, rowIndex);
            const cards = Array.from(
              segment.querySelectorAll("[class*='MonthEvent__event']")
            );

            cards.forEach((card) => {
              const title =
                cleanText(card.querySelector("[title]")?.getAttribute("title")) ||
                cleanText(card.querySelector("span:last-child")?.textContent) ||
                cleanText(card.textContent);
              const time = cleanText(
                card.querySelector("[class*='MonthEvent__time']")?.textContent
              );
              if (!title) return;
              events.push({
                dateDisplay,
                time,
                title,
                classes: cleanText(card.className),
                style: card.getAttribute("style") || null,
              });
            });
          });
        });

        const subscriptions = Array.from(
          document.querySelectorAll(".ant-list-items > .ant-list-item")
        )
          .map((item) => {
            const title = cleanText(
              item.textContent.replace(/Copy url/g, "")
            );
            return title ? { title } : null;
          })
          .filter(Boolean);

        return {
          monthLabel,
          timezone,
          events,
          subscriptions,
        };
      });
    } catch {}

    await browser.close();

    res.statusCode = 200;
    res.end(JSON.stringify({ token, personId, events }));
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    res.statusCode = 500;
    res.end(
      JSON.stringify({ error: "Login failed", details: err.message })
    );
  }
};
