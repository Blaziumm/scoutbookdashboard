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
  let awarded = 1;
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

function summarizeEvents(eventsData) {
  const events = eventsData?.events || [];
  const subscriptions = eventsData?.subscriptions || [];
  return {
    total: events.length,
    subscriptions: subscriptions.length,
    monthLabel: eventsData?.monthLabel || "--",
    timezone: eventsData?.timezone || "--",
  };
}

function renderSummary(data) {
  const programs = (data.ranks?.program || []).filter(
    (program) => program.program !== "Sea Scouting"
  );
  const { totalRanks, awarded } = summarizeRanks(programs);
  const { total, awarded: awardedBadges, started } = summarizeBadges(data.meritBadges || []);
  const { total: totalEvents } = summarizeEvents(data.events || {});

  const summary = document.getElementById("summary");
  summary.innerHTML = [
    `<div class="stat-card"><h3>Ranks Earned</h3><p>${awarded} of ${totalRanks}</p></div>`,
    `<div class="stat-card"><h3>Merit Badges</h3><p>${awardedBadges} awarded, ${started} in progress</p></div>`,
    `<div class="stat-card"><h3>Calendar Events</h3><p>${totalEvents} visible this month</p></div>`,
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

        let progressStatus = "zero";
        if (badge.status === "Awarded") {
          progressStatus = "awarded";
        } else if (badge.status === "Started" && percent > 0) {
          progressStatus = "started";
        }

        return `
          <article class="badge-card" data-status="${badge.status}">
            <div class="progress-indicator progress-${progressStatus}" style="--progress: ${percent}%">
              <svg class="progress-ring" viewBox="0 0 100 100">
                <circle class="progress-ring__circle" cx="50" cy="50" r="45" />
              </svg>
              <div class="progress-text">${percent}%</div>
            </div>
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

    setTimeout(() => {
      document.querySelectorAll(".progress-indicator").forEach((indicator) => {
        indicator.classList.add("animate");
      });
    }, 10);
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

function renderEvents(data) {
  const eventsData = data.events || {};
  const events = eventsData.events || [];
  const subscriptions = eventsData.subscriptions || [];
  const eventGrid = document.getElementById("event-grid");
  const subscriptionGrid = document.getElementById("subscription-grid");
  const monthChip = document.getElementById("calendar-month");
  const timezoneChip = document.getElementById("calendar-timezone");

  if (monthChip) {
    monthChip.textContent = `Month: ${eventsData.monthLabel || "--"}`;
  }
  if (timezoneChip) {
    timezoneChip.textContent = `Timezone: ${eventsData.timezone || "--"}`;
  }

  if (!events.length) {
    eventGrid.innerHTML = `<div class="empty-state">No calendar events found.</div>`;
  } else {
    eventGrid.innerHTML = events
      .map((event) => {
        const eventClass = event.classes?.includes("continuesPrior")
          ? "event-card is-continues-prior"
          : event.classes?.includes("continuesAfter")
          ? "event-card is-continues-after"
          : "event-card";
        return `
          <article class="${eventClass}">
            <div class="event-card__date">${event.dateDisplay || "--"}</div>
            <div class="event-card__body">
              <h3>${event.title}</h3>
              <p>${event.time || "All day"}</p>
            </div>
          </article>
        `;
      })
      .join("");
  }

  if (!subscriptions.length) {
    subscriptionGrid.innerHTML = `<div class="empty-state">No subscribed calendars found.</div>`;
  } else {
    subscriptionGrid.innerHTML = subscriptions
      .map(
        (subscription) => `
          <div class="subscription-chip">${subscription.title}</div>
        `
      )
      .join("");
  }
}

async function init() {
  try {
    const data = await loadData();
    if (!data) {
      return;
    }
    renderSummary(data);
    renderPrograms(data);
    renderEvents(data);
    renderBadges(data);
  } catch (error) {
    document.body.innerHTML = `<p style="padding:40px;">${error.message}</p>`;
  }
}

init();