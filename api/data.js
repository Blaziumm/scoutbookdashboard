const BASE = "https://api.scouting.org";

async function fetchJson(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} for ${url}: ${body}`);
  }
  return res.json();
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Missing Authorization header" }));
    return;
  }
  const token = auth.replace("Bearer ", "");

  const url = new URL(req.url, "http://localhost");
  const personId = url.searchParams.get("personId");
  if (!personId) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Missing personId query param" }));
    return;
  }

  try {
    const [ranks, meritBadges, awards, userActivitySummary, leadershipPositionHistory] =
      await Promise.all([
        fetchJson(`${BASE}/advancements/v2/youth/${personId}/ranks`, token),
        fetchJson(
          `${BASE}/advancements/v2/youth/${personId}/meritBadges`,
          token
        ),
        fetchJson(`${BASE}/advancements/v2/youth/${personId}/awards`, token),
        fetchJson(
          `${BASE}/advancements/v2/${personId}/userActivitySummary`,
          token
        ),
        fetchJson(
          `${BASE}/advancements/youth/${personId}/leadershipPositionHistory?summary=true`,
          token
        ),
      ]);

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        personId,
        ranks,
        meritBadges,
        awards,
        userActivitySummary,
        leadershipPositionHistory,
      })
    );
  } catch (err) {
    res.statusCode = 502;
    res.end(
      JSON.stringify({
        error: "Failed to fetch scouting data",
        details: err.message,
      })
    );
  }
};
