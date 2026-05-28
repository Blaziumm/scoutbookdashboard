const { chromium } = require("playwright");
const fs = require("fs");

async function launchBrowser() {
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
