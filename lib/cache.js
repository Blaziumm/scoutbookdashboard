// Simple in-memory cache for warm Vercel instances.
// Note: Serverless functions may be cold-started; this cache is per-instance.

const s3 = process.env.AWS_S3_BUCKET ? require("./store-s3") : null;

let session = null;
let advancements = null;
let advancementsStatus = "idle";
let advancementsError = null;

async function loadFromS3() {
  if (!s3) return;
  try {
    const sess = await s3.getJson("shared/session.json");
    if (sess) session = sess;
  } catch (err) {
    // ignore
  }
  try {
    const adv = await s3.getJson("shared/advancements.json");
    if (adv) advancements = adv;
  } catch (err) {
    // ignore
  }
}

// kick off load but don't await to avoid blocking module import
loadFromS3();

async function setSession(s) {
  session = s;
  if (s3) {
    try {
      await s3.putJson("shared/session.json", s);
    } catch (err) {
      // ignore
    }
  }
}

async function setAdvancements(a) {
  advancements = a;
  if (s3) {
    try {
      await s3.putJson("shared/advancements.json", a);
    } catch (err) {
      // ignore
    }
  }
}

function getSession() {
  return session;
}

function getAdvancements() {
  return advancements;
}

function getStatus() {
  return advancementsStatus;
}

function setStatus(s) {
  advancementsStatus = s;
}

function getError() {
  return advancementsError;
}

function setError(e) {
  advancementsError = e;
}

module.exports = {
  getSession,
  setSession,
  getAdvancements,
  setAdvancements,
  getStatus,
  setStatus,
  getError,
  setError,
};
