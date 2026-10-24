(function () {
  "use strict";

  const teams = {
    GEN: { name: "Gen.G", short: "GEN", region: "LCK", rating: 1834, color: "#c8a95b", ink: "#16130b" },
    HLE: { name: "Hanwha Life Esports", short: "HLE", region: "LCK", rating: 1778, color: "#f47b20", ink: "#1b0d02" },
    T1: { name: "T1", short: "T1", region: "LCK", rating: 1741, color: "#e32636", ink: "#fff7f7" },
    DK: { name: "Dplus KIA", short: "DK", region: "LCK", rating: 1634, color: "#73c7c4", ink: "#061515" },
    BLG: { name: "Bilibili Gaming", short: "BLG", region: "LPL", rating: 1698, color: "#4e8cff", ink: "#f2f7ff" },
    TES: { name: "Top Esports", short: "TES", region: "LPL", rating: 1670, color: "#e84a4a", ink: "#fff7f7" },
    AL: { name: "Anyone’s Legend", short: "AL", region: "LPL", rating: 1651, color: "#62a7ff", ink: "#06101c" },
    IG: { name: "Invictus Gaming", short: "IG", region: "LPL", rating: 1597, color: "#e8e9ee", ink: "#11131a" },
    KOI: { name: "Movistar KOI", short: "KOI", region: "LEC", rating: 1622, color: "#55f0d0", ink: "#041512" },
    KC: { name: "Karmine Corp", short: "KC", region: "LEC", rating: 1605, color: "#4c8dff", ink: "#f4f8ff" },
    G2: { name: "G2 Esports", short: "G2", region: "LEC", rating: 1588, color: "#f2ece2", ink: "#151515" },
    LYON: { name: "LYON", short: "LYON", region: "LCS", rating: 1516, color: "#ff5e5b", ink: "#190607" },
    TLAW: { name: "Team Liquid Alienware", short: "TL", region: "LCS", rating: 1508, color: "#65b7ff", ink: "#06111c" },
    CFO: { name: "CTBC Flying Oyster", short: "CFO", region: "LCP", rating: 1569, color: "#efcc5b", ink: "#181205" },
    TSW: { name: "Team Secret Whales", short: "TSW", region: "LCP", rating: 1489, color: "#f3f1e9", ink: "#111827" },
    LOS: { name: "LØS", short: "LOS", region: "CBLOL", rating: 1460, color: "#d6ff42", ink: "#111800" }
  };

  const actualMatches = [
    { id: "R1M1", round: 1, matchNo: 1, a: "HLE", b: "TES", scoreA: 1, scoreB: 0, status: "final", origin: "actual", pool: "0-0" },
    { id: "R1M2", round: 1, matchNo: 2, a: "GEN", b: "IG", scoreA: 1, scoreB: 0, status: "final", origin: "actual", pool: "0-0" },
    { id: "R1M3", round: 1, matchNo: 3, a: "T1", b: "LOS", scoreA: 1, scoreB: 0, status: "final", origin: "actual", pool: "0-0" },
    { id: "R1M4", round: 1, matchNo: 4, a: "LYON", b: "TSW", scoreA: 1, scoreB: 0, status: "final", origin: "actual", pool: "0-0" },
    { id: "R1M5", round: 1, matchNo: 5, a: "CFO", b: "TLAW", scoreA: 1, scoreB: 0, status: "final", origin: "actual", pool: "0-0" },
    { id: "R1M6", round: 1, matchNo: 6, a: "KC", b: "AL", scoreA: 1, scoreB: 0, status: "final", origin: "actual", pool: "0-0" },
    { id: "R1M7", round: 1, matchNo: 7, a: "KOI", b: "BLG", scoreA: 1, scoreB: 0, status: "final", origin: "actual", pool: "0-0" },
    { id: "R1M8", round: 1, matchNo: 8, a: "DK", b: "G2", scoreA: 1, scoreB: 0, status: "final", origin: "actual", pool: "0-0" },

    { id: "R2M1", round: 2, matchNo: 1, a: "GEN", b: "HLE", scoreA: null, scoreB: null, status: "pending", origin: "actual", pool: "1-0", bo: 1 },
    { id: "R2M2", round: 2, matchNo: 2, a: "DK", b: "T1", scoreA: null, scoreB: null, status: "pending", origin: "actual", pool: "1-0", bo: 1 },
    { id: "R2M3", round: 2, matchNo: 3, a: "CFO", b: "KOI", scoreA: null, scoreB: null, status: "pending", origin: "actual", pool: "1-0", bo: 1 },
    { id: "R2M4", round: 2, matchNo: 4, a: "KC", b: "LYON", scoreA: null, scoreB: null, status: "pending", origin: "actual", pool: "1-0", bo: 1 },
    { id: "R2M5", round: 2, matchNo: 5, a: "IG", b: "TSW", scoreA: null, scoreB: null, status: "pending", origin: "actual", pool: "0-1", bo: 1 },
    { id: "R2M6", round: 2, matchNo: 6, a: "TES", b: "AL", scoreA: null, scoreB: null, status: "pending", origin: "actual", pool: "0-1", bo: 1 },
    { id: "R2M7", round: 2, matchNo: 7, a: "G2", b: "LOS", scoreA: null, scoreB: null, status: "pending", origin: "actual", pool: "0-1", bo: 1 },
    { id: "R2M8", round: 2, matchNo: 8, a: "BLG", b: "TLAW", scoreA: null, scoreB: null, status: "pending", origin: "actual", pool: "0-1", bo: 1 }
  ];

  const scheduleLabels = {
    1: "OCT 23",
    2: "OCT 24",
    3: "OCT 26",
    4: "OCT 28",
    5: "OCT 31"
  };

  window.WORLDS_DATA = {
    snapshotDate: "2026-10-24",
    teams,
    actualMatches,
    scheduleLabels
  };
})();
