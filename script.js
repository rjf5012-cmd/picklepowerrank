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

// ----- Doubles team generation (pairs of 2) -----

// Generate all possible pairings (perfect matchings) and pick the set of pairs
// where the total pair strengths are as close together as possible.
function generateBalancedPairs(selectedIds) {
  if (selectedIds.length % 2 !== 0) {
    throw new Error("Need an even number of players to generate doubles teams.");
  }

  const players = selectedIds.slice();

  let bestPairs = null;
  let bestScore = Infinity;

  function backtrack(remaining, currentPairs) {
    if (remaining.length === 0) {
      // Evaluate current pairing set
      const pairSums = currentPairs.map(([id1, id2]) => {
        const r1 = getPlayerById(id1).rating;
        const r2 = getPlayerById(id2).rating;
        return r1 + r2;
      });

      const maxSum = Math.max(...pairSums);
      const minSum = Math.min(...pairSums);
      const spread = maxSum - minSum; // lower spread = more balanced

      if (spread < bestScore) {
        bestScore = spread;
        bestPairs = currentPairs.map(pair => pair.slice());
      }
      return;
    }

    // pick the first remaining player, pair with each other remaining
    const first = remaining[0];
    for (let i = 1; i < remaining.length; i++) {
      const partner = remaining[i];
      const nextRemaining = remaining
        .slice(1)
        .filter((id) => id !== partner);

      currentPairs.push([first, partner]);
      backtrack(nextRemaining, currentPairs);
      currentPairs.pop();
    }
  }

  backtrack(players, []);

  return {
    pairs: bestPairs || [],
    spread: bestScore
  };
}

function renderGeneratedPairs(result) {
  const container = document.getElementById("teams-result");
  const list = document.getElementById("pairs-result");
  const summary = document.getElementById("pairs-summary");

  if (!container || !list || !summary) return;

  list.innerHTML = "";

  const pairSums = [];

  result.pairs.forEach((pair, index) => {
    const [id1, id2] = pair;
    const p1 = getPlayerById(id1);
    const p2 = getPlayerById(id2);

    const ratingSum = p1.rating + p2.rating;
    pairSums.push(ratingSum);

    const li = document.createElement("li");
    li.innerHTML = `
      <span>Pair ${index + 1}: ${p1.name} (${p1.rating}) &amp; ${p2.name} (${p2.rating})</span>
      <span class="label">Total: ${ratingSum}</span>
    `;
    list.appendChild(li);
  });

  if (pairSums.length > 0) {
    const maxSum = Math.max(...pairSums);
    const minSum = Math.min(...pairSums);
    summary.textContent = `Strongest pair total: ${maxSum}, weakest pair total: ${minSum}, spread: ${maxSum - minSum} (lower is better).`;
  } else {
    summary.textContent = "";
  }

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

  // Generate doubles teams
  const generateTeamsBtn = document.getElementById("generate-teams-btn");
  generateTeamsBtn.addEventListener("click", () => {
    const container = document.getElementById("teams-player-list");
    const checkboxes = container.querySelectorAll("input[type='checkbox']");
    const selected = Array.from(checkboxes)
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);

    if (selected.length < 2) {
      alert("Select at least 2 players.");
      return;
    }
    if (selected.length % 2 !== 0) {
      alert("Select an even number of players to create doubles teams.");
      return;
    }

    try {
      const result = generateBalancedPairs(selected);
      renderGeneratedPairs(result);
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
