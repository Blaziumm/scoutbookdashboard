async function loadData() {
  const response = await fetch("/api/advancements/data", { cache: "no-store" });
  if (response.status === 401) {
    window.location.replace("/login");
    return null;
  }
  if (!response.ok) {
    throw new Error("Unable to load /api/advancements");
  }
  const text = await response.text();
  return JSON.parse(text);
}

function summarizeRanks(programs) {
  let totalRanks = 0;
  let awarded = 0;
  programs.forEach((program) => {
    program.ranks.forEach((rank) => {
      totalRanks += 1;
      if (rank.status === "Awarded" || rank.awarded) {
        awarded += 1;
      }
    });
  });
  return { totalRanks, awarded };
}

function summarizeBadges(badges) {
  const total = badges.length;
  const awarded = badges.filter((badge) => badge.status === "Awarded").length;
  const started = badges.filter((badge) => badge.status === "Started").length;
  return { total, awarded, started };
}

function renderSummary(data) {
  const programs = (data.ranks?.program || []).filter(
    (program) => program.program !== "Sea Scouting"
  );
  const { totalRanks, awarded } = summarizeRanks(programs);
  const { total, awarded: awardedBadges, started } = summarizeBadges(data.meritBadges || []);

  const summary = document.getElementById("summary");
  summary.innerHTML = [
    `<div class="stat-card"><h3>Ranks Earned</h3><p>${awarded} of ${totalRanks}</p></div>`,
    `<div class="stat-card"><h3>Merit Badges</h3><p>${awardedBadges} awarded, ${started} in progress</p></div>`,
    `<div class="stat-card"><h3>Last Refresh</h3><p>${new Date().toLocaleString()}</p></div>`,
  ].join("");

  const person = document.getElementById("person");
  if (person && data.personId) {
    person.textContent = `Person ID: ${data.personId}`;
  }
}

function renderPrograms(data) {
  const programs = (data.ranks?.program || []).filter(
    (program) => program.program !== "Sea Scouting"
  );
  const container = document.getElementById("program-list");

  if (!programs.length) {
    container.textContent = "No rank data found.";
    return;
  }

  container.innerHTML = `
    <div class="program-grid">
      ${programs
        .map((program) => {
          const ranks = program.ranks
            .map((rank) => {
              const status = rank.status || (rank.awarded ? "Awarded" : "Started");
              const earned = rank.dateEarned ? `Earned ${rank.dateEarned}` : status;
              return `
                <div class="rank-item">
                  <div>${rank.name}</div>
                  <span>${earned}</span>
                </div>
              `;
            })
            .join("");

          return `
            <div class="program-card">
              <h3>${program.program}</h3>
              <div class="rank-list">${ranks}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderBadges(data) {
  const badges = data.meritBadges || [];
  const grid = document.getElementById("badge-grid");

  if (!badges.length) {
    grid.textContent = "No merit badges found.";
    return;
  }

  const renderCards = (items) => {
    grid.innerHTML = items
      .map((badge) => {
        const statusClass =
          badge.status === "Awarded"
            ? "status is-awarded"
            : badge.status === "Started"
            ? "status is-started"
            : "status";
        const percent = Math.round((badge.percentCompleted || 0) * 100);
        return `
          <article class="badge-card" data-status="${badge.status}">
            <img src="${badge.imageUrl100}" alt="${badge.name} badge" />
            <h4>${badge.name}</h4>
            <div class="badge-meta">
              <span>${badge.meritBadgeCategoryName || "General"}</span>
              <span>${percent}% complete</span>
            </div>
            <div class="badge-meta">
              <span class="${statusClass}">${badge.status}</span>
              <span>${badge.dateEarned || badge.dateCompleted || "-"}</span>
            </div>
          </article>
        `;
      })
      .join("");
  };

  renderCards(badges);

  document.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach((btn) => btn.classList.remove("is-active"));
      button.classList.add("is-active");
      const filter = button.dataset.filter;
      if (filter === "all") {
        renderCards(badges);
        return;
      }
      renderCards(badges.filter((badge) => badge.status === filter));
    });
  });
}

async function init() {
  try {
    const data = await loadData();
    if (!data) {
      return;
    }
    renderSummary(data);
    renderPrograms(data);
    renderBadges(data);
  } catch (error) {
    document.body.innerHTML = `<p style="padding:40px;">${error.message}</p>`;
  }
}

init();
