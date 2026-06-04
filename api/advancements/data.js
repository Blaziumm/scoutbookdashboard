const cache = require("../../lib/cache");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  await cache.ensureLoaded();

  const session = cache.getSession();
  if (!session) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Not logged in" }));
    return;
  }

  if (cache.getStatus() !== "ready" || !cache.getAdvancements()) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Data not ready" }));
    return;
  }

  res.statusCode = 200;
  res.end(JSON.stringify(cache.getAdvancements()));
};
