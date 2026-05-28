const { launchBrowser, newContextWithStorage } = require("./browser");
const { STORAGE_STATE_PATH } = require("./config");

async function probe() {
  const browser = await launchBrowser();
  const context = await newContextWithStorage(browser, STORAGE_STATE_PATH);
  const page = await context.newPage();

  page.on("request", (request) => {
    const url = request.url();
    const method = request.method();
    if (url.includes("google-analytics.com")) {
      return;
    }
    if (url.includes("advancements.scouting.org")) {
      const resourceType = request.resourceType();
      console.log(`[${resourceType.toUpperCase()}] [${method}] ${url}`);
    }
  });

  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("google-analytics.com")) {
      return;
    }

    const headers = response.headers();
    const contentType = headers["content-type"] || "";
    if (contentType.includes("application/json")) {
      console.log(`[JSON] [${response.status()}] ${url}`);
    }
  });

  await page.goto("https://advancements.scouting.org/", { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);

  await browser.close();
}

probe().catch((error) => {
  console.error(error);
  process.exit(1);
});
