const cache = require("../../lib/cache");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  await cache.ensureLoaded();

  res.statusCode = 200;
  res.end(
    JSON.stringify({
      status: cache.getStatus(),
      error: cache.getError() ? cache.getError().message : null,
    })
  );
};
