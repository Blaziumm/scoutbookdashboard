const { chromium } = require("playwright-core");
const fs = require("fs");

function getBrowserlessEndpoint() {
  const explicitEndpoint =
    process.env.BROWSERLESS_WS_ENDPOINT ||
    process.env.BROWSERLESS_ENDPOINT ||
    process.env.BROWSERLESS_URL;

  if (explicitEndpoint) {
    return explicitEndpoint;
  }

  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) {
    return null;
  }

  const host = process.env.BROWSERLESS_HOST || "chrome.browserless.io";
  const endpoint = new URL(`wss://${host}`);
  endpoint.searchParams.set("token", token);
  return endpoint.toString();
}

async function launchBrowser() {
  const browserlessEndpoint = getBrowserlessEndpoint();
  if (browserlessEndpoint) {
    return chromium.connectOverCDP(browserlessEndpoint);
  }

  return chromium.launch({ headless: false });
}

function storageStateExists(storageStatePath) {
  return fs.existsSync(storageStatePath);
}

async function newContextWithStorage(browser, storageState) {
  if (storageState && typeof storageState === "object") {
    return browser.newContext({ storageState });
  }
  if (storageState && typeof storageState === "string" && storageStateExists(storageState)) {
    return browser.newContext({ storageState });
  }
  return browser.newContext();
}

module.exports = {
  launchBrowser,
  newContextWithStorage,
  storageStateExists,
};
