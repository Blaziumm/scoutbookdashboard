const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const LOGIN_URL =
  "https://advancements.scouting.org/login?redirectTo=https%3A%2F%2Fadvancements.scouting.org%2F";

function getEnv(name) {
  return process.env[name] || null;
}

module.exports = {
  LOGIN_URL,
  STORAGE_STATE_PATH: path.join(__dirname, "..", "storage", "state.json"),
  USERNAME: getEnv("ADVSCOUT_USERNAME"),
  PASSWORD: getEnv("ADVSCOUT_PASSWORD"),
};
