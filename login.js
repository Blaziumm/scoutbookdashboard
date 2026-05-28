const form = document.getElementById("login-form");
const statusEl = document.getElementById("form-status");

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.className = isError ? "form-status is-error" : "form-status";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Starting login...", false);

  const formData = new FormData(form);
  const payload = {
    username: formData.get("username"),
    password: formData.get("password"),
  };

  sessionStorage.setItem("advLogin", JSON.stringify(payload));
  window.location.replace("/loading");
});
