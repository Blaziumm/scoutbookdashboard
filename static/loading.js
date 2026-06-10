const statusEl = document.getElementById("loading-status");
let retryCount = 0;
const MAX_RETRIES = 3;

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.className = isError ? "form-status is-error" : "form-status";
}

async function attemptLogin() {
  const raw = sessionStorage.getItem("advLogin");
  if (!raw) return null;
  sessionStorage.removeItem("advLogin");

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!payload.username || !payload.password) return null;

  setStatus("Signing in...");
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchData(personId, token) {
  setStatus("Fetching advancements...");
  try {
    const res = await fetch(`/api/data?personId=${personId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function init() {
  const loginData = await attemptLogin();
  if (!loginData) {
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      setStatus("Retrying...", true);
      setTimeout(init, 3000);
      return;
    }
    setStatus("Login failed. Redirecting...", true);
    setTimeout(() => window.location.replace("/login"), 2000);
    return;
  }

  retryCount = 0;
  const { token, personId, events } = loginData;

  const data = await fetchData(personId, token);
  if (!data) {
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      setStatus("Data fetch failed. Retrying...", true);
      setTimeout(init, 3000);
      return;
    }
    setStatus("Session expired. Re-login...", true);
    setTimeout(() => window.location.replace("/login"), 2000);
    return;
  }

  sessionStorage.setItem("advToken", token);
  sessionStorage.setItem("advPersonId", personId);
  sessionStorage.setItem("advEvents", JSON.stringify(events || {}));

  const fullData = { ...data, personId, events };
  sessionStorage.setItem("advData", JSON.stringify(fullData));

  window.location.replace("/");
}

init();
