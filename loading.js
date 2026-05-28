const statusEl = document.getElementById("loading-status");

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.className = isError ? "form-status is-error" : "form-status";
}

async function startJob() {
  const response = await fetch("/api/advancements/start", { cache: "no-store" });
  if (response.status === 401) {
    window.location.replace("/login");
    return false;
  }
  if (!response.ok) {
    return false;
  }
  return true;
}

async function startLogin() {
  const raw = sessionStorage.getItem("advLogin");
  if (!raw) {
    return false;
  }
  sessionStorage.removeItem("advLogin");

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    return false;
  }

  if (!payload.username || !payload.password) {
    return false;
  }

  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return response.ok;
}

async function pollStatus() {
  try {
    const response = await fetch("/api/advancements/status", { cache: "no-store" });
    if (response.status === 401) {
      window.location.replace("/login");
      return;
    }
    if (!response.ok) {
      setStatus("Waiting for server...", true);
      setTimeout(pollStatus, 2000);
      return;
    }
    const data = await response.json();
    if (data.status === "ready") {
      window.location.replace("/");
      return;
    }
    if (data.status === "error") {
      setStatus(data.error || "Failed to load data.", true);
      setTimeout(pollStatus, 3000);
      return;
    }
    setStatus("Fetching latest advancements...", false);
    setTimeout(pollStatus, 1500);
  } catch (error) {
    setStatus("Waiting for server...", true);
    setTimeout(pollStatus, 2000);
  }
}

async function init() {
  setStatus("Connecting...", false);
  setStatus("Signing in...", false);
  const loggedIn = await startLogin();
  if (!loggedIn) {
    setStatus("Login failed. Please try again.", true);
    setTimeout(() => window.location.replace("/login"), 1500);
    return;
  }

  const started = await startJob();
  if (started) {
    setStatus("Fetching latest advancements...", false);
  } else {
    setStatus("Waiting for server...", true);
  }
  pollStatus();
}

init();
