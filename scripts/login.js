const { launchBrowser } = require("./browser");
const { LOGIN_URL, USERNAME, PASSWORD } = require("./config");

async function login() {
  if (!USERNAME || !PASSWORD) {
    throw new Error("Missing ADVSCOUT_USERNAME or ADVSCOUT_PASSWORD");
  }

  const browser = await launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });

  await page.waitForSelector("input[type=\"text\"], input[type=\"email\"]");
  const userInput = await page.$("input[type=\"text\"], input[type=\"email\"]");
  if (!userInput) {
    throw new Error("Username input not found");
  }

  await userInput.fill(USERNAME);

  const passInput = await page.$("input[type=\"password\"]");
  if (!passInput) {
    throw new Error("Password input not found");
  }
  await passInput.fill(PASSWORD);

  const submitButton = await page.$("button[type=\"submit\"], input[type=\"submit\"]");
  if (!submitButton) {
    throw new Error("Submit button not found");
  }

  await submitButton.click();

  try {
    await page.waitForURL("https://advancements.scouting.org/profile", {
      timeout: 30000,
      waitUntil: "networkidle",
    });
  } catch (error) {
    await page.waitForLoadState("networkidle");
  }

  if (page.url().includes("/login")) {
    throw new Error("Login did not complete. Check credentials or extra auth steps.");
  }

  const state = await context.storageState();
  await browser.close();
  console.log(JSON.stringify(state));
}

login().catch((error) => {
  console.error(error);
  process.exit(1);
});
