// ----- Simple local storage state -----

const STORAGE_KEY = "pickle-league-state-v1";

let state = {
  players: [], // { id, name, rating, wins, losses }
  matches: []  // { id, date, teamA, teamB, winner }
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.players && parsed.matches) {
      state = parsed;
    }
  } catch (e) {
    console.error("Failed to load state", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state", e);
  }
}

// ----- Helpers -----

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getPlayerById(id) {
  return state.players.find((p) => p.id === id);
}

// ----- ELO rating -----

const ELO_K = 24; // how fast ratings move; 16–32 is typical

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function updateEloForMatch(teamAIds, teamBIds, winner) {
  // team rating = average of players
  const teamARating =
    teamAIds.reduce((sum, id) => sum + getPlayerById(id).rating, 0) /
    teamAIds.length;
  const teamBRating =
    teamBIds.reduce((sum, id) => sum + getPlayerById(id).rating, 0) /
    teamBIds.length;

  const expA = expectedScore(teamARating, teamBRating);
  const expB = expectedScore(teamBRating, teamARating);

  const scoreA = winner === "A" ? 1 : 0;
  const scoreB = winner === "B" ? 1 : 0;

  // update each player in team
  teamAIds.forEach((id) => {
    const p = getPlayerById(id);
    p.rating = Math.round(p.rating + ELO_K * (scoreA - expA));
    if (winner === "A") p.wins++;
    else p.losses++;
  });

  teamBIds.forEach((id) => {
    const p = getPlayerById(id);
    p.rating = Math.round(p.rating + ELO_K * (scoreB - expB));
    if (winner === "B") p.wins++;
    else p.losses++;
  });
}

// ----- UI rendering -----

function renderPlayersTable() {
  const tbody = document.getElementById("players-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const sorted = [...state.players].sort((a, b) => b.rating - a.rating);

  sorted.forEach((p, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${p.name}</td>
      <td>${p.rating}</td>
      <td>${p.wins}</td>
      <td>${p.losses}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPlayerSelects() {
  const selects = [
    document.getElementById("team-a-player-1"),
    document.getElementById("team-a-player-2"),
    document.getElementById("team-b-player-1"),
    document.getElementById("team-b-player-2")
  ];

  selects.forEach((sel) => {
    if (!sel) return;
    sel.innerHTML =
      '<option value="">Select player</option>' +
      state.players
        .map(
          (p) =>
            `<option value="${p.id}">${p.name} (${p.rating})</option>`
        )
        .join("");
  });
}

function renderTeamsPlayerCheckboxes() {
  const container = document.getElementById("teams-player-list");
  if (!container) return;
  container.innerHTML = "";

  const sorted = [...state.players].sort((a, b) => b.rating - a.rating);

  sorted.forEach((p) => {
    const label = document.createElement("label");
    label.innerHTML = `
      <input type="checkbox" value="${p.id}" />
      <span>${p.name} <span style="color:#9aa5b5;font-size:0.8rem;">(${p.rating})</span></span>
    `;
    container.appendChild(label);
  });
}

function renderMatchesList() {
  const list = document.getElementById("matches-list");
  if (!list) return;
  list.innerHTML = "";

  const recent = [...state.matches].slice(-10).reverse(); // last 10 matches

  recent.forEach((m) => {
    const li = document.createElement("li");

    const teamAPlayers = m.teamA.map((id) => getPlayerById(id)?.name || "?");
    const teamBPlayers = m.teamB.map((id) => getPlayerById(id)?.name || "?");

    li.innerHTML = `
      <span>
        <span class="label">${m.date}</span><br/>
        A: ${teamAPlayers.join(" & ")} vs B: ${teamBPlayers.join(" & ")}
      </span>
      <span class="label">Winner: Team ${m.winner}</span>
    `;
    list.appendChild(li);
  });
}

// ----- Team generation -----

function generateBalancedTeams(selectedIds) {
  const n = selectedIds.length;
  if (n % 2 !== 0) {
    throw new Error("Need an even number of players to generate fair teams.");
  }
  const teamSize = n / 2;

  // Brute force: all combinations of teamSize players as Team A
  const players = selectedIds.slice();
  const best = { diff: Infinity, teamA: null, teamB: null };

  function comboRecursive(startIndex, chosen) {
    if (chosen.length === teamSize) {
      const teamA = chosen;
      const teamB = players.filter((id) => !teamA.includes(id));

      const sumA = teamA.reduce(
        (sum, id) => sum + getPlayerById(id).rating,
        0
      );
      const sumB = teamB.reduce(
        (sum, id) => sum + getPlayerById(id).rating,
        0
      );

      const diff = Math.abs(sumA - sumB);
      if (diff < best.diff) {
        best.diff = diff;
        best.teamA = teamA.slice();
        best.teamB = teamB.slice();
      }
      return;
    }

    for (let i = startIndex; i <= players.length - (teamSize - chosen.length); i++) {
      chosen.push(players[i]);
      comboRecursive(i + 1, chosen);
      chosen.pop();
    }
  }

  comboRecursive(0, []);
  return best;
}

function renderGeneratedTeams(result) {
  const container = document.getElementById("teams-result");
  const teamAList = document.getElementById("team-a-result");
  const teamBList = document.getElementById("team-b-result");
  const teamARatingEl = document.getElementById("team-a-rating");
  const teamBRatingEl = document.getElementById("team-b-rating");
  const diffEl = document.getElementById("teams-diff");

  if (!container) return;

  const { teamA, teamB } = result;

  const sumA = teamA.reduce(
    (sum, id) => sum + getPlayerById(id).rating,
    0
  );
  const sumB = teamB.reduce(
    (sum, id) => sum + getPlayerById(id).rating,
    0
  );

  teamAList.innerHTML = "";
  teamBList.innerHTML = "";

  teamA.forEach((id) => {
    const p = getPlayerById(id);
    const li = document.createElement("li");
    li.textContent = `${p.name} (${p.rating})`;
    teamAList.appendChild(li);
  });

  teamB.forEach((id) => {
    const p = getPlayerById(id);
    const li = document.createElement("li");
    li.textContent = `${p.name} (${p.rating})`;
    teamBList.appendChild(li);
  });

  teamARatingEl.textContent = sumA;
  teamBRatingEl.textContent = sumB;
  diffEl.textContent = `Rating difference: ${Math.abs(sumA - sumB)} (lower is better)`;

  container.style.display = "block";
}

// ----- Event wiring -----

document.addEventListener("DOMContentLoaded", () => {
  loadState();

  // Initialize ratings if missing (in case we change schema later)
  state.players.forEach((p) => {
    if (typeof p.rating !== "number") p.rating = 1500;
    if (typeof p.wins !== "number") p.wins = 0;
    if (typeof p.losses !== "number") p.losses = 0;
  });

  // Tabs
  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-button")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));

      btn.classList.add("active");
      const tabId = btn.dataset.tab;
      document.getElementById(tabId).classList.add("active");
    });
  });

  // Add player
  const addPlayerForm = document.getElementById("add-player-form");
  addPlayerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("player-name");
    const name = input.value.trim();
    if (!name) return;

    state.players.push({
      id: generateId(),
      name,
      rating: 1500,
      wins: 0,
      losses: 0
    });

    saveState();
    input.value = "";
    renderPlayersTable();
    renderPlayerSelects();
    renderTeamsPlayerCheckboxes();
  });

  // Record match
  const recordMatchForm = document.getElementById("record-match-form");
  recordMatchForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const a1 = document.getElementById("team-a-player-1").value;
    const a2 = document.getElementById("team-a-player-2").value;
    const b1 = document.getElementById("team-b-player-1").value;
    const b2 = document.getElementById("team-b-player-2").value;
    const winner = (
      document.querySelector('input[name="winner"]:checked') || {}
    ).value;

    const ids = [a1, a2, b1, b2];

    if (new Set(ids).size !== 4) {
      alert("Each selected player must be unique.");
      return;
    }

    if (!winner) {
      alert("Please select the winning team.");
      return;
    }

    const teamA = [a1, a2];
    const teamB = [b1, b2];

    // Update ratings & records
    updateEloForMatch(teamA, teamB, winner);

    // Save match
    const match = {
      id: generateId(),
      date: new Date().toLocaleDateString(),
      teamA,
      teamB,
      winner
    };
    state.matches.push(match);

    saveState();
    renderPlayersTable();
    renderMatchesList();
    renderPlayerSelects();

    // reset form
    recordMatchForm.reset();
  });

  // Generate teams
  const generateTeamsBtn = document.getElementById("generate-teams-btn");
  generateTeamsBtn.addEventListener("click", () => {
    const container = document.getElementById("teams-player-list");
    const checkboxes = container.querySelectorAll("input[type='checkbox']");
    const selected = Array.from(checkboxes)
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);

    if (selected.length < 4) {
      alert("Select at least 4 players.");
      return;
    }
    if (selected.length % 2 !== 0) {
      alert("Select an even number of players for balanced teams.");
      return;
    }

    try {
      const result = generateBalancedTeams(selected);
      renderGeneratedTeams(result);
    } catch (err) {
      alert(err.message);
    }
  });

  // Initial render
  renderPlayersTable();
  renderPlayerSelects();
  renderTeamsPlayerCheckboxes();
  renderMatchesList();
});
