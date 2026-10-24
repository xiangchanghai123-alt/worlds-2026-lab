(function () {
  "use strict";

  const DATA = window.WORLDS_DATA;
  if (!DATA) {
    throw new Error("Worlds data failed to load.");
  }

  const TEAMS = DATA.teams;
  const TEAM_IDS = Object.keys(TEAMS);
  const STORAGE_KEY = "worlds-2026-swiss-lab:v1";
  const MAX_SWISS_ROUNDS = 5;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let state;
  let undoStack = [];
  let currentView = "swiss";
  let lastRenderedRound = 0;
  let deferredInstallPrompt = null;
  let toastTimer = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultState() {
    return {
      version: 1,
      snapshotDate: DATA.snapshotDate,
      matches: clone(DATA.actualMatches),
      bracket: null
    };
  }

  function normalizeState(candidate) {
    if (!candidate || !Array.isArray(candidate.matches)) {
      throw new Error("推演文件缺少 matches 数据。");
    }

    const matches = candidate.matches.map((match) => {
      if (!TEAMS[match.a] || !TEAMS[match.b]) {
        throw new Error(`无法识别战队：${match.a} / ${match.b}`);
      }
      const isFinal = match.status === "final" && Number.isFinite(Number(match.scoreA)) && Number.isFinite(Number(match.scoreB));
      return {
        id: String(match.id),
        round: Number(match.round),
        matchNo: Number(match.matchNo || 1),
        a: match.a,
        b: match.b,
        scoreA: isFinal ? Number(match.scoreA) : null,
        scoreB: isFinal ? Number(match.scoreB) : null,
        status: isFinal ? "final" : "pending",
        origin: ["actual", "simulation", "manual"].includes(match.origin) ? match.origin : "simulation",
        pool: match.pool || "",
        bo: Number(match.bo) || 1
      };
    });

    return {
      version: 1,
      snapshotDate: candidate.snapshotDate || DATA.snapshotDate,
      matches,
      bracket: candidate.bracket && Array.isArray(candidate.bracket.seeds) ? candidate.bracket : null
    };
  }

  function safeLoad() {
    const fromHash = loadFromHash();
    if (fromHash) {
      try {
        state = normalizeState(fromHash);
        ensureProgression();
        persistState(false);
        return;
      } catch (error) {
        console.warn(error);
      }
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        state = normalizeState(JSON.parse(stored));
        ensureProgression();
        return;
      }
    } catch (error) {
      console.warn("Could not restore local simulation.", error);
    }

    state = defaultState();
  }

  function persistState(updateHash = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Could not save simulation.", error);
    }

    if (updateHash) {
      try {
        history.replaceState(null, "", makeShareUrl(true));
      } catch (error) {
        // Some browsers block history updates for local file:// pages.
      }
    }
  }

  function pushUndo() {
    undoStack.push(clone(state));
    if (undoStack.length > 30) {
      undoStack.shift();
    }
  }

  function getRecords() {
    const records = new Map(
      TEAM_IDS.map((id) => [
        id,
        {
          id,
          wins: 0,
          losses: 0,
          form: [],
          opponents: new Set()
        }
      ])
    );

    state.matches
      .filter((match) => match.status === "final")
      .sort((a, b) => a.round - b.round || a.matchNo - b.matchNo)
      .forEach((match) => {
        const winner = winnerOf(match);
        const loser = winner === match.a ? match.b : match.a;
        records.get(winner).wins += 1;
        records.get(loser).losses += 1;
        records.get(winner).form.push("W");
        records.get(loser).form.push("L");
        records.get(winner).opponents.add(loser);
        records.get(loser).opponents.add(winner);
      });

    return records;
  }

  function sortedRecords() {
    return Array.from(getRecords().values()).sort(compareRecords);
  }

  function compareRecords(a, b) {
    const aQualified = a.wins >= 3 ? 1 : 0;
    const bQualified = b.wins >= 3 ? 1 : 0;
    if (aQualified !== bQualified) return bQualified - aQualified;

    const aEliminated = a.losses >= 3 ? 1 : 0;
    const bEliminated = b.losses >= 3 ? 1 : 0;
    if (aEliminated !== bEliminated) return aEliminated - bEliminated;
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (TEAMS[a.id].rating !== TEAMS[b.id].rating) return TEAMS[b.id].rating - TEAMS[a.id].rating;
    return TEAMS[a.id].name.localeCompare(TEAMS[b.id].name);
  }

  function winnerOf(match) {
    if (!match || match.status !== "final") return null;
    return match.scoreA > match.scoreB ? match.a : match.b;
  }

  function activeTeams(records = getRecords()) {
    return TEAM_IDS.filter((id) => records.get(id).wins < 3 && records.get(id).losses < 3);
  }

  function qualifiedTeams() {
    return sortedRecords().filter((record) => record.wins >= 3).map((record) => record.id);
  }

  function allMatchesFinal(round, matches = state.matches) {
    const roundMatches = matches.filter((match) => match.round === round);
    return roundMatches.length > 0 && roundMatches.every((match) => match.status === "final");
  }

  function hasMet(a, b) {
    return state.matches.some(
      (match) => (match.a === a && match.b === b) || (match.a === b && match.b === a)
    );
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function buildPairings(teamIds, avoidRematches = true) {
    if (teamIds.length % 2 !== 0) return null;
    if (teamIds.length === 0) return [];

    const ordered = shuffle(teamIds);
    const first = ordered[0];
    const candidates = ordered
      .slice(1)
      .sort((a, b) => Number(hasMet(first, a)) - Number(hasMet(first, b)));

    for (const opponent of candidates) {
      if (avoidRematches && hasMet(first, opponent)) continue;
      const remaining = ordered.filter((id) => id !== first && id !== opponent);
      const rest = buildPairings(remaining, avoidRematches);
      if (rest) {
        return [[first, opponent], ...rest];
      }
    }
    return null;
  }

  function pairRecordGroups(round) {
    const records = getRecords();
    const groups = new Map();

    activeTeams(records).forEach((id) => {
      const record = records.get(id);
      const key = `${record.wins}-${record.losses}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(id);
    });

    const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
      const [aWins] = a.split("-").map(Number);
      const [bWins] = b.split("-").map(Number);
      return bWins - aWins;
    });

    const pairings = [];
    for (const [pool, ids] of sortedGroups) {
      let pairs = buildPairings(ids, true);
      if (!pairs) pairs = buildPairings(ids, false);
      if (!pairs) {
        throw new Error(`无法配对战绩组 ${pool}。`);
      }
      pairs.forEach(([a, b]) => pairings.push({ a, b, pool }));
    }
    return pairings;
  }

  function makeMatch(id, round, matchNo, a, b, pool, bo, origin = "simulation") {
    return {
      id,
      round,
      matchNo,
      a,
      b,
      scoreA: null,
      scoreB: null,
      status: "pending",
      origin,
      pool,
      bo
    };
  }

  function ensureProgression() {
    if (state.bracket) return;

    let guard = 0;
    while (guard < 6) {
      guard += 1;
      const maxRound = state.matches.reduce((max, match) => Math.max(max, match.round), 0);
      if (maxRound >= MAX_SWISS_ROUNDS || !allMatchesFinal(maxRound)) break;

      const nextRound = maxRound + 1;
      if (nextRound > MAX_SWISS_ROUNDS) break;
      if (activeTeams().length === 0) break;

      const pairings = pairRecordGroups(nextRound);
      pairings.forEach((pairing, index) => {
        const [wins, losses] = pairing.pool.split("-").map(Number);
        const bo = wins === 2 || losses === 2 ? 3 : 1;
        state.matches.push(
          makeMatch(
            `R${nextRound}M${index + 1}`,
            nextRound,
            index + 1,
            pairing.a,
            pairing.b,
            pairing.pool,
            bo
          )
        );
      });
    }

    if (allMatchesFinal(5) && qualifiedTeams().length === 8 && !state.bracket) {
      createBracket();
    }
  }

  function currentSwissRound() {
    const pending = state.matches
      .filter((match) => match.status === "pending")
      .sort((a, b) => a.round - b.round || a.matchNo - b.matchNo);
    return pending.length ? pending[0].round : 0;
  }

  function ratingAdvantage(a, b) {
    return TEAMS[a].rating - TEAMS[b].rating;
  }

  function winProbability(a, b) {
    const probability = 1 / (1 + Math.pow(10, -ratingAdvantage(a, b) / 430));
    const noise = (Math.random() - 0.5) * 0.1;
    return Math.min(0.9, Math.max(0.1, probability + noise));
  }

  function chooseAutoWinner(match) {
    return Math.random() < winProbability(match.a, match.b) ? match.a : match.b;
  }

  function seriesScore(bo, probability) {
    const target = Math.ceil(bo / 2);
    let winnerGames = 0;
    let loserGames = 0;

    while (winnerGames < target && loserGames < target) {
      if (Math.random() < probability) {
        winnerGames += 1;
      } else {
        loserGames += 1;
      }
    }
    return { winnerGames, loserGames };
  }

  function applyWinner(match, winner, origin = "manual") {
    if (!match || (winner !== match.a && winner !== match.b)) return false;
    const changed = match.status !== "final" || winnerOf(match) !== winner;
    if (!changed) return false;

    if (match.status === "final") {
      const previousScores = [match.scoreA, match.scoreB];
      const winnerWasA = winner === match.a;
      match.scoreA = winnerWasA ? Math.max(...previousScores) : Math.min(...previousScores);
      match.scoreB = winnerWasA ? Math.min(...previousScores) : Math.max(...previousScores);
    } else {
      const probability = Math.min(0.8, Math.max(0.2, winProbability(match.a, match.b)));
      const adjustedProbability = winner === match.a ? probability : 1 - probability;
      const score = seriesScore(Number(match.bo) || 1, adjustedProbability);
      match.scoreA = winner === match.a ? score.winnerGames : score.loserGames;
      match.scoreB = winner === match.b ? score.winnerGames : score.loserGames;
    }

    match.status = "final";
    match.origin = origin;
    return true;
  }

  function simulateSwissMatch(match) {
    return applyWinner(match, chooseAutoWinner(match), "simulation");
  }

  function getNextPendingSwiss() {
    return state.matches
      .filter((match) => match.status === "pending")
      .sort((a, b) => a.round - b.round || a.matchNo - b.matchNo)[0] || null;
  }

  function setBracketSlot(match, key, teamId) {
    if (match[key] === teamId) return;
    match[key] = teamId;
    match.scoreA = null;
    match.scoreB = null;
    match.status = "pending";
    match.origin = "simulation";
  }

  function hydrateBracket(bracket = state.bracket) {
    if (!bracket) return;
    const quarterWinners = bracket.rounds.QF.map(winnerOf);
    const semifinalMatches = bracket.rounds.SF;
    const finalMatch = bracket.rounds.F[0];

    semifinalMatches.forEach((match, index) => {
      setBracketSlot(match, "a", quarterWinners[index * 2]);
      setBracketSlot(match, "b", quarterWinners[index * 2 + 1]);
    });

    const semifinalWinners = semifinalMatches.map(winnerOf);
    setBracketSlot(finalMatch, "a", semifinalWinners[0]);
    setBracketSlot(finalMatch, "b", semifinalWinners[1]);
  }

  function createBracket() {
    const records = getRecords();
    const qualified = sortedRecords()
      .filter((record) => record.wins >= 3)
      .map((record) => record.id);
    if (qualified.length !== 8) return null;

    const pairs = [
      [qualified[0], qualified[7]],
      [qualified[3], qualified[4]],
      [qualified[1], qualified[6]],
      [qualified[2], qualified[5]]
    ];

    const quarterfinals = pairs.map(([a, b], index) =>
      makeMatch(`QF${index + 1}`, "QF", index + 1, a, b, "knockout", 5)
    );
    const semifinals = [0, 1].map((index) =>
      makeMatch(`SF${index + 1}`, "SF", index + 1, null, null, "knockout", 5)
    );
    const final = makeMatch("F1", "F", 1, null, null, "knockout", 5);

    state.bracket = {
      seeds: qualified.map((id) => ({ id, wins: records.get(id).wins, losses: records.get(id).losses })),
      rounds: {
        QF: quarterfinals,
        SF: semifinals,
        F: [final]
      }
    };
    return state.bracket;
  }

  function resetBracketForChangedSwiss() {
    if (!state.bracket) return false;
    state.bracket = null;
    ensureProgression();
    return true;
  }

  function allBracketMatches() {
    if (!state.bracket) return [];
    return [...state.bracket.rounds.QF, ...state.bracket.rounds.SF, ...state.bracket.rounds.F];
  }

  function nextPlayableBracketMatch() {
    if (!state.bracket) return null;
    hydrateBracket();
    return allBracketMatches().find(
      (match) => match.status === "pending" && match.a && match.b
    ) || null;
  }

  function simulateOne({ save = true, registerUndo = true } = {}) {
    let changed = false;
    let target = getNextPendingSwiss();

    if (target) {
      if (registerUndo) pushUndo();
      changed = simulateSwissMatch(target);
      ensureProgression();
    } else {
      hydrateBracket();
      target = nextPlayableBracketMatch();
      if (target) {
        if (registerUndo) pushUndo();
        changed = applyWinner(target, chooseAutoWinner(target), "simulation");
        hydrateBracket();
      }
    }

    if (changed) {
      if (save) persistState();
      render();
      flashMatch(target.id);
    }
    return { changed, target };
  }

  function simulateCurrentRound() {
    const swissRound = currentSwissRound();
    if (swissRound) {
      const targets = state.matches.filter(
        (match) => match.round === swissRound && match.status === "pending"
      );
      if (!targets.length) return;
      pushUndo();
      targets.forEach(simulateSwissMatch);
      ensureProgression();
      persistState();
      render();
      flashMatch(targets[targets.length - 1].id);
      showToast(`第 ${swissRound} 轮已完成。`);
      return;
    }

    if (!state.bracket) {
      createBracket();
      persistState();
      render();
    }
    if (!state.bracket) return;

    hydrateBracket();
    const playable = allBracketMatches().filter(
      (match) => match.status === "pending" && match.a && match.b
    );
    if (!playable.length) return;
    pushUndo();
    const knockoutRound = playable[0].round;
    const targets = playable.filter((match) => match.round === knockoutRound);
    targets.forEach((match) => applyWinner(match, chooseAutoWinner(match), "simulation"));
    hydrateBracket();
    persistState();
    render();
    showToast(`${bracketRoundLabel(knockoutRound)}已完成。`);
  }

  function simulateEverything() {
    pushUndo();
    let guard = 0;
    let changed = false;

    while (guard < 80) {
      guard += 1;
      ensureProgression();
      const nextSwiss = getNextPendingSwiss();
      if (nextSwiss) {
        changed = simulateSwissMatch(nextSwiss) || changed;
        continue;
      }

      if (!state.bracket && qualifiedTeams().length === 8) {
        createBracket();
      }
      if (!state.bracket) break;

      hydrateBracket();
      const nextKnockout = nextPlayableBracketMatch();
      if (!nextKnockout) break;
      changed = applyWinner(nextKnockout, chooseAutoWinner(nextKnockout), "simulation") || changed;
      hydrateBracket();
    }

    if (!changed) {
      undoStack.pop();
      return;
    }

    persistState();
    setView("knockout");
    render();
    const champion = state.bracket ? winnerOf(state.bracket.rounds.F[0]) : null;
    showToast(champion ? `${TEAMS[champion].name} 成为你的 2026 世界冠军。` : "完整赛事推演完成。");
    flashMatch("F1");
  }

  function undo() {
    const previous = undoStack.pop();
    if (!previous) return;
    state = previous;
    ensureProgression();
    persistState();
    render();
    showToast("已撤销上一步。");
  }

  function resetSimulation() {
    pushUndo();
    state = defaultState();
    ensureProgression();
    persistState();
    setView("swiss");
    render();
    showToast("已恢复到 10 月 24 日真实赛果。");
  }

  function bracketRoundLabel(round) {
    return { QF: "四分之一决赛", SF: "半决赛", F: "总决赛" }[round] || round;
  }

  function statusForRecord(record) {
    if (record.wins >= 3) return { className: "qualified", label: "晋级" };
    if (record.losses >= 3) return { className: "eliminated", label: "淘汰" };
    return { className: "active", label: "存活" };
  }

  function crestMarkup(teamId, small = false) {
    const team = TEAMS[teamId];
    if (!team) {
      return `<span class="crest ${small ? "small" : ""}" style="--team-color:#506474">?</span>`;
    }
    return `<span class="crest ${small ? "small" : ""}" style="--team-color:${team.color}" aria-hidden="true">${team.short}</span>`;
  }

  function teamTournamentState(record) {
    if (record.wins >= 3) return { className: "is-qualified", label: "晋级" };
    if (record.losses >= 3) return { className: "is-eliminated", label: "淘汰" };
    if (record.wins === 2) return { className: "is-match-point", label: "赛点" };
    if (record.losses === 2) return { className: "is-danger", label: "生死战" };
    return { className: "is-active", label: "" };
  }

  function matchCardMarkup(match, currentRound, records) {
    const isFinal = match.status === "final";
    const winner = winnerOf(match);
    const isSimulated = match.origin !== "actual";
    const isCurrent = !isFinal && match.round === currentRound;
    const originLabel = isFinal
      ? isSimulated
        ? "你的推演"
        : "真实赛果"
      : isSimulated
        ? "模拟对阵"
        : "官方对阵";

    const teamMarkup = (teamId, score, isWinner) => {
      const team = TEAMS[teamId];
      const record = records.get(teamId);
      const tournamentState = teamTournamentState(record);
      const teamClass = isFinal
        ? isWinner
          ? "is-winner"
          : "is-loser"
        : "";
      const scoreMarkup = isFinal
        ? `<span class="team-score">${score}</span>`
        : `<span class="pick-hint">选择</span>`;
      return `
        <button class="team-button ${teamClass} ${tournamentState.className}" type="button" data-match-id="${match.id}" data-team-id="${teamId}" aria-label="选择 ${team.name} 获胜，当前战绩 ${record.wins} 胜 ${record.losses} 负${tournamentState.label ? `，${tournamentState.label}` : ""}">
          ${crestMarkup(teamId)}
          <span class="team-name-wrap">
            <span class="team-name">${team.name}</span>
            <span class="team-region">
              ${record.wins}–${record.losses}
              ${tournamentState.label ? `<b>${tournamentState.label}</b>` : ""}
            </span>
          </span>
          ${scoreMarkup}
        </button>
      `;
    };

    return `
      <article class="match-card ${isFinal ? "is-final" : "is-pending"} ${isSimulated ? "is-simulated" : ""} ${isCurrent ? "is-current" : ""}" data-match-id="${match.id}">
        <div class="match-topline">
          <span class="match-id">${match.id} · BO${match.bo || 1}${match.pool ? ` · ${match.pool}` : ""}</span>
          <span class="match-meta">${originLabel}</span>
        </div>
        ${teamMarkup(match.a, match.scoreA, winner === match.a)}
        ${teamMarkup(match.b, match.scoreB, winner === match.b)}
      </article>
    `;
  }

  function renderRounds() {
    const currentRound = currentSwissRound();
    const records = getRecords();
    const columns = [];

    for (let round = 1; round <= MAX_SWISS_ROUNDS; round += 1) {
      const matches = state.matches
        .filter((match) => match.round === round)
        .sort((a, b) => a.matchNo - b.matchNo);
      const isComplete = matches.length > 0 && matches.every((match) => match.status === "final");
      const isCurrent = round === currentRound;
      let stateLabel = "等待配对";
      if (isComplete) stateLabel = "已完赛";
      if (isCurrent) stateLabel = "进行中";

      const content = matches.length
        ? `<div class="match-stack">${matches.map((match) => matchCardMarkup(match, currentRound, records)).join("")}</div>`
        : `
          <div class="round-empty">
            <strong>对阵待定</strong>
            <span>上一轮结束后自动抽签</span>
          </div>
        `;

      columns.push(`
        <section class="round-column" data-round="${round}">
          <div class="round-head">
            <div class="round-title">
              <span class="round-index">0${round}</span>
              <div>
                <strong>第 ${round} 轮</strong>
                <small>${DATA.scheduleLabels[round] || ""}</small>
              </div>
            </div>
            <span class="round-state ${isCurrent ? "is-live" : ""}">${stateLabel}</span>
          </div>
          ${content}
        </section>
      `);
      if (round < MAX_SWISS_ROUNDS) {
        columns.push(`
          <div class="round-arrow" aria-hidden="true">
            <span>→</span>
          </div>
        `);
      }
    }

    $("#swissRounds").innerHTML = columns.join("");
    lastRenderedRound = currentRound;
  }

  function renderStandings() {
    const records = sortedRecords();
    const rows = records.map((record, index) => {
      const team = TEAMS[record.id];
      const status = statusForRecord(record);
      return `
        <div class="standings-row is-${status.className}">
          <span class="standings-rank">${String(index + 1).padStart(2, "0")}</span>
          <div class="standings-team">
            ${crestMarkup(record.id, true)}
            <span>
              <strong>${team.name}</strong>
              <small>${team.region}</small>
            </span>
          </div>
          <span class="standings-record"><strong>${record.wins}</strong><span>–</span>${record.losses}</span>
          <span class="standings-status ${status.className}">${status.label}</span>
        </div>
      `;
    });
    $("#standingsList").innerHTML = rows.join("");

    const completedRound = [...state.matches]
      .sort((a, b) => b.round - a.round)
      .find((match) => match.origin === "actual" && match.status === "final")?.round;
    const lastUpdated = $(".last-updated");
    if (lastUpdated) {
      lastUpdated.textContent = completedRound
        ? `R${completedRound} ${state.matches.some((m) => m.round === completedRound && m.status === "pending") ? "LIVE" : "FINAL"}`
        : "SNAPSHOT";
    }
  }

  function renderQualification() {
    const records = sortedRecords();
    const groups = new Map();
    records.forEach((record) => {
      const key = `${record.wins}-${record.losses}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });

    const groupMarkup = Array.from(groups.entries())
      .map(([record, members]) => {
        const tags = members
          .map((member) => {
            const out = member.losses >= 3;
            return `<span class="qualification-team ${out ? "is-out" : ""}">${TEAMS[member.id].short}</span>`;
          })
          .join("");
        return `
          <div class="qualification-group">
            <span class="qualification-record">${record}</span>
            <div class="qualification-teams">${tags}</div>
          </div>
        `;
      })
      .join("");

    const qualifiedCount = records.filter((record) => record.wins >= 3).length;
    $("#qualificationGroups").innerHTML = groupMarkup;
    $("#qualifiedCount").innerHTML = `${qualifiedCount} <span>/ 8</span>`;
    $("#qualificationFill").style.width = `${(qualifiedCount / 8) * 100}%`;

    const qualified = records.filter((record) => record.wins >= 3);
    const eliminated = records.filter((record) => record.losses >= 3);
    const teamTag = (record, kind) => `
      <span class="advance-team ${kind}">
        ${crestMarkup(record.id, true)}
        <b>${record.wins}–${record.losses}</b>
      </span>
    `;
    const qualifiedLive = $("#advanceQualified");
    const eliminatedLive = $("#advanceEliminated");
    if (qualifiedLive) {
      qualifiedLive.innerHTML = qualified.length
        ? qualified.map((record) => teamTag(record, "up")).join("")
        : `<span class="advance-empty">等待三胜战队</span>`;
    }
    if (eliminatedLive) {
      eliminatedLive.innerHTML = eliminated.length
        ? eliminated.map((record) => teamTag(record, "out")).join("")
        : `<span class="advance-empty">等待三负战队</span>`;
    }
    const qualifiedCountLive = $("#qualifiedCountLive");
    const eliminatedCountLive = $("#eliminatedCountLive");
    if (qualifiedCountLive) qualifiedCountLive.textContent = `${qualified.length} / 8`;
    if (eliminatedCountLive) eliminatedCountLive.textContent = `${eliminated.length} / 8`;
  }

  function renderControls() {
    const currentRound = currentSwissRound();
    const bracketNext = !currentRound ? nextPlayableBracketMatch() : null;
    const complete = !currentRound && !bracketNext;
    const records = getRecords();
    const qualifiedCount = qualifiedTeams().length;
    const eliminatedCount = TEAM_IDS.filter((id) => records.get(id).losses >= 3).length;
    $("#simulateNextBtn").disabled = complete;
    $("#simulateRoundBtn").disabled = complete;
    $("#fastForwardBtn").disabled = complete;
    $("#undoBtn").disabled = undoStack.length === 0;
    const phaseLabel = currentView === "knockout"
      ? currentRound || !state.bracket
        ? "淘汰赛 · 等待八强产生"
        : complete
          ? "2026 全球总决赛 · 推演完成"
          : `淘汰赛 · ${bracketRoundLabel(nextPlayableBracketMatch()?.round || "QF")}`
      : currentRound
        ? `数据快照 10.24 · 瑞士轮第 ${currentRound} 轮`
        : "瑞士轮结束 · 8 支战队晋级";
    $("#eventStatus").textContent = phaseLabel;
    $("#formatChipText").textContent = currentView === "swiss" || currentRound || !state.bracket
      ? `晋级 ${qualifiedCount}/8 · 淘汰 ${eliminatedCount}/8`
      : complete
        ? "冠军已产生"
        : `八强 · ${qualifiedCount}/8`;

  }

  function bracketMatchMarkup(match) {
    const isFinal = match.status === "final";
    const winner = winnerOf(match);
    const teamRow = (teamId, score, isWinner) => {
      if (!teamId) {
        return `
          <div class="bracket-team is-placeholder">
            <span class="crest small" style="--team-color:#506474">?</span>
            <span class="bracket-team-name">待定</span>
            <span class="bracket-score">·</span>
          </div>
        `;
      }
      const team = TEAMS[teamId];
      return `
        <button class="bracket-team ${isWinner ? "is-winner" : ""}" type="button" data-bracket-match="${match.id}" data-team-id="${teamId}" aria-label="选择 ${team.name} 获胜">
          ${crestMarkup(teamId, true)}
          <span class="bracket-team-name">${team.name}</span>
          <span class="bracket-score">${isFinal ? score : "·"}</span>
        </button>
      `;
    };
    return `
      <article class="bracket-match ${match.round === "F" ? "is-final" : ""}" data-bracket-match="${match.id}">
        ${teamRow(match.a, match.scoreA, winner === match.a)}
        ${teamRow(match.b, match.scoreB, winner === match.b)}
      </article>
    `;
  }

  function renderBracket() {
    const hasSwissFinished = allMatchesFinal(5) && qualifiedTeams().length === 8;
    if (!state.bracket && hasSwissFinished) createBracket();

    $("#emptyBracket").hidden = Boolean(state.bracket);
    $("#bracketContent").hidden = !state.bracket;

    if (!state.bracket) {
      $("#seedList").innerHTML = `<span class="summary-placeholder">完成瑞士轮后显示八强种子。</span>`;
      renderRunSummary();
      return;
    }

    hydrateBracket();
    const roundMeta = [
      ["QF", "四分之一决赛", "BO5 · 4 MATCHES"],
      ["SF", "半决赛", "BO5 · 2 MATCHES"],
      ["F", "总决赛", "BO5 · 1 MATCH"]
    ];

    $("#bracketGrid").innerHTML = roundMeta
      .map(
        ([round, label, meta]) => `
          <section class="bracket-round">
            <div class="bracket-round-head">
              <strong>${label}</strong>
              <span>${meta}</span>
            </div>
            <div class="bracket-matches">
              ${state.bracket.rounds[round].map(bracketMatchMarkup).join("")}
            </div>
          </section>
        `
      )
      .join("");

    const championId = winnerOf(state.bracket.rounds.F[0]);
    $("#championStrip").innerHTML = championId
      ? `
        <div class="champion-result">
          ${crestMarkup(championId)}
          <div>
            <small>YOUR WORLD CHAMPION</small>
            <strong>${TEAMS[championId].name}</strong>
            <span>2026 全球总决赛 · 推演冠军</span>
          </div>
        </div>
      `
      : `<span class="champion-empty">FINAL · AWAITING A CHAMPION</span>`;

    $("#seedList").innerHTML = state.bracket.seeds
      .map(
        (seed, index) => `
          <div class="seed-item">
            <span class="seed-number">${String(index + 1).padStart(2, "0")}</span>
            ${crestMarkup(seed.id, true)}
            <span>${TEAMS[seed.id].name}</span>
            <em>${seed.wins}–${seed.losses}</em>
          </div>
        `
      )
      .join("");

    renderRunSummary();
  }

  function renderRunSummary() {
    const totalSwiss = 33;
    const finishedSwiss = state.matches.filter((match) => match.status === "final").length;
    const bracketMatches = allBracketMatches();
    const finishedKnockout = bracketMatches.filter((match) => match.status === "final").length;
    const champion = state.bracket ? winnerOf(state.bracket.rounds.F[0]) : null;
    $("#runSummary").innerHTML = `
      <div class="summary-stat"><strong>${finishedSwiss}<span style="font-size:10px;color:var(--muted-2)">/33</span></strong><span>瑞士轮场次</span></div>
      <div class="summary-stat"><strong>${finishedKnockout}<span style="font-size:10px;color:var(--muted-2)">/7</span></strong><span>淘汰赛场次</span></div>
      <div class="summary-stat"><strong style="font-size:${champion ? "13px" : "21px"}">${champion ? TEAMS[champion].short : "—"}</strong><span>${champion ? "你的冠军" : "冠军待定"}</span></div>
    `;
  }

  function render() {
    ensureProgression();
    renderRounds();
    renderStandings();
    renderQualification();
    renderBracket();
    renderControls();
  }

  function setView(view, { scroll = false } = {}) {
    currentView = view === "knockout" ? "knockout" : "swiss";
    $$(".app-view").forEach((panel) => panel.classList.remove("is-active"));
    $$(".stage-tab").forEach((tab) => {
      const selected = tab.dataset.viewTarget === `${currentView}View`;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
    $(`#${currentView}View`).classList.add("is-active");

    if (currentView === "knockout") {
      renderBracket();
    }
    renderControls();
    if (scroll) {
      $("#simulator").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
  }

  function flashMatch(matchId) {
    if (!matchId) return;
    requestAnimationFrame(() => {
      $$(`[data-match-id="${CSS.escape(matchId)}"]`).forEach((element) => {
        element.classList.add("is-flashing");
      });
    });
  }

  function handleMatchChoice(matchId, teamId) {
    const match = state.matches.find((item) => item.id === matchId);
    if (!match) return;
    pushUndo();
    const changed = applyWinner(match, teamId, "manual");
    if (!changed) {
      undoStack.pop();
      return;
    }
    const bracketReset = resetBracketForChangedSwiss();
    ensureProgression();
    persistState();
    render();
    showToast(bracketReset ? "瑞士轮赛果已改变，淘汰赛对阵已重置。" : `${TEAMS[teamId].name} 获胜。`);
  }

  function handleBracketChoice(matchId, teamId) {
    if (!state.bracket) return;
    hydrateBracket();
    const match = allBracketMatches().find((item) => item.id === matchId);
    if (!match || !match.a || !match.b) return;
    pushUndo();
    const changed = applyWinner(match, teamId, "manual");
    if (!changed) {
      undoStack.pop();
      return;
    }
    hydrateBracket();
    persistState();
    render();
    showToast(`${TEAMS[teamId].name} 赢下 ${bracketRoundLabel(match.round)}。`);
    flashMatch(match.id);
  }

  function encodeStateForUrl() {
    const json = JSON.stringify(state);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeStateFromUrl(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function loadFromHash() {
    const match = location.hash.match(/^#sim=(.+)$/);
    if (!match) return null;
    try {
      return decodeStateFromUrl(match[1]);
    } catch (error) {
      console.warn("Invalid shared simulation.", error);
      return null;
    }
  }

  function makeShareUrl(relative = false) {
    return `${relative ? location.pathname + location.search : location.href.split("#")[0]}#sim=${encodeStateForUrl()}`;
  }

  async function copyShareUrl() {
    const url = makeShareUrl(false);
    try {
      await navigator.clipboard.writeText(url);
      showToast("分享链接已复制，包含当前完整推演。");
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      showToast("分享链接已复制。");
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "worlds-2026-simulation.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 500);
    showToast("推演 JSON 已导出。");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = normalizeState(JSON.parse(String(reader.result)));
        ensureProgression();
        undoStack = [];
        persistState();
        render();
        showToast("推演 JSON 已导入。");
      } catch (error) {
        showToast(`导入失败：${error.message}`);
      }
    };
    reader.readAsText(file);
  }

  function bindEvents() {
    $$(".stage-tab").forEach((tab) => {
      tab.addEventListener("click", () => setView(tab.dataset.viewTarget.replace("View", "")));
    });

    $("#swissRounds").addEventListener("click", (event) => {
      const button = event.target.closest("[data-match-id][data-team-id]");
      if (!button) return;
      handleMatchChoice(button.dataset.matchId, button.dataset.teamId);
    });

    $("#bracketGrid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-bracket-match][data-team-id]");
      if (!button) return;
      handleBracketChoice(button.dataset.bracketMatch, button.dataset.teamId);
    });

    $("#simulateNextBtn").addEventListener("click", () => {
      const result = simulateOne();
      if (!result.changed) showToast("赛事已经推演完毕。");
    });
    $("#simulateRoundBtn").addEventListener("click", simulateCurrentRound);
    $("#fastForwardBtn").addEventListener("click", simulateEverything);
    $("#simulateAllBtn").addEventListener("click", simulateEverything);
    $("#undoBtn").addEventListener("click", undo);
    $("#shareBtn").addEventListener("click", copyShareUrl);

    $$(".nav-link[data-scroll-to]").forEach((button) => {
      button.addEventListener("click", () => {
        $("#simulator").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    $$("[data-open-dialog]").forEach((button) => {
      button.addEventListener("click", () => {
        const dialog = $(`#${button.dataset.openDialog}`);
        if (dialog && !dialog.open) dialog.showModal();
      });
    });

    $$("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => {
        const dialog = $(`#${button.dataset.closeDialog}`);
        if (dialog?.open) dialog.close();
      });
    });

    $("#rulesDialog").addEventListener("click", (event) => {
      if (event.target === $("#rulesDialog")) $("#rulesDialog").close();
    });

    $("#moreBtn").addEventListener("click", () => {
      const menu = $("#toolMenu");
      menu.hidden = !menu.hidden;
      $("#moreBtn").setAttribute("aria-expanded", String(!menu.hidden));
    });

    $("#toolMenu").addEventListener("click", (event) => {
      const button = event.target.closest("[data-tool]");
      if (!button) return;
      $("#toolMenu").hidden = true;
      $("#moreBtn").setAttribute("aria-expanded", "false");
      if (button.dataset.tool === "export") exportJson();
      if (button.dataset.tool === "import") $("#importInput").click();
      if (button.dataset.tool === "reset") resetSimulation();
    });

    document.addEventListener("click", (event) => {
      if (!$("#toolMenu").hidden && !event.target.closest("#toolMenu") && !event.target.closest("#moreBtn")) {
        $("#toolMenu").hidden = true;
        $("#moreBtn").setAttribute("aria-expanded", "false");
      }
    });

    $("#importInput").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) importJson(file);
      event.target.value = "";
    });

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      const installButton = $("#installBtn");
      if (installButton) installButton.hidden = false;
    });

    const installButton = $("#installBtn");
    if (installButton) {
      installButton.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        installButton.hidden = true;
      });
    }

    window.addEventListener("hashchange", () => {
      const loaded = loadFromHash();
      if (!loaded) return;
      try {
        state = normalizeState(loaded);
        ensureProgression();
        render();
        showToast("已载入分享的推演。");
      } catch (error) {
        showToast(`分享链接无效：${error.message}`);
      }
    });
  }

  function configureGithubLink() {
    const githubLink = $("#githubLink");
    if (!githubLink) return;
    const host = location.hostname;
    const pathParts = location.pathname.split("/").filter(Boolean);
    if (host.endsWith("github.io") && pathParts.length) {
      const owner = host.split(".")[0];
      githubLink.href = `https://github.com/${owner}/${pathParts[0]}`;
      return;
    }
    if (location.protocol === "file:") {
      githubLink.title = "部署到 GitHub Pages 后自动指向仓库";
    }
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("Service worker registration failed.", error);
      });
    }
  }

  safeLoad();
  bindEvents();
  configureGithubLink();
  render();
  registerServiceWorker();
})();
