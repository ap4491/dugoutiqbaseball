"use strict";
const { useState, useRef, useEffect } = React;
/* ------------------------------------------------------------------
   DugoutIQ — Interactive Lineup Card & Game Tracker
   Toronto colourway: navy / royal blue / white / red accents.
   New: live baserunner diamond with auto-advancement.
------------------------------------------------------------------- */
const LOGO = "logo.png";
const POSITIONS = ["", "P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
const MIN_BATTERS = 9;
const MAX_BATTERS = 15;
const freshLineup = (label, n = 12) => Array.from({ length: n }, (_, i) => ({ name: `${label} ${i + 1}`, pos: "", num: "" }));
const freshStats = (n) => Array.from({ length: n }, () => ({ ab: 0, h: 0, r: 0, rbi: 0, bb: 0, k: 0, x2b: 0, x3b: 0, xhr: 0, hbp: 0, sac: 0 }));
const emptyBases = () => ({ first: false, second: false, third: false });
const freshPitcher = (name, num) => ({
    name,
    logName: name, // the name this pitcher's play-by-play lines were written with
    num: num || "",
    wp: 0, // wild pitches
    pitches: 0,
    strikes: 0,
    outs: 0, // outs recorded -> IP
    k: 0,
    bb: 0,
    h: 0,
    r: 0,
    hr: 0,
    uer: 0, // unearned runs (ER displayed = r - uer)
    bf: 0, // batters faced
    pInn: {}, // pitches thrown per inning, keyed by inning number
    lastB: null, // {at, inning} — "last batter" called; credited with `at` pitches
});
const ipDisplay = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;
const pInnStr = (pp, sep, pre) => {
    const m = (pp && pp.pInn) || {};
    const ks = Object.keys(m).map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
    return ks.length ? ks.map((k) => `${pre || ""}${k}: ${m[k]}`).join(sep || ", ") : "";
};
// Baseball Nova Scotia pitch count thresholds by division (5.2.7):
// [no-rest max, 1-day, 2-day, 3-day, daily max (4 days rest)]
const PITCH_DIVISIONS = {
    "11U": [25, 40, 55, 65, 75],
    "13U": [30, 45, 60, 75, 85],
    "15U": [35, 50, 65, 80, 95],
    "18U": [40, 55, 70, 85, 105],
    "22U": [45, 60, 75, 90, 115],
};
// Credited pitch total — when "last batter" was called the pitcher is
// credited with that number even if they threw more to finish the batter
// (BNS 5.2.7.8 / 5.2.7.14, recorded as e.g. "35 (37)").
const creditedOf = (pp) => (pp.lastB && pp.lastB.at != null ? pp.lastB.at : pp.pitches);
// Days rest required (0-4) for a daily credited total in a division
const daysRestFor = (division, pitches) => {
    const t = PITCH_DIVISIONS[division];
    if (!t || pitches <= 0)
        return 0;
    for (let i = 0; i < t.length; i++)
        if (pitches <= t[i])
            return i;
    return 4;
};
// Sheet row: running (cumulative) pitch totals by inning, BNS-sheet style.
// Returns { cells: (number|null)[], lastIdx, total } for innings 1..innCount.
const pitchSheetRow = (pp, innCount) => {
    const m = (pp && pp.pInn) || {};
    let run = 0;
    let lastIdx = -1;
    const cells = [];
    for (let k = 1; k <= innCount; k++) {
        if (m[k] != null) {
            run += m[k];
            cells.push(run);
            lastIdx = k - 1;
        }
        else
            cells.push(null);
    }
    return { cells, lastIdx, total: run };
};
// Cell text for the sheet — the exit inning shows "35 (37)" when last
// batter was called and the actual differs from the credited number
const sheetCellText = (pp, row, idx) => {
    const v = row.cells[idx];
    if (v == null)
        return "";
    if (idx === row.lastIdx && pp.lastB && pp.lastB.at !== row.total)
        return `${pp.lastB.at} (${row.total})`;
    return String(v);
};
// Next BNS threshold at or above the given count, or null past daily max
const nextThresholdFor = (division, pitches) => {
    const t = PITCH_DIVISIONS[division] || [];
    for (const x of t)
        if (x >= pitches)
            return x;
    return null;
};
const snapshot = (s) => JSON.parse(JSON.stringify(s));
// Scoreboard short name: "Clark's Harbour Foggies" -> "Foggies"; short names pass through;
// falls back to initials ("CHF") when the nickname isn't usable.
const autoAbbr = (name) => {
    const n = (name || "").trim();
    if (!n)
        return "";
    if (n.length <= 9)
        return n;
    const words = n.split(/\s+/);
    const last = words[words.length - 1];
    if (last.length >= 4 && last.length <= 10)
        return last;
    return words.map((w) => (w[0] || "")).join("").toUpperCase().slice(0, 4);
};
// Standard scorebook fielding positions
const FPOS = [
    { n: 1, l: "P" }, { n: 2, l: "C" }, { n: 3, l: "1B" },
    { n: 4, l: "2B" }, { n: 5, l: "3B" }, { n: 6, l: "SS" },
    { n: 7, l: "LF" }, { n: 8, l: "CF" }, { n: 9, l: "RF" },
];
// "8" -> "CF". Where a batted ball was hit.
const posLabel = (n) => { const f = FPOS.find((p) => p.n === Number(n)); return f ? f.l : ""; };
/* --- game story: deterministic recap prose built from structured facts --- */
const NUMW = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const numWord = (n) => (n >= 0 && n < NUMW.length ? NUMW[n] : String(n));
const ORDW = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth",
    "tenth", "eleventh", "twelfth"];
const ordWord = (n) => ORDW[n - 1] || `${n}th`;
const POS_LONG = {
    P: "the pitcher", C: "the catcher", "1B": "first base", "2B": "second base", "3B": "third base",
    SS: "shortstop", LF: "left field", CF: "center field", RF: "right field",
};
const POS_NAME = {
    P: "pitcher", C: "catcher", "1B": "first baseman", "2B": "second baseman", "3B": "third baseman",
    SS: "shortstop", LF: "left fielder", CF: "center fielder", RF: "right fielder", DH: "designated hitter",
};
const SPOTW = ["leadoff", "number two", "number three", "cleanup", "number five", "number six",
    "number seven", "number eight", "number nine"];
// One run-scoring play, in words. `e` = {batter, runs, kind}
const scorePhrase = (e) => {
    const [k, loc] = String(e.kind || "").split(":");
    const r = e.runs;
    const scoring = `scoring ${numWord(r)} run${r === 1 ? "" : "s"}`;
    const b = e.batter;
    const lbl = loc ? posLabel(loc) : "";
    const to = lbl && POS_LONG[lbl] ? ` to ${POS_LONG[lbl]}` : "";
    switch (k) {
        case "1B": return `${b} singled${to}, ${scoring}`;
        case "2B": return `${b} doubled${to}, ${scoring}`;
        case "3B": return `${b} tripled${to}, ${scoring}`;
        case "HR":
            return r === 1 ? `${b} hit a solo home run${to}` : `${b} homered${to}, ${scoring}`;
        case "walk": return `${b} walked, ${scoring}`;
        case "ibb": return `${b} was intentionally walked, ${scoring}`;
        case "hbp": return `${b} was hit by a pitch, ${scoring}`;
        case "sacfly": return `${b ? `${b} hit a sacrifice fly` : "a sacrifice fly"}, ${scoring}`;
        case "sacbunt": return `${b ? `${b} laid down a sacrifice bunt` : "a sacrifice bunt"}, ${scoring}`;
        case "fc": return `${b ? `${b} reached on a fielder's choice` : "a fielder's choice"}, ${scoring}`;
        case "groundout": return `${b ? `${b} grounded out` : "a groundout"}, ${scoring}`;
        case "dp": return `${b ? `${b} grounded into a double play` : "a double play"}, ${scoring}`;
        case "ci": return `${b} reached on catcher's interference, ${scoring}`;
        case "error": return `an error ${scoring.replace("scoring", "scored")}`;
        case "balk": return `a balk ${scoring.replace("scoring", "scored")}`;
        case "wp": return `a wild pitch ${scoring.replace("scoring", "scored")}`;
        case "pb": return `a passed ball ${scoring.replace("scoring", "scored")}`;
        case "steal": return `a runner stole home`;
        case "obstruction": return `obstruction ${scoring.replace("scoring", "scored")}`;
        default: return `${numWord(r)} run${r === 1 ? "" : "s"} scored`;
    }
};
// "a, b, and c"
const listJoin = (arr) => {
    if (!arr.length) return "";
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
    return `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
};
const runsIn = (g, side) => g.linescore.reduce((s, r) => s + (r[side] || 0), 0);
// 15 outs -> "five innings"; 5 outs -> "one and two-thirds innings"
const inningsWord = (outs) => {
    const whole = Math.floor(outs / 3), part = outs % 3;
    const frac = part === 1 ? "one-third" : "two-thirds";
    if (!whole && !part) return "no innings";
    if (!whole) return `${frac} of an inning`;
    if (!part) return `${numWord(whole)} inning${whole === 1 ? "" : "s"}`;
    return `${numWord(whole)} and ${frac} innings`;
};

// Build the whole story. `teams` for names, `g` for everything else.
const buildGameStory = (g, teams) => {
    const A = teams.away.name, H = teams.home.name;
    const ar = runsIn(g, "away"), hr = runsIn(g, "home");
    const tied = ar === hr;
    const wSide = ar > hr ? "away" : "home", lSide = ar > hr ? "home" : "away";
    const W = teams[wSide].name, L = teams[lSide].name;
    const ws = Math.max(ar, hr), ls = Math.min(ar, hr);
    const scoring = (g.scoring || []).filter((e) => e.runs > 0);
    const live = !g.over;
    const paras = [];

    // biggest single inning by the winner
    let big = { i: 0, runs: 0 };
    g.linescore.forEach((row, idx) => {
        const n = row[wSide] || 0;
        if (n > big.runs) big = { i: idx + 1, runs: n };
    });

    // ---- headline
    const walkoff = !tied && wSide === "home" && g.linescore.length > 0 &&
        (g.linescore[g.linescore.length - 1].home || 0) > 0 && g.over;
    let head;
    // most specific story first: a one-run game is "Edges", not "Big Inning"
    const bigWord = ordWord(big.i).replace(/^./, (c) => c.toUpperCase());
    if (live) head = `${A} ${ar > hr ? "Lead" : ar < hr ? "Trail" : "Tied With"} ${H} Through ${ordWord(g.inning).replace(/^./, (c) => c.toUpperCase())}`;
    else if (tied) head = `${A} and ${H} Play to a ${ar}-${hr} Tie`;
    else if (ls === 0) head = `${W} Blanks ${L}`;
    else if (walkoff && ws - ls <= 2) head = `${W} Walks Off Against ${L}`;
    else if (ws - ls === 1) head = `${W} Edges ${L}`;
    else if (big.runs >= 4) head = `Big ${bigWord} Inning Leads ${W} Past ${L}`;
    else if (ws - ls >= 10) head = `${W} Cruises Past ${L}`;
    else head = `${W} Defeats ${L}`;

    const dateStr = g.date ? ` on ${new Date(g.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" })}` : "";
    const inningOf = (i, side) => scoring.filter((e) => e.i === i && e.side === side);

    // ---- lead: the big inning, if there was one
    if (live) {
        const half = g.half === "top" ? "the top of " : "";
        const lead = ar === hr
            ? `${A} and ${H} are tied at ${ar} through ${half}the ${ordWord(g.inning)}.`
            : `${teams[ar > hr ? "away" : "home"].name} lead ${teams[ar > hr ? "home" : "away"].name} ${Math.max(ar, hr)}-${Math.min(ar, hr)} through ${half}the ${ordWord(g.inning)}.`;
        paras.push(lead);
    }
    else if (!tied && big.runs >= 3) {
        const plays = inningOf(big.i, wSide).map(scorePhrase);
        let lead = `${W} scored ${numWord(big.runs)} run${big.runs === 1 ? "" : "s"} in the ${ordWord(big.i)} inning, which helped them defeat ${L} ${ws}-${ls}${dateStr}.`;
        if (plays.length) lead += ` In the frame, ${listJoin(plays)}.`;
        paras.push(lead);
    } else if (tied) {
        paras.push(`${A} and ${H} finished level at ${ar}${dateStr}.`);
    } else {
        paras.push(`${W} defeated ${L} ${ws}-${ls}${dateStr}.`);
    }

    // ---- other scoring innings, in order
    const seen = new Set([`${wSide}-${big.i}`]);
    const halves = [];
    g.linescore.forEach((row, idx) => {
        ["away", "home"].forEach((sd) => {
            const n = row[sd] || 0;
            const key = `${sd}-${idx + 1}`;
            if (!n || seen.has(key)) return;
            seen.add(key);
            halves.push({ i: idx + 1, side: sd, runs: n });
        });
    });
    // was this the game's first run, in either half?
    const firstScoreKey = (() => {
        for (let i = 0; i < g.linescore.length; i++)
            for (const sd of ["away", "home"])
                if (g.linescore[i][sd] > 0) return `${sd}-${i + 1}`;
        return null;
    })();
    halves.slice(0, 6).forEach((h) => {
        const plays = inningOf(h.i, h.side).map(scorePhrase);
        const tm = teams[h.side].name;
        const body = plays.length ? listJoin(plays) : `${numWord(h.runs)} run${h.runs === 1 ? "" : "s"} scored`;
        // manual run adjustments bypass the play funnel — if the captured plays
        // don't account for the whole inning, don't claim a number we can't back
        const acct = plays.length ? inningOf(h.i, h.side).reduce((n, e) => n + e.runs, 0) : 0;
        if (`${h.side}-${h.i}` === firstScoreKey)
            paras.push(`${tm} opened the scoring in the ${ordWord(h.i)} after ${body}.`);
        else if (acct === h.runs)
            paras.push(`${tm} added ${numWord(h.runs)} in the ${ordWord(h.i)} when ${body}.`);
        else
            paras.push(`${tm} scored again in the ${ordWord(h.i)} when ${body}.`);
    });

    // ---- pitching decisions
    const decLine = (role, verb) => {
        const d = g.decisions && g.decisions[role];
        if (!d || !g.pitchers[d.side] || !g.pitchers[d.side][d.idx]) return null;
        const p = g.pitchers[d.side][d.idx];
        const er = Math.max(0, p.r - (p.uer || 0));
        const runsTxt = `${numWord(p.r)} run${p.r === 1 ? "" : "s"}${p.r !== er ? ` (${er === 0 ? "none" : numWord(er)} earned)` : ""}`;
        const walked = p.bb === 0 ? "walking none" : `walking ${numWord(p.bb)}`;
        return `${p.name} ${verb} for ${teams[d.side].name}. The pitcher went ${inningsWord(p.outs)}, giving up ${runsTxt} on ${numWord(p.h)} hit${p.h === 1 ? "" : "s"}, striking out ${numWord(p.k)} and ${walked}.`;
    };
    const w = decLine("w", "earned the win"), l = decLine("l", "took the loss"), sv = decLine("s", "picked up the save");
    const pit = [w, l, sv].filter(Boolean);
    if (pit.length) paras.push(pit.join(" "));

    // ---- batting notes, winner first
    [wSide, lSide].forEach((sd) => {
        if (tied && sd === lSide) return;
        const lu = g.lineup[sd] || [];
        const st = g.stats[sd] || [];
        const rows = lu.map((p, i) => ({ p, i, s: st[i] || {} })).filter((r) => r.s.ab || r.s.h || r.s.bb);
        if (!rows.length) return;
        const bits = [];
        const hits = g.hits[sd] || 0;
        bits.push(`${teams[sd].name} tallied ${numWord(hits)} hit${hits === 1 ? "" : "s"} in the game.`);
        const rbiLead = rows.slice().sort((a, b) => (b.s.rbi || 0) - (a.s.rbi || 0))[0];
        if (rbiLead && rbiLead.s.rbi > 0) {
            const pos = POS_NAME[rbiLead.p.pos] || "";
            const spot = SPOTW[rbiLead.i] || `number ${rbiLead.i + 1}`;
            bits.push(`${rbiLead.p.name} led ${teams[sd].name} with ${numWord(rbiLead.s.rbi)} run${rbiLead.s.rbi === 1 ? "" : "s"} batted in from the ${spot} spot in the lineup.`);
            if (pos && rbiLead.s.ab) bits.push(`The ${pos} went ${rbiLead.s.h}-for-${rbiLead.s.ab} on the day.`);
        }
        // "X collected three hits" / "X and Y each collected three hits"
        const collected = (names, what) => names.length === 1
            ? `${names[0]} collected ${what} for ${teams[sd].name}.`
            : `${listJoin(names)} each collected ${what} for ${teams[sd].name}.`;
        const lead = rbiLead && rbiLead.s.rbi > 0 ? rbiLead : null;
        const three = rows.filter((r) => (r.s.h || 0) >= 3 && r !== lead).map((r) => r.p.name);
        if (three.length) bits.push(collected(three, "three hits"));
        const multi = rows.filter((r) => (r.s.h || 0) === 2 && r !== lead).map((r) => r.p.name);
        if (multi.length) bits.push(collected(multi, "multiple hits"));
        const errs = (g.errLog || []).filter((e) => e.side === sd).length;
        if (sd === wSide) bits.push(errs === 0 ? `${teams[sd].name} didn't commit a single error in the field.` : `${teams[sd].name} committed ${numWord(errs)} error${errs === 1 ? "" : "s"} in the field.`);
        paras.push(bits.join(" "));
    });

    // home run roll-call
    const hrs = scoring.filter((e) => String(e.kind).split(":")[0] === "HR" && e.batter);
    if (hrs.length) paras.push(`Home runs: ${listJoin(hrs.map((e) => `${e.batter} (${ordWord(e.i)})`))}.`);

    // the loser's glove, when it mattered
    if (!tied && !live) {
        const le = (g.errLog || []).filter((e) => e.side === lSide).length;
        if (le >= 2) paras.push(`${L} committed ${numWord(le)} errors in the field.`);
    }

    // linescore footer, kept out of the prose so it survives a copy/paste
    const pad = Math.max(A.length, H.length, 12);
    const lineFor = (sd) => `${teams[sd].name.padEnd(pad)} ${g.linescore.map((r) => (r[sd] == null ? "-" : r[sd])).join(" ")}  |  R ${runsIn(g, sd)}  H ${g.hits[sd] || 0}  E ${g.errors[sd] || 0}`;
    const footer = `${lineFor("away")}\n${lineFor("home")}\n\n\u2014 scored with DugoutIQ`;
    return { headline: head, body: paras.join("\n\n"), footer };
};

// Rename a player inside a play-by-play text. Numeric placeholder "names"
// are matched only in the template positions names occupy, so real numbers
// (pitch counts, "3rd", notation) are never touched.
const renameInLogText = (txt, oldName, nm) => {
    if (typeof txt !== "string" || !oldName || txt.indexOf(oldName) === -1)
        return txt;
    const escRe = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let out = txt;
    if (/^\d+$/.test(oldName)) {
        out = out.replace(new RegExp("(^|\\u2014\\s|\\u00B7\\s|,\\s|:\\s)" + escRe + "(?=:| (caught|out|picked|scores|steals|removed|takes|to|in)\\b)", "g"), "$1" + nm);
        out = out.replace(new RegExp("(RBI )" + escRe + "(?=$|[^\\w])", "g"), "$1" + nm);
        out = out.replace(new RegExp("(in for )" + escRe + "(?= \\()", "g"), "$1" + nm);
    }
    else {
        out = out.replace(new RegExp("(^|[^\\w])" + escRe + "(?=$|[^\\w])", "g"), "$1" + nm);
    }
    return out;
};
// Repair leftover jersey-number placeholders using the lineup's # field:
// any log entry naming "12" becomes the player whose number is 12. Side-aware
// (top half = away batting), so #12 on each team maps to the right player.
const repairLogNames = (g) => {
    if (!g || !Array.isArray(g.log) || !g.lineup)
        return;
    const byNum = (lu) => {
        const m = {};
        (lu || []).forEach((p) => {
            const num = (p.num || "").trim();
            const name = (p.name || "").trim();
            if (num && name && name !== num)
                m[num] = name;
        });
        return m;
    };
    const bat = { top: byNum(g.lineup.away), bottom: byNum(g.lineup.home) };
    const fld = { top: byNum(g.lineup.home), bottom: byNum(g.lineup.away) };
    g.log.forEach((e) => {
        const side = e.h === "top" ? "top" : "bottom";
        if (e.batter && bat[side][e.batter])
            e.batter = bat[side][e.batter];
        ["t", "result"].forEach((k) => {
            if (typeof e[k] !== "string" || !e[k])
                return;
            const maps = e[k].indexOf("Pitching change") === 0 ? fld[side] : bat[side];
            Object.keys(maps).forEach((num) => { e[k] = renameInLogText(e[k], num, maps[num]); });
        });
    });
    if (g.pitchers && g.lineup) {
        ["away", "home"].forEach((sd) => {
            const m = byNum(g.lineup[sd]);
            (g.pitchers[sd] || []).forEach((pp) => { if (m[pp.name]) pp.name = m[pp.name]; });
        });
    }
};
const fieldNote = (label, seq) => {
    if (!seq || !seq.length) return "";
    if (label === "flyout") return "F" + seq[0];
    if (label === "popup") return "P" + seq[0];
    if (label === "lineout") return "L" + seq[0];
    if (label === "infieldfly") return "IF" + seq[0];
    return seq.join("-"); // groundout / default
};
// Load brand fonts from the app itself, so they work even if index.html is stale.
(function () {
    try {
        if (!document.querySelector('link[href*="fonts.googleapis.com/css2"]')) {
            var l = document.createElement("link");
            l.rel = "stylesheet";
            l.href = "https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;600;700;800&display=swap";
            document.head.appendChild(l);
        }
    }
    catch (e) { }
})();
const SAVE_KEY = "dugoutiq-save-v1";
const APP_VERSION = "113"; // shown in Settings; keep in step with the sw.js cache version
// ---- Backup & restore ----
const BACKUP_META_KEY = "dugoutiq-backup-meta-v1"; // {code, t} of the last cloud backup
const collectBackup = () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("dugoutiq-") === 0 && k !== BACKUP_META_KEY)
            data[k] = localStorage.getItem(k);
    }
    return { v: 1, app: "dugoutiq", t: Date.now(), data };
};
const applyBackup = (payload) => {
    if (!payload || typeof payload.data !== "object")
        throw new Error("Not a DugoutIQ backup");
    // clear existing app data (keep the backup code so future backups continue it)
    const gone = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("dugoutiq-") === 0 && k !== BACKUP_META_KEY)
            gone.push(k);
    }
    gone.forEach((k) => localStorage.removeItem(k));
    Object.keys(payload.data).forEach((k) => {
        if (k.indexOf("dugoutiq-") === 0 && typeof payload.data[k] === "string")
            localStorage.setItem(k, payload.data[k]);
    });
};
const backupMeta = () => { try {
    return JSON.parse(localStorage.getItem(BACKUP_META_KEY) || "null");
}
catch (_a) {
    return null;
} };
const loadSaved = () => { try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
}
catch (_a) {
    return null;
} };
const saved0 = loadSaved();
if (saved0 && saved0.game) {
    const g = saved0.game;
    if (!g.lineup && saved0.teams) {
        try {
            g.lineup = { away: saved0.teams.away.lineup.map((p) => ({ name: p.name, pos: p.pos || "", num: p.num || "" })), home: saved0.teams.home.lineup.map((p) => ({ name: p.name, pos: p.pos || "", num: p.num || "" })) };
        }
        catch (_a) { }
    }
    if (!g.subs)
        g.subs = { away: [], home: [] };
    if (!g.decisions)
        g.decisions = { w: null, l: null, s: null };
    if (!g.pb)
        g.pb = { away: 0, home: 0 };
    if (!g.errLog)
        g.errLog = [];
    if (!g.scoring)
        g.scoring = [];
    if (!g.orderLocked)
        g.orderLocked = { away: false, home: false };
    if (g.pitchers) {
        ["away", "home"].forEach((sd) => (g.pitchers[sd] || []).forEach((pp) => {
            if (pp.uer == null)
                pp.uer = 0;
            if (pp.wp == null)
                pp.wp = 0;
            if (pp.logName == null)
                pp.logName = pp.name;
            if (pp.num == null) {
                // older save: pull the jersey off the lineup by name
                const roster = (g.lineup && g.lineup[sd]) || [];
                const match = roster.find((pl) => pl.name === pp.name);
                pp.num = match && match.num ? match.num : "";
            }
        }));
    }
}
const LICENSE_KEY_STORE = "dugoutiq-license-v1";
const loadActivation = () => { try {
    return localStorage.getItem(LICENSE_KEY_STORE);
}
catch (_a) {
    return null;
} };
const persistActivation = (k) => { try {
    localStorage.setItem(LICENSE_KEY_STORE, k);
}
catch (_a) { } };
const verifyLicense = async (key) => {
    try {
        const r = await fetch("/.netlify/functions/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: key.trim() }) });
        const data = await r.json().catch(() => null);
        if (data && data.ok)
            return { ok: true };
        return { ok: false, message: (data && data.message) || "Key not recognized — check it against your receipt." };
    }
    catch (_a) {
        return { ok: false, message: "Couldn't reach the license server — check your connection and try once; after activation the app works fully offline." };
    }
};
const ROSTERS_KEY = "dugoutiq-rosters-v1";
const loadRosters = () => { try {
    return JSON.parse(localStorage.getItem(ROSTERS_KEY) || "[]");
}
catch (_a) {
    return [];
} };
const persistRosters = (list) => { try {
    localStorage.setItem(ROSTERS_KEY, JSON.stringify(list));
}
catch (_a) { } };
const GAMES_KEY = "dugoutiq-games-v1";
const loadGames = () => { try {
    return JSON.parse(localStorage.getItem(GAMES_KEY) || "[]");
}
catch (_a) {
    return [];
} };
const persistGames = (list) => { try {
    localStorage.setItem(GAMES_KEY, JSON.stringify(list));
}
catch (_a) { } };
function DugoutScorecard() {
    const [licensed, setLicensed] = useState(() => !!loadActivation());
    const [licenseKey, setLicenseKey] = useState("");
    const [licenseBusy, setLicenseBusy] = useState(false);
    const [licenseErr, setLicenseErr] = useState("");
    const activate = async () => {
        const k = licenseKey.trim();
        if (!k || licenseBusy)
            return;
        setLicenseBusy(true);
        setLicenseErr("");
        try {
            const res = await verifyLicense(k);
            if (res && res.ok) {
                persistActivation(k);
                setLicensed(true);
            }
            else {
                setLicenseErr((res && res.message) || "That key didn't verify — check it for typos.");
            }
        }
        catch (_a) {
            setLicenseErr("Couldn't reach the license server — check your connection and try again.");
        }
        setLicenseBusy(false);
    };
    const [phase, setPhase] = useState((saved0 && saved0.phase) || "setup");
    const [teams, setTeams] = useState((saved0 && saved0.teams) || {
        away: { name: "VISITORS", color: "#134A8E", logo: "", lineup: freshLineup("Batter") },
        home: { name: "HOME", color: "#B91C1C", logo: "", lineup: freshLineup("Batter") },
    });
    const [game, setGame] = useState((saved0 && saved0.game) || null);
    const [baseMenu, setBaseMenu] = useState(null); // which occupied base was tapped
    const [pitchMenuSide, setPitchMenuSide] = useState(null); // null | "away" | "home"
    const [pitchLimit, setPitchLimit] = useState(saved0 && saved0.pitchLimit != null ? saved0.pitchLimit : 85); // 0 = off
    const [division, setDivision] = useState((saved0 && saved0.division) || ""); // "" = off; BNS age division for pitch count rules
    const [sheetOpen, setSheetOpen] = useState(false); // pitch count sheet view
    const [incomingName, setIncomingName] = useState("");
    const [showLog, setShowLog] = useState(false);
    useEffect(() => { try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ phase, teams, game, pitchLimit, division }));
    }
    catch (_a) { } }, [phase, teams, game, pitchLimit, division]);
    const [fcMenu, setFcMenu] = useState(false);
    const [fieldPick, setFieldPick] = useState(null); // {label, isK} | null — fielder picker for batted outs
    const [fieldSeq, setFieldSeq] = useState([]); // positions tapped, e.g. [6,3]
    const [sacMenu, setSacMenu] = useState(false);
    const [dpMenu, setDpMenu] = useState(false);
    const [tagMenu, setTagMenu] = useState(false);
    const [subMenu, setSubMenu] = useState(false);
    const [subSide, setSubSide] = useState("away");
    const [subSlot, setSubSlot] = useState(null);
    const [subName, setSubName] = useState("");
    const [subPos, setSubPos] = useState("");
    const [subNum, setSubNum] = useState("");
    const [batterMenu, setBatterMenu] = useState(false);
    const [batName, setBatName] = useState("");
    const [batPos, setBatPos] = useState("");
    const [batNum, setBatNum] = useState("");
    const [decisionsOpen, setDecisionsOpen] = useState(false);
    const [bookChoose, setBookChoose] = useState(false);
    const [confirmNew, setConfirmNew] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [moreMenu, setMoreMenu] = useState(false); // wild pitch / passed ball / interference
    const [dpKind, setDpKind] = useState("ground"); // "ground" (force) | "caught" (doubled off)
    const [crMenu, setCrMenu] = useState(null); // base string — courtesy runner picker
    const [storyOpen, setStoryOpen] = useState(null); // {headline, body}
    const [storyCopied, setStoryCopied] = useState(false);
    const [tpMenu, setTpMenu] = useState(false); // triple play picker
    const [tpSel, setTpSel] = useState([]); // bases of the two runners retired
    const [rhbMenu, setRhbMenu] = useState(false); // runner hit by batted ball — pick which runner
    const [kMenu, setKMenu] = useState(false); // strike three — called (looking) vs swinging
    const LIVE_KEY = "dugoutiq-live-v1";
    const loadLive = () => {
        try {
            return JSON.parse(localStorage.getItem(LIVE_KEY) || "null") || {};
        }
        catch (_a) {
            return {};
        }
    };
    const [liveCode, setLiveCode] = useState(() => loadLive().code || null); // spectator share code
    const [liveOn, setLiveOn] = useState(() => !!loadLive().on); // broadcasting?
    const [liveList, setLiveList] = useState(() => !!loadLive().list); // listed on public hub?
    const [liveVideo, setLiveVideo] = useState(() => loadLive().video || ""); // optional YouTube/StreamYard live video link
    const [liveOpen, setLiveOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    // ---- Backup & restore state ----
    const [bkMeta, setBkMeta] = useState(backupMeta); // {code,t} | null
    const [bkBusy, setBkBusy] = useState(false);
    const [bkMsg, setBkMsg] = useState(null); // {ok, text} | null
    const [restoreIn, setRestoreIn] = useState("");
    const runBackup = async () => {
        setBkBusy(true);
        setBkMsg(null);
        try {
            const payload = collectBackup();
            const body = JSON.stringify({ code: (bkMeta && bkMeta.code) || undefined, payload });
            if (body.length > 4.2 * 1024 * 1024)
                throw new Error("Backup is very large — use Export file instead");
            const r = await fetch("/.netlify/functions/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.ok)
                throw new Error(d.message || "Backup failed");
            const meta = { code: d.code, t: d.t || Date.now() };
            localStorage.setItem(BACKUP_META_KEY, JSON.stringify(meta));
            setBkMeta(meta);
            setBkMsg({ ok: true, text: "Backed up. Keep your code somewhere safe — it's how you restore." });
        }
        catch (e) {
            setBkMsg({ ok: false, text: (e && e.message) || "Backup failed — are you online?" });
        }
        setBkBusy(false);
    };
    const runRestore = async () => {
        const code = restoreIn.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (code.length !== 12) {
            setBkMsg({ ok: false, text: "Enter the 12-character backup code." });
            return;
        }
        if (!window.confirm("Restore this backup? Everything currently in the app on this device (games, teams, settings) will be replaced."))
            return;
        setBkBusy(true);
        setBkMsg(null);
        try {
            const r = await fetch("/.netlify/functions/backup?code=" + code);
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.ok || !d.payload)
                throw new Error(d.message || "No backup found for that code");
            applyBackup(d.payload);
            localStorage.setItem(BACKUP_META_KEY, JSON.stringify({ code, t: (d.payload && d.payload.t) || Date.now() }));
            window.location.reload();
        }
        catch (e) {
            setBkMsg({ ok: false, text: (e && e.message) || "Restore failed — are you online?" });
            setBkBusy(false);
        }
    };
    const exportBackupFile = () => {
        try {
            const payload = collectBackup();
            const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "DugoutIQ-backup-" + new Date().toISOString().slice(0, 10) + ".json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setBkMsg({ ok: true, text: "Backup file downloaded. Keep it somewhere safe (works offline)." });
        }
        catch (e) {
            setBkMsg({ ok: false, text: "Couldn't create the file on this device." });
        }
    };
    const importBackupFile = (ev) => {
        const f = ev.target.files && ev.target.files[0];
        ev.target.value = "";
        if (!f)
            return;
        if (!window.confirm("Restore from this file? Everything currently in the app on this device (games, teams, settings) will be replaced."))
            return;
        const rd = new FileReader();
        rd.onload = () => {
            try {
                const payload = JSON.parse(String(rd.result || ""));
                applyBackup(payload);
                window.location.reload();
            }
            catch (e) {
                setBkMsg({ ok: false, text: "That file isn't a DugoutIQ backup." });
            }
        };
        rd.readAsText(f);
    };
    const [liveCopied, setLiveCopied] = useState(false);
    const [themeColor, setThemeColor] = useState(() => { try {
        return localStorage.getItem("dugoutiq-theme-color") || "#1B57A0";
    }
    catch (_a) {
        return "#1B57A0";
    } });
    const [themeLogo, setThemeLogo] = useState(() => { try {
        return localStorage.getItem("dugoutiq-theme-logo") || "";
    }
    catch (_a) {
        return "";
    } });
    const [recapPreview, setRecapPreview] = useState(null); // {dataUrl, canShare}
    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState("");
    const [setupMsg, setSetupMsg] = useState("");
    const [history, setHistory] = useState([]);
    /* ---------------- setup helpers ---------------- */
    const setTeamName = (side, name) => setTeams((t) => (Object.assign(Object.assign({}, t), { [side]: Object.assign(Object.assign({}, t[side]), { name }) })));
    const PRESET_TEAM_COLORS = [
        "#134A8E", "#1D4ED8", "#0E7490", "#15803D",
        "#B91C1C", "#C2410C", "#7E22CE", "#0F172A",
    ];
    const teamColor = (side) => (teams[side] && teams[side].color) || (side === "away" ? "#134A8E" : "#B91C1C");
    const setTeamColor = (side, color) => setTeams((t) => (Object.assign(Object.assign({}, t), { [side]: Object.assign(Object.assign({}, t[side]), { color }) })));
    const setTeamLogo = (side, logo) => setTeams((t) => (Object.assign(Object.assign({}, t), { [side]: Object.assign(Object.assign({}, t[side]), { logo: logo || "" }) })));
    // Pull the dominant vivid color out of a logo (skips white/black/grey + transparent).
    const dominantColor = (ctx, w, h) => {
        try {
            const data = ctx.getImageData(0, 0, w, h).data;
            const buckets = {};
            let best = null, bestN = 0;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
                if (a < 128)
                    continue;
                const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
                if (mx > 235 && mn > 235)
                    continue; // near-white
                if (mx < 35)
                    continue; // near-black
                if (mx - mn < 28 && mx < 200)
                    continue; // dull grey
                const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
                const c = buckets[key] || (buckets[key] = { r: 0, g: 0, b: 0, n: 0 });
                c.r += r;
                c.g += g;
                c.b += b;
                c.n++;
                if (c.n > bestN) {
                    bestN = c.n;
                    best = c;
                }
            }
            if (!best || !bestN)
                return null;
            let r = Math.round(best.r / best.n), g = Math.round(best.g / best.n), b = Math.round(best.b / best.n);
            const mx = Math.max(r, g, b); // lift very dark colors so the name stays readable on navy
            if (mx > 0 && mx < 110) {
                const f = 150 / mx;
                r = Math.min(255, Math.round(r * f));
                g = Math.min(255, Math.round(g * f));
                b = Math.min(255, Math.round(b * f));
            }
            return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
        }
        catch (_a) {
            return null;
        }
    };
    const onLogoPick = (side, e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const max = 96; // resize so logos stay small in storage / broadcasts
                const scale = Math.min(max / img.width, max / img.height, 1);
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const cv = document.createElement("canvas");
                cv.width = w;
                cv.height = h;
                const ctx = cv.getContext("2d");
                ctx.drawImage(img, 0, 0, w, h);
                try {
                    setTeamLogo(side, cv.toDataURL("image/png"));
                }
                catch (_a) { }
                const dc = dominantColor(ctx, w, h); // auto-match team color to the logo
                if (dc)
                    setTeamColor(side, dc);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    };
    const onThemeLogoPick = (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const max = 160;
                const scale = Math.min(max / img.width, max / img.height, 1);
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const cv = document.createElement("canvas");
                cv.width = w;
                cv.height = h;
                cv.getContext("2d").drawImage(img, 0, 0, w, h);
                try {
                    setThemeLogo(cv.toDataURL("image/png"));
                }
                catch (_a) { }
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    };
    useEffect(() => {
        try {
            localStorage.setItem("dugoutiq-theme-color", themeColor);
            localStorage.setItem("dugoutiq-theme-logo", themeLogo);
        }
        catch (_a) { }
    }, [themeColor, themeLogo]);
    // ---- Scan a lineup card photo into the batting order ----
    const [scanBusy, setScanBusy] = useState(null); // side | null
    const [scanMsg, setScanMsg] = useState(null); // {side, ok, text} | null
    const scanLineup = (side, file) => {
        if (!file)
            return;
        setScanBusy(side);
        setScanMsg(null);
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = async () => {
            try {
                const MAX = 1400;
                const sc = Math.min(1, MAX / Math.max(img.width, img.height));
                const cv = document.createElement("canvas");
                cv.width = Math.round(img.width * sc);
                cv.height = Math.round(img.height * sc);
                cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
                URL.revokeObjectURL(url);
                const b64 = cv.toDataURL("image/jpeg", 0.8).split(",")[1];
                const r = await fetch("/.netlify/functions/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: b64 }) });
                const d = await r.json().catch(() => ({}));
                if (!r.ok || !d.ok || !Array.isArray(d.players) || !d.players.length)
                    throw new Error((d && d.message) || "Couldn't read that photo");
                setTeams((t) => (Object.assign(Object.assign({}, t), { [side]: Object.assign(Object.assign({}, t[side]), { lineup: d.players.slice(0, MAX_BATTERS).map((pl) => ({
                            name: pl.name || (pl.num ? pl.num : ""),
                            num: pl.num || "",
                            pos: POSITIONS.includes(pl.pos) ? pl.pos : "",
                            posHist: POSITIONS.includes(pl.pos) && pl.pos ? [pl.pos] : [],
                        })) }) })));
                setScanMsg({ side, ok: true, text: "Read " + d.players.length + " batters — check names & numbers, then fix any misreads." });
            }
            catch (e) {
                setScanMsg({ side, ok: false, text: (e && e.message) || "Scan failed — are you online?" });
            }
            setScanBusy(null);
        };
        img.onerror = () => { URL.revokeObjectURL(url); setScanMsg({ side, ok: false, text: "Couldn't open that photo." }); setScanBusy(null); };
        img.src = url;
    };
    const setPlayer = (side, idx, field, value) => setTeams((t) => {
        const lineup = t[side].lineup.map((p, i) => i === idx ? Object.assign(Object.assign({}, p), { [field]: value }) : p);
        return Object.assign(Object.assign({}, t), { [side]: Object.assign(Object.assign({}, t[side]), { lineup }) });
    });
    const addPlayer = (side) => setTeams((t) => {
        if (t[side].lineup.length >= MAX_BATTERS)
            return t;
        const lineup = [
            ...t[side].lineup,
            { name: `Batter ${t[side].lineup.length + 1}`, pos: "", num: "" },
        ];
        return Object.assign(Object.assign({}, t), { [side]: Object.assign(Object.assign({}, t[side]), { lineup }) });
    });
    const removePlayer = (side, idx) => setTeams((t) => {
        if (t[side].lineup.length <= MIN_BATTERS)
            return t;
        const lineup = t[side].lineup.filter((_, i) => i !== idx);
        return Object.assign(Object.assign({}, t), { [side]: Object.assign(Object.assign({}, t[side]), { lineup }) });
    });
    /* --- My Teams: saved roster library --- */
    const [rosters, setRosters] = useState(loadRosters);
    const [teamPickSide, setTeamPickSide] = useState(null); // which side to load into
    const [confirmRosterDel, setConfirmRosterDel] = useState(null);
    /* --- Saved Games: finished-game archive --- */
    const [games, setGames] = useState(loadGames);
    const [gamesOpen, setGamesOpen] = useState(false);
    const [seasonOpen, setSeasonOpen] = useState(false);
    const [seasonTeam, setSeasonTeam] = useState("");
    const [seasonTab, setSeasonTab] = useState("bat");
    const [seasonSort, setSeasonSort] = useState({ col: "ab", dir: -1 });
    const [confirmGameDel, setConfirmGameDel] = useState(null);
    const [gameDate, setGameDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [pbpOpen, setPbpOpen] = useState(false);
    const [pbpEdit, setPbpEdit] = useState(null);
    const [pbpText, setPbpText] = useState("");
    const archivedIdRef = useRef(null);
    const archiveGame = (g) => {
        if (!g)
            return;
        const sumRuns = (side) => g.linescore.reduce((s, r) => s + (r[side] || 0), 0);
        const record = {
            id: g.id || Date.now(),
            savedAt: Date.now(),
            date: g.date || null, // the date the game was PLAYED — never changes
            away: { name: teams.away.name, color: teams.away.color || "", logo: teams.away.logo || "" },
            home: { name: teams.home.name, color: teams.home.color || "", logo: teams.home.logo || "" },
            awayRuns: sumRuns("away"),
            homeRuns: sumRuns("home"),
            snapshot: { teams: snapshot(teams), game: snapshot(g), pitchLimit, division },
        };
        setGames((list) => {
            const prev = list.find((x) => x.id === record.id);
            if (prev) {
                // re-archiving an existing game must not shift its dates
                if (prev.savedAt)
                    record.savedAt = prev.savedAt;
                if (!record.date && prev.date)
                    record.date = prev.date;
            }
            const next = [record, ...list.filter((x) => x.id !== record.id)].slice(0, 100);
            persistGames(next);
            return next;
        });
    };
    const reopenGame = (record) => {
        const snap = record.snapshot || {};
        if (snap.teams)
            setTeams(snapshot(snap.teams));
        if (snap.game) {
            const g0 = snapshot(snap.game);
            repairLogNames(g0); // heal jersey-number placeholders via the lineup's # field
            setGame(g0);
        }
        if (typeof snap.pitchLimit !== "undefined")
            setPitchLimit(snap.pitchLimit);
        setDivision(snap.division || "");
        archivedIdRef.current = record.id; // already saved — don't re-archive on the over-effect
        setHistory([]);
        setPhase("game");
        setGamesOpen(false);
    };
    const deleteGame = (id) => {
        setGames((list) => {
            const next = list.filter((x) => x.id !== id);
            persistGames(next);
            return next;
        });
    };
    // ---- Season stats: aggregate every saved game by team name ----
    const lc = (s) => (s || "").trim().toLowerCase();
    const seasonTeamList = () => {
        const counts = {};
        games.forEach((rec) => {
            ["away", "home"].forEach((side) => {
                const nm = ((rec[side] && rec[side].name) || "").trim();
                if (nm)
                    counts[nm] = (counts[nm] || 0) + 1;
            });
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map((e) => e[0]);
    };
    const computeSeason = (teamName) => {
        const tn = lc(teamName);
        const bat = {}, pit = {};
        let gp = 0;
        games.forEach((rec) => {
            const g = rec.snapshot && rec.snapshot.game;
            if (!g)
                return;
            ["away", "home"].forEach((side) => {
                if (lc(rec[side] && rec[side].name) !== tn)
                    return;
                gp += 1;
                const lu = (g.lineup && g.lineup[side]) || [];
                const st = (g.stats && g.stats[side]) || [];
                const addBat = (name, num, s, ext) => {
                    const k = lc(name);
                    if (!k)
                        return;
                    const pa = (s.ab || 0) + (s.bb || 0) + (s.hbp || 0) + (s.sac || 0);
                    if (pa === 0 && (s.r || 0) === 0)
                        return; // skip never-played placeholders
                    const b = bat[k] ||
                        (bat[k] = { name: (name || "").trim(), num: num || "", gp: 0, ab: 0, r: 0, h: 0, x2b: 0, x3b: 0, xhr: 0, rbi: 0, bb: 0, k: 0, hbp: 0, sac: 0 });
                    b.gp += 1;
                    b.ab += s.ab || 0;
                    b.r += s.r || 0;
                    b.h += s.h || 0;
                    b.rbi += s.rbi || 0;
                    b.bb += s.bb || 0;
                    b.k += s.k || 0;
                    if (ext) {
                        b.x2b += s.x2b || 0;
                        b.x3b += s.x3b || 0;
                        b.xhr += s.xhr || 0;
                        b.hbp += s.hbp || 0;
                        b.sac += s.sac || 0;
                    }
                    if (num)
                        b.num = num;
                };
                lu.forEach((p, i) => { if (st[i])
                    addBat(p.name, p.num, st[i], true); });
                ((g.subs && g.subs[side]) || []).forEach((p) => addBat(p.name, p.num, p, false));
                ((g.pitchers && g.pitchers[side]) || []).forEach((p) => {
                    const k = lc(p.name);
                    if (!k)
                        return;
                    if ((p.outs || 0) === 0 && (p.bf || 0) === 0)
                        return;
                    const q = pit[k] || (pit[k] = { name: (p.name || "").trim(), app: 0, outs: 0, h: 0, r: 0, er: 0, bb: 0, k: 0, hr: 0 });
                    q.app += 1;
                    q.outs += p.outs || 0;
                    q.h += p.h || 0;
                    q.r += p.r || 0;
                    q.bb += p.bb || 0;
                    q.k += p.k || 0;
                    q.hr += p.hr || 0;
                    q.er += Math.max(0, (p.r || 0) - (p.uer || 0));
                });
            });
        });
        return { gp, bat: Object.values(bat), pit: Object.values(pit) };
    };
    const avg3 = (h, ab) => (ab > 0 ? (h / ab).toFixed(3).replace(/^0/, "") : ".000");
    const obp3 = (b) => {
        const d = b.ab + b.bb + b.hbp + b.sac;
        return d > 0 ? ((b.h + b.bb + b.hbp) / d).toFixed(3).replace(/^0/, "") : ".000";
    };
    const era2 = (er, outs) => (outs > 0 ? ((er * 27) / outs).toFixed(2) : "—"); // 9-inning basis
    // Keep the archive in sync while a final game is open — the moment it goes
    // final AND after any later edit (names, play-by-play fixes, decisions),
    // so nothing is lost when the game is closed. Re-archiving preserves the
    // original saved date (see archiveGame).
    useEffect(() => {
        if (game && game.over && game.id) {
            archivedIdRef.current = game.id;
            archiveGame(game);
        }
    }, [game, teams]);
    useEffect(() => { if (!gamesOpen)
        setConfirmGameDel(null); }, [gamesOpen]);
    useEffect(() => { if (!teamPickSide)
        setConfirmRosterDel(null); }, [teamPickSide]);
    const saveRoster = (side) => {
        const name = teams[side].name.trim() || "My Team";
        const entry = { name, lineup: snapshot(teams[side].lineup) };
        const next = [entry, ...rosters.filter((r) => r.name !== name)].slice(0, 12);
        setRosters(next);
        persistRosters(next);
        setSetupMsg(`Saved "${name}" (${entry.lineup.length} batters) to My Teams`);
    };
    const loadRoster = (side, idx) => {
        const r = rosters[idx];
        if (!r)
            return;
        setTeams((t) => (Object.assign(Object.assign({}, t), { [side]: { name: r.name, lineup: snapshot(r.lineup) } })));
        setTeamPickSide(null);
        setSetupMsg(`Loaded "${r.name}" into the ${side === "away" ? "visiting" : "home"} lineup`);
    };
    const deleteRoster = (idx) => {
        const next = rosters.filter((_, i) => i !== idx);
        setRosters(next);
        persistRosters(next);
    };
    /* --- drag-to-reorder the batting order on the setup screen --- */
    const ROW_H = 38; // row height incl. gap, px
    const [rowDrag, setRowDrag] = useState(null); // {side, from, dy}
    const rowDragRef = useRef(null);
    const setRowDragBoth = (v) => {
        rowDragRef.current = v;
        setRowDrag(v);
    };
    const reorderLineup = (side, from, to) => setTeams((t) => {
        const lineup = [...t[side].lineup];
        const [moved] = lineup.splice(from, 1);
        lineup.splice(to, 0, moved);
        return Object.assign(Object.assign({}, t), { [side]: Object.assign(Object.assign({}, t[side]), { lineup }) });
    });
    const orderTarget = (d, len) => Math.max(0, Math.min(len - 1, d.from + Math.round(d.dy / ROW_H)));
    const rowHandleDown = (side, idx) => (e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setRowDragBoth({ side, from: idx, startY: e.clientY, dy: 0 });
    };
    const rowHandleMove = (e) => {
        const d = rowDragRef.current;
        if (!d)
            return;
        setRowDragBoth(Object.assign(Object.assign({}, d), { dy: e.clientY - d.startY }));
    };
    const rowHandleUp = () => {
        const d = rowDragRef.current;
        if (!d)
            return;
        setRowDragBoth(null);
        const to = orderTarget(d, teams[d.side].lineup.length);
        if (to !== d.from)
            reorderLineup(d.side, d.from, to);
    };
    // visual shift for rows while one is being dragged
    const rowStyle = (side, i) => {
        const d = rowDrag;
        if (!d || d.side !== side)
            return undefined;
        if (i === d.from)
            return { transform: `translateY(${d.dy}px)`, position: "relative", zIndex: 5, transition: "none" };
        const t = orderTarget(d, teams[side].lineup.length);
        if (d.from < t && i > d.from && i <= t)
            return { transform: `translateY(-${ROW_H}px)` };
        if (t < d.from && i >= t && i < d.from)
            return { transform: `translateY(${ROW_H}px)` };
        return undefined;
    };
    const copyLineups = async () => {
        const code = JSON.stringify({
            dugoutiq: 1,
            away: teams.away,
            home: teams.home,
        });
        try {
            await navigator.clipboard.writeText(code);
            setSetupMsg("Lineups copied — paste them on any device running DugoutIQ");
        }
        catch (_a) {
            setSetupMsg("Couldn't access the clipboard on this device");
        }
    };
    const importLineups = () => {
        try {
            const data = JSON.parse(importText.trim());
            const ok = (t) => t &&
                typeof t.name === "string" &&
                Array.isArray(t.lineup) &&
                t.lineup.length >= MIN_BATTERS &&
                t.lineup.length <= MAX_BATTERS &&
                t.lineup.every((p) => typeof p.name === "string");
            if (!ok(data.away) || !ok(data.home))
                throw new Error("bad shape");
            setTeams({
                away: {
                    name: data.away.name,
                    lineup: data.away.lineup.map((p) => ({ name: p.name, pos: p.pos || "", num: p.num || "" })),
                },
                home: {
                    name: data.home.name,
                    lineup: data.home.lineup.map((p) => ({ name: p.name, pos: p.pos || "", num: p.num || "" })),
                },
            });
            setImportOpen(false);
            setImportText("");
            setSetupMsg("Lineups imported");
        }
        catch (_a) {
            setSetupMsg("That didn't look like a DugoutIQ lineup code — copy it with Export Lineups first");
            setImportOpen(false);
            setImportText("");
        }
    };
    const starterOf = (side) => {
        const p = teams[side].lineup.find((pl) => pl.pos === "P");
        return p && p.name.trim() ? { name: p.name, num: p.num || "" } : { name: "P1", num: "" };
    };
    const playBall = () => {
        setGame({
            id: Date.now(),
            date: gameDate,
            division: division || "",
            inning: 1,
            half: "top",
            balls: 0,
            strikes: 0,
            outs: 0,
            halfPA: 0, // plate appearances in the current half (to detect a home no-bat)
            bases: emptyBases(),
            scoring: [], // {i,h,side,batter,runs,kind} — every run-scoring play
            pb: { away: 0, home: 0 }, // passed balls charged to the fielding team's catcher
            errLog: [], // {side, pos, name, inning} — errors charged to a fielder
            lastOut: null, // {side, b} — the batter who made the most recent out
            card: { away: [], home: [] }, // scorebook cells: {b, inning, res, base 0-4}
            openHit: null,
            openPlay: null, // log index of the last batted-ball PA; a runner drag folds onto this line until the next pitch
            openK: null, // {b} — just-recorded strikeout where a dropped 3rd strike is legal
            openTag: null, // {b, conv, note} — fly out just made; runners may tag up // {b: batter idx, log: PA log index} of the just-recorded hit
            batter: { away: 0, home: 0 },
            stats: {
                away: freshStats(teams.away.lineup.length),
                home: freshStats(teams.home.lineup.length),
            },
            // active in-game lineup (sub-aware) + retired stat lines for the box score
            lineup: {
                away: teams.away.lineup.map((p) => ({ name: p.name, pos: p.pos || "", num: p.num || "", posHist: p.pos ? [p.pos] : [] })),
                home: teams.home.lineup.map((p) => ({ name: p.name, pos: p.pos || "", num: p.num || "", posHist: p.pos ? [p.pos] : [] })),
            },
            subs: { away: [], home: [] },
            orderLocked: { away: false, home: false }, // locks once the order turns over once
            decisions: { w: null, l: null, s: null }, // {side, idx} pitcher of record
            linescore: [{ away: 0, home: null }],
            hits: { away: 0, home: 0 },
            errors: { away: 0, home: 0 },
            pitchers: {
                away: [freshPitcher(starterOf("away").name, starterOf("away").num)],
                home: [freshPitcher(starterOf("home").name, starterOf("home").num)],
            },
            log: [{ type: "ev", i: 1, h: "top", t: "Play ball!", k: "info" }],
            openPA: null,
            over: false,
            lastPlay: "Play ball!",
        });
        setHistory([]);
        setPhase("game");
    };
    /* ---------------- game engine ---------------- */
    const battingSide = game ? (game.half === "top" ? "away" : "home") : "away";
    const fieldingSide = battingSide === "away" ? "home" : "away";
    const pushHistory = () => setHistory((h) => [...h.slice(-39), snapshot(game)]);
    const undo = () => {
        if (!history.length)
            return;
        setGame(history[history.length - 1]);
        setHistory((h) => h.slice(0, -1));
        setBaseMenu(null);
    };
    const mutate = (fn) => {
        pushHistory();
        setGame((g) => {
            const n = snapshot(g);
            fn(n);
            return n;
        });
    };
    // Kinds driven by the batter at the plate. Everything else (balk, steal,
    // wild pitch) belongs to no batter, so the story doesn't name one.
    const BATTER_KINDS = ["1B", "2B", "3B", "HR", "walk", "hbp", "ibb", "error", "fc", "dp", "sacfly", "sacbunt", "groundout", "ci"];
    // `kind` names the play that drove the runs in. Recorded here rather than
    // in closePA because some plays (sac fly) score AFTER the PA is closed.
    const addRuns = (g, n, kind) => {
        if (n <= 0)
            return;
        const row = g.linescore[g.inning - 1];
        row[battingSide] = (row[battingSide] || 0) + n;
        if (!g.scoring)
            g.scoring = [];
        const k = (kind || "play").split(":")[0];
        const pa = g.openPA != null ? g.log[g.openPA] : null;
        const batter = BATTER_KINDS.indexOf(k) >= 0 ? (pa ? pa.batter : g.lastPAB || null) : null;
        g.scoring.push({ i: g.inning, h: g.half, side: battingSide, batter, runs: n, kind: kind || "play" });
    };
    const nextBatter = (g) => {
        const wrapped = (g.batter[battingSide] + 1) % g.lineup[battingSide].length === 0;
        g.batter[battingSide] =
            (g.batter[battingSide] + 1) % g.lineup[battingSide].length;
        if (wrapped && g.orderLocked)
            g.orderLocked[battingSide] = true;
        g.balls = 0;
        g.strikes = 0;
    };
    const endHalf = (g) => {
        g.balls = 0;
        g.strikes = 0;
        g.outs = 0;
        g.bases = emptyBases();
        g.openHit = null;
        g.openPlay = null;
        g.openK = null;
        g.openTag = null;
        if (g.half === "top") {
            g.half = "bottom";
            const row = g.linescore[g.inning - 1];
            if (row.home === null)
                row.home = 0;
        }
        else {
            g.half = "top";
            g.inning += 1;
            if (!g.linescore[g.inning - 1])
                g.linescore.push({ away: 0, home: null });
        }
        g.halfPA = 0;
    };
    const recordOut = (g) => {
        g.outs += 1;
        if (g.outs >= 3) {
            endHalf(g);
            return true;
        }
        return false;
    };
    const currentBatterName = () => game.lineup[battingSide][game.batter[battingSide]].name;
    // current pitcher = last entry in the team's pitcher list
    const curP = (g, side) => g.pitchers[side][g.pitchers[side].length - 1];
    const pLabel = (pp) => (pp && pp.num ? `#${pp.num} ${pp.name}` : (pp && pp.name) || "");
    // who is playing position n (1-9) for the fielding team right now
    const fielderAt = (g, side, n) => {
        const fp = FPOS.find((p) => p.n === Number(n));
        if (!fp)
            return "";
        const pl = ((g.lineup && g.lineup[side]) || []).find((p) => p.pos === fp.l);
        return pl ? pl.name : "";
    };
    // charge an error to the fielding team, attributed to a fielder when known
    const logError = (g, pos) => {
        g.errors[fieldingSide] += 1;
        if (!g.errLog)
            g.errLog = [];
        const n = Number(pos);
        g.errLog.push({ side: fieldingSide, pos: n || null, name: n ? fielderAt(g, fieldingSide, n) : "", inning: g.inning });
        return n ? `E${n}` : "E";
    };
    const curPIdx = (g, side) => g.pitchers[side].length - 1;
    // Runners remember which pitcher put them on base ("rp"), so an inherited
    // runner's run is charged to the pitcher who allowed him, not the reliever.
    const mkRunner = (g, bIdx) => ({ b: bIdx, rp: curPIdx(g, fieldingSide) });
    const staffTotal = (g, side) => g.pitchers[side].reduce((s, p) => s + p.pitches, 0);
    // every pitch is charged to the fielding team's current pitcher
    const addPitch = (g, isStrike = true) => {
        const p = curP(g, fieldingSide);
        p.pitches += 1;
        p.pInn = p.pInn || {};
        p.pInn[g.inning] = (p.pInn[g.inning] || 0) + 1;
        if (isStrike)
            p.strikes = (p.strikes || 0) + 1;
    };
    // charge a stat to the current pitcher of the fielding team
    const chargeP = (g, field, n = 1) => {
        if (n > 0)
            curP(g, fieldingSide)[field] += n;
    };
    // sets the ticker AND appends to the play-by-play log
    // kind: "pitch" (count events, shown dim) | "play" | "info"
    const logPlay = (g, text, kind = "play") => {
        g.lastPlay = text;
        g.log.push({ type: "ev", i: g.inning, h: g.half, t: text, k: kind });
    };
    /* --- plate-appearance grouping ---
       Each batter gets ONE log row: name + pitch sequence + result,
       e.g. "Jake M.  strike-ball-ball-foul-groundout" */
    const ensurePA = (g) => {
        if (g.openPA != null && g.log[g.openPA] && !g.log[g.openPA].result)
            return;
        g.openPlay = null; // a new plate appearance closes the previous play's drag window
        g.log.push({
            type: "pa",
            i: g.inning,
            h: g.half,
            batter: g.lineup[battingSide][g.batter[battingSide]].name,
            seq: [],
            result: null,
        });
        g.openPA = g.log.length - 1;
    };
    const logPitch = (g, label, ticker) => {
        ensurePA(g);
        g.log[g.openPA].seq.push(label);
        g.lastPlay = ticker;
    };
    // fold runner movement that's part of the open hit into that batter's PA row
    const amendOpenHit = (g, extra, ticker) => {
        const entry = g.log[g.openHit.log];
        if (entry && entry.type === "pa")
            entry.result += `; ${extra}`;
        g.lastPlay = ticker;
    };
    // index of the most recent plate-appearance row in the log (-1 if none)
    const lastPAIdx = (g) => {
        for (let i = g.log.length - 1; i >= 0; i--)
            if (g.log[i].type === "pa")
                return i;
        return -1;
    };
    // append something that happened during an at-bat onto that same PA row,
    // so a run/RBI shows on the batter's line instead of a separate event
    const amendPA = (g, idx, extra, ticker) => {
        if (idx >= 0 && g.log[idx] && g.log[idx].type === "pa")
            g.log[idx].result += `; ${extra}`;
        if (ticker)
            g.lastPlay = ticker;
    };
    const closePA = (g, result, ticker) => {
        ensurePA(g);
        g.log[g.openPA].result = result;
        g.lastPAB = g.log[g.openPA].batter; // sac flies score after the PA closes
        g.openPA = null;
        g.lastPlay = ticker;
        const p = curP(g, fieldingSide);
        if (p)
            p.bf = (p.bf || 0) + 1;
        g.halfPA = (g.halfPA || 0) + 1;
    };
    // '' | 'warn' (within 10 of limit) | 'over' (at/past limit)
    const pitchStatus = (cur) => {
        if (!pitchLimit || pitchLimit <= 0)
            return "";
        if (cur >= pitchLimit)
            return "over";
        if (cur >= pitchLimit - 10)
            return "warn";
        return "";
    };
    /* --- baserunning --- */
    // Bases hold runner identity: false = empty, { b: lineupIdx | null } = runner
    // (b is null for manually-placed runners we can't attribute).
    const creditRun = (g, runner) => {
        if (!runner)
            return;
        if (runner.b != null) {
            g.stats[battingSide][runner.b].r += 1;
            cardAdvance(g, runner, 4);
        }
        // charge the run to whoever put this runner on base (inherited runners)
        const staff = g.pitchers[fieldingSide];
        const i = runner.rp != null && staff[runner.rp] ? runner.rp : staff.length - 1;
        staff[i].r += 1;
        if (runner.ue)
            staff[i].uer = (staff[i].uer || 0) + 1;
    };
    /* --- scorebook card tracking --- */
    const cardMark = (g, bIdx, res, base, outNo) => {
        if (!g.card)
            g.card = { away: [], home: [] }; // resumed older save
        // outNo: which out of the inning this was (1-3). Every out-marking call
        // site runs before recordOut, so the pending out is g.outs + 1.
        const out = outNo != null ? outNo : base === 0 ? g.outs + 1 : null;
        if (base === 0)
            g.lastOut = { side: battingSide, b: bIdx }; // usual courtesy runner
        g.card[battingSide].push({ b: bIdx, inning: g.inning, res, base, out });
    };
    // a runner was retired on the bases — number the out in their own cell
    const cardOut = (g, runner, outNo) => {
        if (!g.card || !runner || runner.b == null)
            return;
        const list = g.card[battingSide];
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].b === runner.b && list[i].base < 4) {
                list[i].out = outNo != null ? outNo : g.outs + 1;
                return;
            }
        }
    };
    // a runner moved up: update how far their scorebook diamond is drawn
    const cardAdvance = (g, runner, base) => {
        if (!g.card || !runner || runner.b == null)
            return;
        const list = g.card[battingSide];
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].b === runner.b && list[i].base < 4) {
                if (base > list[i].base)
                    list[i].base = base;
                return;
            }
        }
    };
    // All runners advance n bases (station-to-station); batter (by lineup index)
    // takes base n. Returns runs scored.
    const advanceAll = (g, n, batterIdx) => {
        const order = [
            ["third", 3],
            ["second", 2],
            ["first", 1],
        ];
        let runs = 0;
        const next = emptyBases();
        const slot = (i) => (i === 1 ? "first" : i === 2 ? "second" : "third");
        for (const [base, pos] of order) {
            const runner = g.bases[base];
            if (!runner)
                continue;
            const target = pos + n;
            if (target >= 4) {
                runs += 1;
                creditRun(g, runner);
            }
            else {
                next[slot(target)] = runner;
                cardAdvance(g, runner, target);
            }
        }
        if (batterIdx != null) {
            if (n >= 4) {
                runs += 1;
                creditRun(g, mkRunner(g, batterIdx));
            }
            else
                next[slot(n)] = mkRunner(g, batterIdx);
        }
        g.bases = next;
        return runs;
    };
    // Forced advancement only (walk, HBP, reach on error): batter takes 1st,
    // each forced runner moves up; a runner forced from 3rd scores.
    const forceAdvance = (g, batterIdx) => {
        let runs = 0;
        if (g.bases.first) {
            if (g.bases.second) {
                if (g.bases.third) {
                    runs += 1;
                    creditRun(g, g.bases.third);
                }
                cardAdvance(g, g.bases.second, 3);
                g.bases.third = g.bases.second;
            }
            cardAdvance(g, g.bases.first, 2);
            g.bases.second = g.bases.first;
        }
        g.bases.first = mkRunner(g, batterIdx);
        return runs;
    };
    // Groundout advancement: the batter is OUT (unlike forceAdvance, which puts
    // him on first). Forced runners still have to move up — a runner is forced
    // only when every base behind him is occupied. So a runner on first with the
    // batter grounding out is forced to second; a runner on second with first
    // base empty is NOT forced and holds. A forced runner from third scores.
    const groundoutAdvance = (g) => {
        const b = g.bases;
        let runs = 0;
        if (b.first) {
            if (b.second) {
                if (b.third) {
                    runs += 1;
                    creditRun(g, b.third);
                }
                cardAdvance(g, b.second, 3);
                b.third = b.second;
            }
            cardAdvance(g, b.first, 2);
            b.second = b.first;
        }
        b.first = false; // batter was retired
        return runs;
    };
    // Fielder's choice advancement. The runner at `outBase` is retired; every
    // OTHER forced runner moves up one base. A runner is forced when every base
    // behind them is occupied (the batter always forces 1st), so a 6-4 with
    // runners on 1st and 2nd leaves 1st and 3rd. Unforced runners hold — tap
    // the base to move them.
    const fcAdvance = (g, outBase, batterIdx) => {
        const b = g.bases;
        const forced = {
            first: !!b.first,
            second: !!b.first && !!b.second,
            third: !!b.first && !!b.second && !!b.third,
        };
        let runs = 0;
        const next = emptyBases();
        // deepest runner first so an advancing runner never clobbers a held one
        if (b.third && outBase !== "third") {
            if (forced.third) {
                runs += 1;
                creditRun(g, b.third);
            }
            else
                next.third = b.third;
        }
        if (b.second && outBase !== "second") {
            if (forced.second) {
                cardAdvance(g, b.second, 3);
                next.third = b.second;
            }
            else
                next.second = b.second;
        }
        if (b.first && outBase !== "first") {
            cardAdvance(g, b.first, 2);
            next.second = b.first;
        }
        next.first = mkRunner(g, batterIdx);
        g.bases = next;
        return runs;
    };
    /* --- count buttons --- */
    const tapBall = () => mutate((g) => {
        addPitch(g, false);
        g.openK = null;
        g.openHit = null;
        g.openTag = null;
        if (g.balls === 3) {
            const st = g.stats[battingSide][g.batter[battingSide]];
            st.bb += 1;
            chargeP(g, "bb");
            cardMark(g, g.batter[battingSide], "BB", 1);
            const runs = forceAdvance(g, g.batter[battingSide]);
            addRuns(g, runs, "walk");
            st.rbi += runs; // bases-loaded walk
            closePA(g, runs ? "walk, run forced in" : "walk", `${currentBatterName()} walks${runs ? ", run forced in" : ""}`);
            nextBatter(g);
        }
        else {
            g.balls += 1;
            logPitch(g, "ball", `Ball ${g.balls}`);
        }
    });
    const tapStrike = (kind) => mutate((g) => {
        addPitch(g);
        g.openK = null;
        g.openHit = null;
        g.openTag = null;
        if (g.strikes === 2) {
            const st = g.stats[battingSide][g.batter[battingSide]];
            st.ab += 1;
            st.k += 1;
            chargeP(g, "k");
            chargeP(g, "outs");
            // ꓘ (backwards K) for a called third strike, K for swinging
            const looking = kind === "looking";
            cardMark(g, g.batter[battingSide], looking ? "\uA4D8" : "K", 0);
            const d3kLegal = !g.bases.first || g.outs === 2;
            const kBatter = g.batter[battingSide];
            const verb = looking ? "strikes out looking" : kind === "swinging" ? "strikes out swinging" : "strikes out";
            closePA(g, looking ? "strikeout looking" : kind === "swinging" ? "strikeout swinging" : "strikeout", `${currentBatterName()} ${verb}`);
            const flipped = recordOut(g);
            if (!flipped)
                nextBatter(g);
            else
                advanceOrder(g);
            if (d3kLegal)
                g.openK = { b: kBatter };
        }
        else {
            g.strikes += 1;
            const lbl = kind === "looking" ? "called strike" : kind === "swinging" ? "swinging strike" : "strike";
            logPitch(g, "strike", `Strike ${g.strikes}${kind === "looking" ? " (looking)" : kind === "swinging" ? " (swinging)" : ""}`);
        }
    });
    const tapHBP = () => mutate((g) => {
        addPitch(g, false);
        g.openK = null;
        g.openHit = null;
        g.openTag = null;
        const bIdx = g.batter[battingSide];
        const st = g.stats[battingSide][bIdx];
        st.bb += 1; // HBP counted with walks in the BB column
        st.hbp = (st.hbp || 0) + 1;
        chargeP(g, "bb");
        cardMark(g, bIdx, "HP", 1);
        const runs = forceAdvance(g, bIdx);
        addRuns(g, runs, "hbp");
        st.rbi += runs;
        closePA(g, runs ? "hit by pitch, run forced in" : "hit by pitch", `${currentBatterName()} hit by pitch${runs ? ", run forced in" : ""}`);
        nextBatter(g);
    });
    const tapFoul = () => mutate((g) => {
        addPitch(g);
        g.openK = null;
        g.openHit = null;
        g.openTag = null;
        if (g.strikes < 2)
            g.strikes += 1;
        logPitch(g, "foul", "Foul ball");
    });
    // Foul tip: caught by the catcher, so it's ALWAYS a strike — including
    // strike three (and no dropped-3rd-strike, since the tip was caught).
    const tapFoulTip = () => mutate((g) => {
        addPitch(g);
        g.openK = null;
        g.openHit = null;
        g.openTag = null;
        if (g.strikes === 2) {
            const st = g.stats[battingSide][g.batter[battingSide]];
            st.ab += 1;
            st.k += 1;
            chargeP(g, "k");
            chargeP(g, "outs");
            cardMark(g, g.batter[battingSide], "K", 0);
            closePA(g, "strikeout", `${currentBatterName()} strikes out on a foul tip`);
            const flipped = recordOut(g);
            if (!flipped)
                nextBatter(g);
            else
                advanceOrder(g);
        }
        else {
            g.strikes += 1;
            logPitch(g, "foul tip", `Foul tip — strike ${g.strikes}`);
        }
    });
    // advance batting order without resetting the (already reset) count
    const advanceOrder = (g) => {
        const wrapped = (g.batter[battingSide] + 1) % g.lineup[battingSide].length === 0;
        g.batter[battingSide] =
            (g.batter[battingSide] + 1) % g.lineup[battingSide].length;
        if (wrapped && g.orderLocked)
            g.orderLocked[battingSide] = true;
    };
    /* --- play outcomes (one tap, auto baserunning) --- */
    // loc: fielder position number (1-9) where the ball was hit, or "" if skipped.
    // The scorebook cell reads "1B8" — a single to center.
    const playHit = (basesTaken, label, loc) => mutate((g) => {
        addPitch(g);
        g.openK = null;
        const bIdxForHit = g.batter[battingSide];
        const st = g.stats[battingSide][g.batter[battingSide]];
        const name = currentBatterName();
        st.ab += 1;
        st.h += 1;
        if (basesTaken === 2)
            st.x2b = (st.x2b || 0) + 1;
        else if (basesTaken === 3)
            st.x3b = (st.x3b || 0) + 1;
        else if (basesTaken >= 4)
            st.xhr = (st.xhr || 0) + 1;
        g.hits[battingSide] += 1;
        chargeP(g, "h");
        if (basesTaken >= 4)
            chargeP(g, "hr");
        const hitTag = ["1B", "2B", "3B", "HR"][Math.min(basesTaken, 4) - 1];
        const where = posLabel(loc);
        cardMark(g, bIdxForHit, hitTag + (loc ? String(loc) : ""), Math.min(basesTaken, 4));
        const runs = advanceAll(g, basesTaken, g.batter[battingSide]);
        addRuns(g, runs, hitTag + (loc ? ":" + loc : ""));
        st.rbi += runs;
        const desc = `${label}${where ? ` to ${where}` : ""}${runs ? ` — ${runs} score${runs > 1 ? "" : "s"}` : ""}`;
        closePA(g, desc, `${name}: ${desc}`);
        g.openHit = { b: bIdxForHit, log: g.log.length - 1 };
        if (g.bases.first || g.bases.second || g.bases.third)
            g.openPlay = g.log.length - 1;
        nextBatter(g);
    });
    const playError = (pos) => mutate((g) => {
        addPitch(g);
        g.openK = null;
        g.openHit = null;
        g.openTag = null;
        const st = g.stats[battingSide][g.batter[battingSide]];
        const name = currentBatterName();
        st.ab += 1;
        const enote = logError(g, pos);
        cardMark(g, g.batter[battingSide], enote, 1);
        // a run forced home by the error is unearned — flag the runner so the
        // charge lands on whichever pitcher put him on base
        if (g.bases.first && g.bases.second && g.bases.third)
            g.bases.third.ue = true;
        const runs = forceAdvance(g, g.batter[battingSide]);
        addRuns(g, runs, "error"); // unearned, no RBI
        if (g.bases.first)
            g.bases.first.ue = true; // reached on error -> unearned if he scores
        closePA(g, `reached on ${enote}${runs ? ", run scores" : ""}`, `${name} reaches on error (${enote})${runs ? ", run scores" : ""}`);
        nextBatter(g);
    });
    const playOut = (label, isK, fnote) => mutate((g) => {
        addPitch(g);
        g.openK = null;
        g.openHit = null;
        g.openTag = null;
        const bIdx = g.batter[battingSide];
        const st = g.stats[battingSide][bIdx];
        const name = currentBatterName();
        st.ab += 1;
        if (isK)
            st.k += 1;
        chargeP(g, "outs");
        if (isK)
            chargeP(g, "k");
        const note = (fnote && fnote.length)
            ? fnote
            : isK
                ? "K"
                : label === "groundout"
                    ? "GO"
                    : label === "popup"
                        ? "P"
                        : label === "infieldfly"
                            ? "IF"
                            : label === "lineout"
                                ? "L"
                                : "FO";
        cardMark(g, bIdx, note, 0);
        const d3kLegal = isK && (!g.bases.first || g.outs === 2);
        const flyType = label === "flyout" || label === "popup" || label === "lineout" || label === "infieldfly";
        const hadRunners = !!(g.bases.first || g.bases.second || g.bases.third);
        // On a groundout the forced runners must advance. Capture whether the
        // runner on third was FORCED (1st and 2nd also occupied) before we move
        // anyone — a forced run scores automatically; an unforced runner on
        // third is a judgment call left to the tag prompt below.
        const groundThirdForced = label === "groundout" && !!(g.bases.first && g.bases.second && g.bases.third);
        const groundThirdUnforced = label === "groundout" && !!g.bases.third && !groundThirdForced;
        const labelText = label === "infieldfly" ? "infield fly" : label;
        closePA(g, `${labelText}${fnote ? " " + fnote : ""}`, `${name}: ${labelText}${fnote ? " " + fnote : ""}`);
        const flipped = recordOut(g);
        if (label === "groundout" && !flipped) {
            const runs = groundoutAdvance(g); // forced runners move; forced run from 3rd scores
            if (runs)
                addRuns(g, runs, "groundout");
        }
        if (!flipped)
            nextBatter(g);
        else
            advanceOrder(g);
        if (d3kLegal)
            g.openK = { b: bIdx };
        if (flyType && hadRunners && !flipped)
            g.openTag = { b: bIdx, conv: false, note, log: lastPAIdx(g) };
        // only prompt for a manual RBI when the runner on 3rd was NOT forced —
        // a forced run already scored above
        if (groundThirdUnforced && g.bases.third && !flipped)
            g.openTag = { b: bIdx, kind: "ground", note, log: lastPAIdx(g) };
        // If runners are still on and the inning continues, a manual drag right
        // after this out folds onto this out's line ("groundout 3; X takes 3rd")
        // rather than spawning a separate play-by-play event.
        if (!flipped && (g.bases.first || g.bases.second || g.bases.third))
            g.openPlay = lastPAIdx(g);
    });
    // Fielder picker: choose fielder(s) -> 6-3, F8, 6-4-3, etc. Used by batted outs, DP and FC.
    const isAirOut = (lb) => lb === "flyout" || lb === "popup" || lb === "lineout" || lb === "infieldfly";
    const openFieldPick = (label, isK) => { setFieldSeq([]); setFieldPick({ label, isK }); };
    const openFieldSeq = (title, instr, onRecord) => { setFieldSeq([]); setFieldPick({ label: "seq", isK: false, title, instr, onRecord }); };
    // one tap, records immediately — used for charging an error to a fielder
    const openFieldOne = (title, instr, onRecord) => { setFieldSeq([]); setFieldPick({ label: "one", isK: false, single: true, title, instr, onRecord }); };
    const cancelFieldPick = () => { setFieldPick(null); setFieldSeq([]); };
    const finishFieldPick = (note) => {
        const fp = fieldPick;
        if (!fp)
            return;
        if (fp.onRecord)
            fp.onRecord(note);
        else
            playOut(fp.label, fp.isK, note);
        setFieldPick(null);
        setFieldSeq([]);
    };
    const pickField = (n) => {
        if (!fieldPick)
            return;
        if (fieldPick.single)
            finishFieldPick(String(n)); // one tap -> record the position number
        else if (isAirOut(fieldPick.label))
            finishFieldPick(fieldNote(fieldPick.label, [n])); // single fielder -> record now
        else
            setFieldSeq((seq) => [...seq, n]);
    };
    const recordFieldOut = () => { if (fieldPick) finishFieldPick(fieldNote(fieldPick.label, fieldSeq)); };
    const skipFieldOut = () => { if (fieldPick) finishFieldPick(""); };
    // Fielder's choice: batter reaches, the selected runner is forced out.
    // Remaining runners + batter advance on the force.
    const playFC = (outBase, fnote) => {
        mutate((g) => {
            addPitch(g);
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            const bIdx = g.batter[battingSide];
            const st = g.stats[battingSide][bIdx];
            const name = currentBatterName();
            st.ab += 1;
            chargeP(g, "outs");
            cardOut(g, g.bases[outBase], g.outs + 1); // the forced runner's own cell
            cardMark(g, bIdx, fnote || "FC", 1);
            closePA(g, `fielder's choice${fnote ? " " + fnote : ""} — runner from ${baseLabel(outBase)} forced out`, `${name}: fielder's choice${fnote ? " " + fnote : ""} — runner from ${baseLabel(outBase)} forced out`);
            const flipped = recordOut(g);
            if (!flipped) {
                const runs = fcAdvance(g, outBase, bIdx);
                addRuns(g, runs, "fc");
                if (runs)
                    amendPA(g, lastPAIdx(g), runs === 1 ? "run forced in" : `${runs} runs forced in`, "Run forced in on the play");
                nextBatter(g);
            }
            else
                advanceOrder(g);
        });
        setFcMenu(false);
    };
    // FC variant: the OUT is the batter at 1st; everyone else moves up
    // Fielder's choice, no out recorded — the defense went after a runner and
    // everyone was safe. Batter is charged an at-bat, no hit, no out.
    const playFCAllSafe = (fnote) => {
        mutate((g) => {
            addPitch(g);
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            const bIdx = g.batter[battingSide];
            const st = g.stats[battingSide][bIdx];
            const name = currentBatterName();
            st.ab += 1;
            cardMark(g, bIdx, fnote || "FC", 1);
            const runs = fcAdvance(g, null, bIdx); // nobody retired; forced runners move up
            addRuns(g, runs, "fc");
            st.rbi += runs;
            const tail = `${fnote ? " " + fnote : ""} — all safe${runs ? ` — ${runs} score${runs > 1 ? "" : "s"}` : ""}`;
            closePA(g, `fielder's choice${tail}`, `${name}: fielder's choice${tail}`);
            nextBatter(g);
        });
        setFcMenu(false);
    };
    const playFCBatterOut = (fnote) => {
        mutate((g) => {
            addPitch(g);
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            const bIdx = g.batter[battingSide];
            const st = g.stats[battingSide][bIdx];
            const name = currentBatterName();
            st.ab += 1;
            chargeP(g, "outs");
            cardMark(g, bIdx, fnote || "GO", 0);
            const willPlay = g.outs < 2; // runners only advance if this isn't the 3rd out
            closePA(g, `out at 1st${fnote ? " " + fnote : ""}${willPlay ? " — runners advance" : ""}`, `${name}: out at 1st${fnote ? " " + fnote : ""}${willPlay ? ", runners advance" : ""}`);
            const flipped = recordOut(g);
            if (!flipped) {
                const runs = advanceAll(g, 1, null); // station-to-station, no batter
                addRuns(g, runs, "groundout");
                st.rbi += runs; // productive out — RBI credited
                if (runs)
                    amendPA(g, lastPAIdx(g), runs === 1 ? "run scores — RBI" : `${runs} score — RBI`, "Run scores on the play");
                nextBatter(g);
            }
            else
                advanceOrder(g);
        });
        setFcMenu(false);
    };
    // Sacrifice bunt / fly: out recorded but NO at-bat charged
    // Sacrifice + fielding error. The batter is credited a sacrifice (no
    // at-bat) and reaches safely because of the error instead of being out.
    //
    // Two things happen and they're scored differently:
    //  1. The SACRIFICE: a runner on 3rd breaks and scores on the bunt itself
    //     (a squeeze). That run is EARNED and the batter gets the RBI — the
    //     error didn't cause it.
    //  2. The ERROR: every other runner takes one extra base, the batter reaches
    //     first, and any run that scores ONLY because of the error is unearned.
    const playSacError = (kind, pos) => {
        mutate((g) => {
            addPitch(g);
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            const bIdx = g.batter[battingSide];
            const st = g.stats[battingSide][bIdx];
            const name = currentBatterName();
            st.sac = (st.sac || 0) + 1; // sacrifice credited, no at-bat
            const enote = logError(g, pos);
            cardMark(g, bIdx, (kind === "fly" ? "SF" : "SAC") + " " + enote, 1);
            let sacRuns = 0; // scored on the sacrifice (earned, RBI)
            let errRuns = 0; // scored on the error (unearned, no RBI)
            // 1) the squeeze: runner on 3rd scores on the bunt
            if (g.bases.third) {
                creditRun(g, g.bases.third);
                g.bases.third = false;
                sacRuns += 1;
            }
            // 2) the error advances everyone else one extra base beyond their
            //    sacrifice advance (so 1st→3rd, 2nd→home). Flag them unearned;
            //    a runner from 2nd who scores here did so on the error.
            ["first", "second"].forEach((b) => { if (g.bases[b]) g.bases[b].ue = true; });
            errRuns = advanceAll(g, 2, null); // remaining runners up two bases
            g.bases.first = mkRunner(g, bIdx); // batter safe at first on the error
            if (g.bases.first) g.bases.first.ue = true; // reached on the miscue
            if (sacRuns) {
                addRuns(g, sacRuns, "sacbunt"); // earned, credits the batter
                st.rbi += sacRuns;
            }
            if (errRuns)
                addRuns(g, errRuns, "error"); // unearned, no RBI
            const totalRuns = sacRuns + errRuns;
            const tail = `${kind === "fly" ? "sacrifice fly" : "sacrifice bunt"}${sacRuns ? ", run scores" : ""} — ${enote}${errRuns ? `, ${errRuns} more score${errRuns > 1 ? "" : "s"}` : ""}, batter safe`;
            closePA(g, `sac ${kind === "fly" ? "fly" : "bunt"} — ${enote}${totalRuns ? `, ${totalRuns} score${totalRuns > 1 ? "" : "s"}` : ""}, batter safe`, `${name}: ${tail}`);
            nextBatter(g);
        });
        setSacMenu(false);
    };
    const playSac = (kind) => {
        mutate((g) => {
            addPitch(g);
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            const bIdx = g.batter[battingSide];
            const st = g.stats[battingSide][bIdx];
            const name = currentBatterName();
            st.sac = (st.sac || 0) + 1;
            chargeP(g, "outs");
            const willPlay = g.outs < 2;
            const flyScores = kind === "fly" && willPlay && g.bases.third;
            cardMark(g, bIdx, kind === "fly" ? "SF" : "SAC", 0);
            closePA(g, kind === "fly"
                ? `sac fly${flyScores ? " — run scores" : ""}`
                : `sac bunt${willPlay ? " — runners advance" : ""}`, kind === "fly"
                ? `${name}: sacrifice fly${flyScores ? " — run scores" : ""}`
                : `${name}: sacrifice bunt`);
            const flipped = recordOut(g);
            if (!flipped) {
                if (kind === "fly") {
                    if (g.bases.third) {
                        creditRun(g, g.bases.third);
                        g.bases.third = false;
                        addRuns(g, 1, "sacfly");
                        st.rbi += 1;
                    }
                }
                else {
                    const runs = advanceAll(g, 1, null);
                    addRuns(g, runs, "sacbunt");
                    st.rbi += runs;
                }
                nextBatter(g);
            }
            else
                advanceOrder(g);
        });
        setSacMenu(false);
    };
    // Dropped 3rd strike: rewind to the pre-K snapshot and replay it as
    // "strikeout, batter safe at 1st". K still counts for pitcher & batter; the out doesn't.
    const d3kReach = () => {
        if (!history.length || !game || !game.openK)
            return;
        const g = snapshot(history[history.length - 1]); // state before the 3rd strike
        const side = g.half === "top" ? "away" : "home";
        const fSide = side === "away" ? "home" : "away";
        const bIdx = g.batter[side];
        const name = g.lineup[side][bIdx].name;
        const pit = g.pitchers[fSide][g.pitchers[fSide].length - 1];
        pit.pitches += 1; // the 3rd strike
        pit.pInn = pit.pInn || {};
        pit.pInn[g.inning] = (pit.pInn[g.inning] || 0) + 1;
        pit.k += 1;
        const st = g.stats[side][bIdx];
        st.ab += 1;
        st.k += 1;
        if (!g.card)
            g.card = { away: [], home: [] };
        g.card[side].push({ b: bIdx, inning: g.inning, res: "K", base: 1 });
        // close the plate appearance in the log
        if (g.openPA == null || !g.log[g.openPA] || g.log[g.openPA].result) {
            g.log.push({ type: "pa", i: g.inning, h: g.half, batter: name, seq: [], result: null });
            g.openPA = g.log.length - 1;
        }
        g.log[g.openPA].result = "strikeout — safe at 1st (dropped 3rd strike)";
        g.openPA = null;
        g.lastPlay = `${name} strikes out but reaches 1st — dropped 3rd strike`;
        // batter takes 1st; with 2 outs and 1st occupied, runners are forced up
        if (!g.bases.first) {
            g.bases.first = mkRunner(g, bIdx);
        }
        else {
            if (g.bases.second) {
                if (g.bases.third) {
                    const sc = g.bases.third;
                    if (sc && sc.b != null)
                        g.stats[side][sc.b].r += 1;
                    const row = g.linescore[g.inning - 1];
                    row[side] = (row[side] || 0) + 1;
                    pit.r += 1;
                    const list = g.card[side];
                    for (let i = list.length - 1; i >= 0; i--) {
                        if (sc && list[i].b === sc.b && list[i].base < 4) {
                            list[i].base = 4;
                            break;
                        }
                    }
                }
                g.bases.third = g.bases.second;
            }
            g.bases.second = g.bases.first;
            g.bases.first = mkRunner(g, bIdx);
        }
        g.balls = 0;
        g.strikes = 0;
        g.batter[side] = (bIdx + 1) % g.lineup[side].length;
        g.openK = null;
        g.openHit = null;
        setGame(g); // history untouched: Undo returns to the pre-K state
    };
    // Intentional walk — no pitches thrown (modern rule); batter to 1st.
    const tapIBB = () => mutate((g) => {
        g.openK = null;
        g.openHit = null;
        g.openTag = null;
        g.openTag = null;
        const bIdx = g.batter[battingSide];
        const st = g.stats[battingSide][bIdx];
        st.bb += 1;
        chargeP(g, "bb");
        cardMark(g, bIdx, "IBB", 1);
        const runs = forceAdvance(g, bIdx);
        addRuns(g, runs, "ibb");
        st.rbi += runs;
        closePA(g, runs ? "intentional walk, run forced in" : "intentional walk", `${currentBatterName()} — intentional walk${runs ? ", run forced in" : ""}`);
        nextBatter(g);
    });
    // Double play — batter is out plus one selected runner (two outs on the play).
    // Obstruction (OBR 6.01(h)) — a fielder without the ball impedes a runner,
    // who is awarded the base he would have reached. NOT an error: nothing is
    // charged to the defense, and a run that scores this way is earned.
    const obstruction = (base) => {
        const who = runnerLabel(base);
        if (base === "third") {
            mutate((g) => {
                creditRun(g, g.bases.third);
                g.bases.third = false;
                addRuns(g, 1, "obstruction");
                logPlay(g, `Obstruction \u2014 ${who} awarded home`);
            });
            setBaseMenu(null);
            return;
        }
        const target = base === "first" ? "second" : "third";
        if (game.bases[target]) {
            mutate((g) => logPlay(g, `${baseLabel(target)} is occupied \u2014 award blocked`, "info"));
            setBaseMenu(null);
            return;
        }
        mutate((g) => {
            g.bases[target] = g.bases[base];
            g.bases[base] = false;
            cardAdvance(g, g.bases[target], target === "second" ? 2 : 3);
            logPlay(g, `Obstruction \u2014 ${who} awarded ${baseLabel(target)}`);
        });
        setBaseMenu(null);
    };
    // Courtesy runner (catcher/pitcher, to speed the game along). The runner is
    // NOT in the batting order — he inherits the base but every stat stays with
    // the player he ran for, so the run and the scorebook diamond land on the
    // catcher's line, and the pitcher who allowed the runner still owns the run.
    const setCourtesyRunner = (base, player) => {
        mutate((g) => {
            const r = g.bases[base];
            if (!r)
                return;
            const forName = r.b != null && g.lineup[battingSide][r.b] ? g.lineup[battingSide][r.b].name : "runner";
            if (!player) {
                delete r.cr;
                logPlay(g, `Courtesy runner removed at ${baseLabel(base)} — ${forName} back in`, "info");
                return;
            }
            r.cr = { name: player.name, num: player.num || "" };
            logPlay(g, `Courtesy runner: ${player.name} runs for ${forName} at ${baseLabel(base)}`, "info");
        });
        setCrMenu(null);
        setBaseMenu(null);
    };
    // Everyone eligible to run: not the batter, not already on base.
    const crCandidates = () => {
        if (!game)
            return [];
        const onBase = ["first", "second", "third"]
            .map((b) => game.bases[b])
            .filter(Boolean)
            .map((r) => r.b);
        const batting = game.batter[battingSide];
        const lu = game.lineup[battingSide] || [];
        const out = [];
        lu.forEach((p, i) => {
            if (i === batting || onBase.includes(i))
                return;
            out.push({ i, name: p.name, num: p.num || "", last: !!(game.lastOut && game.lastOut.side === battingSide && game.lastOut.b === i) });
        });
        out.sort((a, b) => (b.last ? 1 : 0) - (a.last ? 1 : 0)); // last out first
        return out;
    };
    // Wild pitch / passed ball. One event no matter how many runners move:
    // everyone advances a base, a runner on third scores, no RBI. The pitch
    // itself is counted by the Ball/Strike tap, so nothing is added here.
    const playWildPitch = (kind) => {
        const isWP = kind === "wp";
        mutate((g) => {
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            if (isWP)
                curP(g, fieldingSide).wp = (curP(g, fieldingSide).wp || 0) + 1;
            else
                g.pb[fieldingSide] = (g.pb[fieldingSide] || 0) + 1;
            const runs = advanceAll(g, 1, null); // no batter — he stays at the plate
            addRuns(g, runs, isWP ? "wp" : "pb");
            const label = isWP ? "Wild pitch" : "Passed ball";
            logPlay(g, `${label} — runners advance${runs ? `, ${runs} score${runs > 1 ? "" : "s"}` : ""}`);
        });
        setMoreMenu(false);
    };
    // Catcher's interference — batter is awarded first, NO at-bat charged, and
    // the catcher is charged an error. Forced runners advance; a run forced in
    // is an RBI (OBR 9.04(a)(2)). The batter reached on a defensive miscue, so
    // any run he later scores is unearned.
    const playCatcherInt = () => {
        mutate((g) => {
            addPitch(g);
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            const bIdx = g.batter[battingSide];
            const st = g.stats[battingSide][bIdx];
            const name = currentBatterName();
            g.errors[fieldingSide] += 1; // E2
            cardMark(g, bIdx, "CI", 1);
            const runs = forceAdvance(g, bIdx);
            if (g.bases.first)
                g.bases.first.ue = true;
            addRuns(g, runs, "ci");
            st.rbi += runs;
            closePA(g, `catcher's interference${runs ? " — run forced in" : ""}`, `${name}: catcher's interference (E2) — awarded first${runs ? ", run forced in" : ""}`);
            nextBatter(g);
        });
        setMoreMenu(false);
    };
    // Batter's interference — batter is out, runners return to their bases.
    const playBatterInt = () => {
        mutate((g) => {
            addPitch(g);
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            const bIdx = g.batter[battingSide];
            const st = g.stats[battingSide][bIdx];
            const name = currentBatterName();
            st.ab += 1;
            chargeP(g, "outs");
            cardMark(g, bIdx, "BI", 0);
            closePA(g, "batter's interference — batter is out", `${name}: batter's interference — batter is out, runners return`);
            const flipped = recordOut(g);
            if (!flipped)
                nextBatter(g);
            else
                advanceOrder(g);
        });
        setMoreMenu(false);
    };
    // Triple play — batter plus two runners retired on one play. All three outs
    // happen on the play, so the half ends and nobody can score. Out order:
    // on a ground ball the lead forced runner is retired first and the batter
    // last (5-4-3); on a caught liner the catch is the first out.
    const playTriplePlay = (runnerBases, fnote, kind = "ground") => {
        const caught = kind === "caught";
        mutate((g) => {
            addPitch(g);
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            const bIdx = g.batter[battingSide];
            const st = g.stats[battingSide][bIdx];
            const name = currentBatterName();
            st.ab += 1;
            const o0 = g.outs; // always 0 — the button requires a clean inning
            const order = ["third", "second", "first"].filter((b) => runnerBases.indexOf(b) >= 0);
            if (caught) {
                cardMark(g, bIdx, fnote || "TP", 0, o0 + 1); // the catch
                order.forEach((b, i) => cardOut(g, g.bases[b], o0 + 2 + i));
            }
            else {
                order.forEach((b, i) => cardOut(g, g.bases[b], o0 + 1 + i));
                cardMark(g, bIdx, fnote || "TP", 0, o0 + 1 + order.length);
            }
            chargeP(g, "outs", 3);
            const verb = caught ? "lines into a triple play" : "grounds into a triple play";
            closePA(g, `triple play${fnote ? " " + fnote : ""}`, `${name}: ${verb}${fnote ? " " + fnote : ""}`);
            let flipped = false;
            for (let i = 0; i < 3 && !flipped; i++)
                flipped = recordOut(g);
            if (!flipped)
                nextBatter(g); // shouldn't happen, but never strand the order
            else
                advanceOrder(g);
        });
        setTpMenu(false);
        setTpSel([]);
    };
    // kind: "ground" — ball on the ground, batter forced the lead runner (6-4-3).
    //       "caught" — liner or fly caught, a runner doubled off. Nobody is
    //                  forced, so the other runners hold, and the batter is the
    //                  FIRST out (the catch) with the runner retired after.
    const playDoublePlay = (runnerBase, fnote, kind = "ground") => {
        const caught = kind === "caught";
        mutate((g) => {
            addPitch(g);
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            const bIdx = g.batter[battingSide];
            const st = g.stats[battingSide][bIdx];
            const name = currentBatterName();
            st.ab += 1;
            const outsBefore = g.outs;
            if (caught) {
                cardMark(g, bIdx, fnote || "DP", 0, outsBefore + 1); // the catch
                cardOut(g, g.bases[runnerBase], outsBefore + 2); // doubled off
            }
            else {
                // On a 6-4-3 the lead runner is retired first, then the batter.
                cardOut(g, g.bases[runnerBase], outsBefore + 1);
                cardMark(g, bIdx, fnote || "DP", 0, outsBefore + 2);
            }
            // snapshot the runners before the play resolves
            const had = {
                first: g.bases.first,
                second: g.bases.second,
                third: g.bases.third,
            };
            // two outs on the play: the batter, plus the selected runner
            chargeP(g, "outs"); // batter
            const verb = caught ? "lines into a double play" : "grounds into a double play";
            closePA(g, `double play${fnote ? " " + fnote : ""}`, `${name}: ${verb}${fnote ? " " + fnote : ""}`);
            recordOut(g); // batter out (DP offered only with < 2 outs)
            chargeP(g, "outs"); // runner
            const flipped = recordOut(g);
            if (!flipped) {
                // Rebuild the bases. The runner who was put out is gone; every OTHER
                // forced runner still advances one base (a forced runner from third scores).
                const nb = { first: false, second: false, third: false };
                let runs = 0;
                if (caught) {
                    // ball was caught — nobody was forced, survivors stay put
                    ["first", "second", "third"].forEach((b) => {
                        if (had[b] && runnerBase !== b)
                            nb[b] = had[b];
                    });
                }
                else {
                    // runner from first is always forced (the batter put the ball in play)
                    if (had.first && runnerBase !== "first") {
                        cardAdvance(g, had.first, 2);
                        nb.second = had.first;
                    }
                    // runner from second is forced only if first was occupied
                    if (had.second && runnerBase !== "second") {
                        if (had.first) {
                            cardAdvance(g, had.second, 3);
                            nb.third = had.second;
                        }
                        else {
                            nb.second = had.second; // not forced — holds at second
                        }
                    }
                    // runner from third is forced home only if first AND second were occupied
                    if (had.third && runnerBase !== "third") {
                        if (had.first && had.second) {
                            runs += 1;
                            creditRun(g, had.third); // forced in
                        }
                        else {
                            nb.third = had.third; // not forced — holds at third
                        }
                    }
                }
                g.bases = nb;
                if (runs) {
                    addRuns(g, runs, "dp");
                }
                nextBatter(g);
            }
            else {
                advanceOrder(g);
            }
        });
        setDpMenu(false);
    };
    // Tag-up: runner from 3rd scores -> the fly out becomes a sacrifice fly.
    const groundScore = () => {
        mutate((g) => {
            if (!g.openTag || g.openTag.kind !== "ground" || !g.bases.third)
                return;
            const tlog = g.openTag.log;
            const r3 = g.bases.third;
            g.bases.third = false;
            creditRun(g, r3);
            addRuns(g, 1, "groundout");
            g.stats[battingSide][g.openTag.b].rbi += 1; // RBI groundout — at-bat stands
            g.openTag = null;
            amendPA(g, tlog, "run scores — RBI", "Run scores on the groundout — RBI");
        });
    };
    const tagUpScore = () => {
        mutate((g) => {
            if (!g.openTag || !g.bases.third)
                return;
            const r3 = g.bases.third;
            g.bases.third = false;
            creditRun(g, r3);
            addRuns(g, 1, "sacfly");
            const b = g.openTag.b;
            const st = g.stats[battingSide][b];
            st.rbi += 1;
            if (!g.openTag.conv) {
                st.ab -= 1; // sac fly: at-bat is removed
                if (g.card) {
                    const list = g.card[battingSide];
                    for (let i = list.length - 1; i >= 0; i--) {
                        if (list[i].b === b && list[i].base === 0) {
                            list[i].res = "SF";
                            break;
                        }
                    }
                }
                g.openTag.conv = true;
            }
            amendPA(g, g.openTag.log, "sac fly — run scores", "Sacrifice fly — run scores on the tag");
        });
    };
    // Tag-up with no run: 2nd->3rd or 1st->2nd on the catch.
    const tagUpAdvance = (from) => {
        mutate((g) => {
            if (!g.openTag)
                return;
            if (from === "second" && !g.bases.third && g.bases.second) {
                g.bases.third = g.bases.second;
                g.bases.second = false;
                cardAdvance(g, g.bases.third, 3);
                amendPA(g, g.openTag.log, "runner tags to 3rd", "Runner tags, 2nd to 3rd");
            }
            else if (from === "first" && !g.bases.second && g.bases.first) {
                g.bases.second = g.bases.first;
                g.bases.first = false;
                cardAdvance(g, g.bases.second, 2);
                amendPA(g, g.openTag.log, "runner tags to 2nd", "Runner tags, 1st to 2nd");
            }
        });
    };
    // Balk — every runner advances one base; no pitch is charged.
    const playBalk = () => {
        mutate((g) => {
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            g.openTag = null;
            const runs = advanceAll(g, 1, null);
            addRuns(g, runs, "balk");
            logPlay(g, `Balk — runners advance${runs ? ", run scores" : ""}`, "info");
        });
        setPitchMenuSide(null);
    };
    // Substitution / pinch hitter / pinch runner: a new player takes over a
    // batting-order slot. The original keeps their stats (retired to the box
    // score); the incoming player starts a fresh line in the same slot.
    const substitute = (side, slot, newName, newPos, newNum) => {
        const nm = (newName || "").trim();
        if (!nm)
            return;
        mutate((g) => {
            if (!g.subs)
                g.subs = { away: [], home: [] };
            const cur = g.lineup[side][slot];
            const st = g.stats[side][slot];
            g.subs[side].push({
                slot,
                name: cur.name,
                pos: cur.pos,
                ab: st.ab,
                h: st.h,
                r: st.r,
                rbi: st.rbi,
                bb: st.bb,
                k: st.k,
            });
            g.stats[side][slot] = { ab: 0, h: 0, r: 0, rbi: 0, bb: 0, k: 0 };
            const sp = ((newPos || cur.pos) || "").trim();
            g.lineup[side][slot] = { name: nm, pos: sp, num: (newNum || "").trim(), posHist: sp ? [sp] : [] };
            g.lastPlay = `Sub: ${nm} in for ${cur.name}`;
        });
        setSubMenu(false);
        setSubSlot(null);
        setSubName("");
        setSubPos("");
        setSubNum("");
    };
    // Correct a name or position in place — NOT a substitution.
    // Stats stay exactly where they are; nothing is retired.
    const editLineup = (side, slot, newName, newPos, newNum) => {
        mutate((g) => {
            const cur = g.lineup[side][slot];
            const oldName = cur.name;
            const nm = (newName || "").trim() || cur.name;
            const np = (newPos || "").trim();
            const hist = Array.isArray(cur.posHist) ? cur.posHist.slice() : (cur.pos ? [cur.pos] : []);
            if (np && !hist.includes(np))
                hist.push(np); // record each new position played
            const nn = newNum != null ? (newNum || "").trim() : (cur.num || ""); // preserve number if not supplied
            g.lineup[side][slot] = { name: nm, pos: np, num: nn, posHist: hist };
            // Keep the pitching lines in step: any pitcher record on this side
            // that carries the player's old name is the same player — rename it.
            if (nm !== oldName && g.pitchers && g.pitchers[side]) {
                g.pitchers[side].forEach((pp) => {
                    if (pp.name === oldName)
                        pp.name = nm;
                });
            }
            // Rename through the play-by-play too, but ONLY in the half-innings
            // that belong to this player. Both teams can have a player with the
            // same default name, so an unscoped rewrite would rename the other
            // team's batter too. A batter appears in his own team's half; a
            // pitching change names the FIELDING side, i.e. the other half.
            if (nm !== oldName && Array.isArray(g.log)) {
                const fix = (txt) => renameInLogText(txt, oldName, nm);
                const myHalf = side === "away" ? "top" : "bottom";
                g.log.forEach((e) => {
                    const eHalf = e.h === "top" ? "top" : "bottom";
                    const isChange = typeof e.t === "string" && e.t.indexOf("Pitching change") === 0;
                    const mine = isChange ? eHalf !== myHalf : eHalf === myHalf;
                    if (!mine)
                        return;
                    if (!isChange && e.batter === oldName)
                        e.batter = nm;
                    if (e.t)
                        e.t = fix(e.t);
                    if (e.result)
                        e.result = fix(e.result);
                });
            }
            repairLogNames(g); // and heal any older number-placeholders via the # field
            g.lastPlay = `Lineup updated: ${nm}`;
        });
        setSubMenu(false);
        setSubSlot(null);
        setSubName("");
        setSubPos("");
        setSubNum("");
    };
    // Add a batter to the end of the order (e.g. a player who arrived late).
    // Appends a fresh slot + stat line; existing slots, runners and the
    // current batter are untouched.
    const orderOpen = (side) => !(game && game.orderLocked && game.orderLocked[side]);
    const slotRemovable = (side, slot) => {
        if (!game || !game.lineup)
            return false;
        if (game.lineup[side].length <= 2)
            return false;
        const st = game.stats[side][slot];
        if (st.ab || st.h || st.r || st.rbi || st.bb || st.k)
            return false;
        if (game.card && game.card[side].some((c) => c.b === slot))
            return false;
        if (side === battingSide) {
            if (slot === game.batter[battingSide])
                return false;
            if (["first", "second", "third"].some((b) => game.bases[b] && game.bases[b].b === slot))
                return false;
        }
        return true;
    };
    // Remove an unused order slot (only before the order turns over). Splices the
    // slot out and shifts every higher index in the batter pointer, runners,
    // scorecard and sub ledger so attribution stays correct.
    const removeBatter = (side, slot) => {
        if (!slotRemovable(side, slot))
            return;
        mutate((g) => {
            g.lineup[side].splice(slot, 1);
            g.stats[side].splice(slot, 1);
            if (g.batter[side] > slot)
                g.batter[side] -= 1;
            (g.card[side] || []).forEach((c) => {
                if (c.b > slot)
                    c.b -= 1;
            });
            (g.subs[side] || []).forEach((c) => {
                if (c.slot > slot)
                    c.slot -= 1;
            });
            const bs = g.half === "top" ? "away" : "home";
            if (side === bs) {
                ["first", "second", "third"].forEach((b) => {
                    if (g.bases[b] && g.bases[b].b > slot)
                        g.bases[b].b -= 1;
                });
                [g.openHit, g.openK, g.openTag].forEach((o) => {
                    if (o && o.b != null && o.b > slot)
                        o.b -= 1;
                });
            }
            g.lastPlay = `${teams[side].name}: spot removed`;
        });
        setSubSlot(null);
        setSubName("");
        setSubPos("");
        setSubNum("");
    };
    const addBatter = (side) => {
        if (!orderOpen(side))
            return;
        const newIdx = game.lineup[side].length;
        mutate((g) => {
            g.lineup[side].push({ name: `Batter ${g.lineup[side].length + 1}`, pos: "", num: "", posHist: [] });
            g.stats[side].push({ ab: 0, h: 0, r: 0, rbi: 0, bb: 0, k: 0 });
            g.lastPlay = `${teams[side].name}: batter added`;
        });
        setSubSlot(newIdx);
        setSubName("");
        setSubPos("");
        setSubNum("");
    };
    // Quick options for the batter at the plate (tap the at-bat card).
    const openBatterMenu = () => {
        if (!game || !game.lineup)
            return;
        const p = game.lineup[battingSide][game.batter[battingSide]];
        setBatName(p.name);
        setBatPos(p.pos || "");
        setBatNum(p.num || "");
        setBatterMenu(true);
    };
    /* --- diamond interactions: tap = menu/place, drag = move runner --- */
    const svgRef = useRef(null);
    const [drag, setDrag] = useState(null); // {from, x, y, moved, sx, sy}
    const dragRef = useRef(null); // synchronous mirror — guards against duplicate pointer events
    const baseMenuAt = useRef(0); // when the base menu opened, to swallow the trailing click
    const [menuArmed, setMenuArmed] = useState(false); // buttons live only after the opening gesture settles
    const openBaseMenu = (b) => {
        baseMenuAt.current = (typeof performance !== "undefined" ? performance.now() : Date.now());
        setMenuArmed(false);
        setBaseMenu(b);
        // Arm the buttons only after the browser's synthesized click (fired
        // ~300ms after a touch tap) has passed, so that phantom click can't
        // land on a button like "Caught stealing 2nd".
        setTimeout(() => setMenuArmed(true), 400);
    };
    const closeBaseMenu = () => { setBaseMenu(null); setMenuArmed(false); };
    const closeBaseMenuBackdrop = () => {
        // A tap on the diamond fires pointerup (which opens the menu) and then a
        // synthesized click that lands on the freshly-rendered backdrop. Ignore
        // dismiss clicks that arrive right after opening.
        const since = (typeof performance !== "undefined" ? performance.now() : Date.now()) - baseMenuAt.current;
        if (since > 350)
            closeBaseMenu();
    };
    const setDragBoth = (v) => {
        dragRef.current = v;
        setDrag(v);
    };
    const svgPoint = (e) => {
        const svg = svgRef.current;
        if (!svg)
            return { x: 0, y: 0 };
        const m = svg.getScreenCTM();
        if (!m)
            return { x: 0, y: 0 };
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
        return { x: p.x, y: p.y };
    };
    const baseLabel = (b) => b === "first" ? "1st" : b === "second" ? "2nd" : b === "third" ? "3rd" : "home";
    // display name for the runner on a base ("Runner" if manually placed)
    const runnerLabel = (base) => {
        const r = game.bases[base];
        if (!r)
            return "";
        if (r.cr)
            return `${r.cr.name} (CR)`;
        return r.b != null ? game.lineup[battingSide][r.b].name : "Runner";
    };
    const moveRunner = (from, to) => {
        const who = runnerLabel(from);
        if (to === "home") {
            mutate((g) => {
                creditRun(g, g.bases[from]);
                g.bases[from] = false;
                addRuns(g, 1, "advance");
                if (g.openHit != null) {
                    g.stats[battingSide][g.openHit.b].rbi += 1;
                    const batterName = g.lineup[battingSide][g.openHit.b].name;
                    amendOpenHit(g, `${who} scores`, `${who} scores on the play — RBI ${batterName}`);
                }
                else if (g.openPlay != null && g.log[g.openPlay]) {
                    // fold onto the last play's line (e.g. the groundout), no RBI
                    amendPA(g, g.openPlay, `${who} scores`, `${who} scores on the play`);
                }
                else {
                    logPlay(g, `${who} scores from ${baseLabel(from)} (steal/PB/WP — no RBI)`);
                }
            });
            return;
        }
        if (game.bases[to]) {
            mutate((g) => logPlay(g, `${baseLabel(to)} is occupied — move blocked`, "info"));
            return;
        }
        mutate((g) => {
            g.bases[to] = g.bases[from];
            g.bases[from] = false;
            cardAdvance(g, g.bases[to], to === "second" ? 2 : to === "third" ? 3 : 1);
            if (g.openHit != null) {
                amendOpenHit(g, `${who} to ${baseLabel(to)}`, `${who} takes ${baseLabel(to)} on the play`);
                g.openHit = null; // the play's advance is credited; further drags are manual moves
            }
            else if (g.openPlay != null && g.log[g.openPlay]) {
                // fold the advance onto the last play's line instead of a new event
                amendPA(g, g.openPlay, `${who} takes ${baseLabel(to)}`, `${who} takes ${baseLabel(to)} on the play`);
            }
            else {
                logPlay(g, `${who}: ${baseLabel(from)} → ${baseLabel(to)}`);
            }
        });
    };
    // Nearest base to an SVG point, or null if the point isn't near any bag.
    // Geometry-based hit-testing — robust on all touch devices, unlike
    // elementFromPoint (which misbehaves while a pointer is captured).
    const BASE_XY = { first: { x: 172, y: 86 }, second: { x: 100, y: 14 }, third: { x: 28, y: 86 }, home: { x: 100, y: 158 } };
    const nearestBase = (pt) => {
        let best = null, bd = 1e9;
        Object.keys(BASE_XY).forEach((b) => {
            const dx = pt.x - BASE_XY[b].x, dy = pt.y - BASE_XY[b].y;
            const d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = b; }
        });
        return bd <= 34 * 34 ? best : null; // within ~34 SVG units of a bag
    };
    const basePointerDown = (e) => {
        if (game.over)
            return;
        const p = svgPoint(e);
        const base = nearestBase(p);
        if (!base || base === "home") {
            dragRef.current = null; // clear any stale gesture
            return; // pressed empty infield or home plate — ignore
        }
        e.preventDefault();
        e.stopPropagation();
        // Record the press FIRST, so a tap always resolves even if pointer
        // capture fails. Some Android tablet browsers throw on setPointerCapture;
        // that must not abort the tap-to-menu path.
        setDragBoth({
            from: base,
            occupied: !!game.bases[base],
            x: p.x,
            y: p.y,
            sx: e.clientX,
            sy: e.clientY,
            pid: e.pointerId,
            t0: (typeof performance !== "undefined" ? performance.now() : Date.now()),
            touch: e.pointerType === "touch" || e.pointerType === "pen",
            moved: false,
        });
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        }
        catch (_a) { /* capture is optional; dragging still works via move/up */ }
    };
    const basePointerMove = (e) => {
        const d = dragRef.current;
        if (!d)
            return;
        e.preventDefault();
        e.stopPropagation();
        const p = svgPoint(e);
        // Touch needs a much larger slop than a mouse — fingers wobble on a
        // "tap." Only count it as a drag past a generous distance; a quick tap
        // is never a drag regardless of drift.
        const dist = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
        const slop = d.touch ? 22 : 8;
        const moved = d.moved || dist > slop;
        setDragBoth(Object.assign(Object.assign({}, d), { x: p.x, y: p.y, moved }));
    };
    const basePointerUp = (e) => {
        const d = dragRef.current;
        if (!d)
            return; // already resolved — duplicate event
        e.preventDefault();
        e.stopPropagation();
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        catch (_a) { }
        setDragBoth(null);
        // A quick press is always a tap, even if the finger drifted past the
        // slop — this is what keeps a tablet tap from being read as a drag.
        const dt = (typeof performance !== "undefined" ? performance.now() : Date.now()) - (d.t0 || 0);
        const quick = dt < 250;
        if (!d.moved || quick) {
            // plain tap → menu (occupied) or place a runner (empty)
            if (d.occupied)
                openBaseMenu(d.from);
            else
                mutate((g) => {
                    g.bases[d.from] = { b: null, rp: curPIdx(g, fieldingSide) };
                    logPlay(g, `Runner placed on ${baseLabel(d.from)}`);
                });
            return;
        }
        if (!d.occupied)
            return; // dragged from an empty base — nothing to move
        const to = nearestBase(svgPoint(e));
        if (!to || to === d.from)
            return; // released away from a base, or back on itself — cancel, no move
        moveRunner(d.from, to);
    };
    // A single runner scores with no RBI. `cause` is "wp" | "pb" | null; when
    // given, the wild pitch or passed ball is charged as well.
    const runnerScores = (base, cause) => {
        const who = runnerLabel(base);
        mutate((g) => {
            if (cause === "wp")
                curP(g, fieldingSide).wp = (curP(g, fieldingSide).wp || 0) + 1;
            else if (cause === "pb")
                g.pb[fieldingSide] = (g.pb[fieldingSide] || 0) + 1;
            creditRun(g, g.bases[base]);
            g.bases[base] = false;
            addRuns(g, 1, cause === "wp" ? "wp" : cause === "pb" ? "pb" : "advance");
            const tag = cause === "wp" ? "wild pitch" : cause === "pb" ? "passed ball" : "no RBI";
            logPlay(g, `${who} scores from ${baseLabel(base)} (${tag}${cause ? " — no RBI" : ""})`);
        });
        setBaseMenu(null);
    };
    // One runner moves up on a wild pitch / passed ball. From third this is a
    // run. Charges one WP or PB — if several runners moved on the same pitch,
    // use More > Wild pitch instead so it's only charged once.
    const runnerAdvanceOn = (base, cause) => {
        if (base === "third") {
            runnerScores(base, cause);
            return;
        }
        const who = runnerLabel(base);
        const target = base === "first" ? "second" : "third";
        if (game.bases[target]) {
            mutate((g) => logPlay(g, `${baseLabel(target)} is occupied \u2014 move blocked`, "info"));
            setBaseMenu(null);
            return;
        }
        mutate((g) => {
            if (cause === "wp")
                curP(g, fieldingSide).wp = (curP(g, fieldingSide).wp || 0) + 1;
            else
                g.pb[fieldingSide] = (g.pb[fieldingSide] || 0) + 1;
            g.bases[target] = g.bases[base];
            g.bases[base] = false;
            cardAdvance(g, g.bases[target], target === "second" ? 2 : 3);
            logPlay(g, `${who} takes ${baseLabel(target)} on a ${cause === "wp" ? "wild pitch" : "passed ball"}`);
        });
        setBaseMenu(null);
    };
    // Runner takes home as part of the just-recorded hit — batter gets the RBI
    const runnerScoresOnPlay = (base) => {
        const who = runnerLabel(base);
        mutate((g) => {
            creditRun(g, g.bases[base]);
            g.bases[base] = false;
            addRuns(g, 1, "hit");
            if (g.openHit != null) {
                g.stats[battingSide][g.openHit.b].rbi += 1;
                const batterName = g.lineup[battingSide][g.openHit.b].name;
                amendOpenHit(g, `${who} scores`, `${who} scores on the play — RBI ${batterName}`);
            }
            else {
                logPlay(g, `${who} scores from ${baseLabel(base)}`);
            }
        });
        setBaseMenu(null);
    };
    // Stolen base: advance one base (3rd steals home and scores, no RBI)
    const stealBase = (base) => {
        const who = runnerLabel(base);
        if (base === "third") {
            mutate((g) => {
                creditRun(g, g.bases.third);
                g.bases.third = false;
                addRuns(g, 1, "steal");
                logPlay(g, `${who} steals home!`);
            });
            setBaseMenu(null);
            return;
        }
        const target = base === "first" ? "second" : "third";
        if (game.bases[target]) {
            mutate((g) => logPlay(g, `${baseLabel(target)} is occupied — steal blocked`, "info"));
            setBaseMenu(null);
            return;
        }
        mutate((g) => {
            g.bases[target] = g.bases[base];
            g.bases[base] = false;
            cardAdvance(g, g.bases[target], target === "second" ? 2 : 3);
            logPlay(g, `${who} steals ${baseLabel(target)}`);
        });
        setBaseMenu(null);
    };
    // Runner hit by a fair batted ball (OBR 5.09(b)(7)). The runner who was hit
    // is out, the ball is dead, and the batter is credited a single, reaching
    // first. Other runners hold unless forced by the batter's award to first.
    const playRunnerHit = (base) => {
        const who = runnerLabel(base);
        mutate((g) => {
            addPitch(g);
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            const bIdx = g.batter[battingSide];
            const st = g.stats[battingSide][bIdx];
            const name = currentBatterName();
            // the runner who was hit is out
            cardOut(g, g.bases[base], g.outs + 1);
            g.bases[base] = false;
            chargeP(g, "outs");
            const flipped = recordOut(g);
            // batter is credited a single and reaches first
            st.ab += 1;
            st.h += 1;
            g.hits[battingSide] += 1;
            chargeP(g, "h");
            cardMark(g, bIdx, "1B", 1);
            // batter awarded first; only runners forced by that award move up
            const runs = forceAdvance(g, bIdx);
            addRuns(g, runs, "1B");
            st.rbi += runs;
            closePA(g, `${who} hit by batted ball — out; ${name} single`, `${who} hit by the batted ball — out. ${name} credited a single`);
            if (!flipped)
                nextBatter(g);
            else
                advanceOrder(g);
        });
        setRhbMenu(false);
    };
    const runnerOut = (base) => {
        const who = runnerLabel(base);
        mutate((g) => {
            cardOut(g, g.bases[base], g.outs + 1);
            g.bases[base] = false;
            chargeP(g, "outs");
            if (g.openHit != null) {
                amendOpenHit(g, `${who} out at ${baseLabel(base)}`, `${who} out at ${baseLabel(base)} on the play`);
            }
            else {
                logPlay(g, `${who} out at ${baseLabel(base)}`);
            }
            recordOut(g);
        });
        setBaseMenu(null);
    };
    const caughtStealing = (base) => {
        const who = runnerLabel(base);
        const targetTxt = base === "third" ? "home" : baseLabel(base === "first" ? "second" : "third");
        mutate((g) => {
            cardOut(g, g.bases[base], g.outs + 1);
            g.bases[base] = false;
            chargeP(g, "outs");
            logPlay(g, `${who} caught stealing ${targetTxt} (CS)`);
            recordOut(g);
        });
        setBaseMenu(null);
    };
    const pickedOff = (base) => {
        const who = runnerLabel(base);
        mutate((g) => {
            cardOut(g, g.bases[base], g.outs + 1);
            g.bases[base] = false;
            chargeP(g, "outs");
            logPlay(g, `${who} picked off ${baseLabel(base)} (PO)`);
            recordOut(g);
        });
        setBaseMenu(null);
    };
    // Overthrow / errant pickoff: the runner advances a base and the fielding
    // team is charged an error (shows in the E column).
    const advanceOnError = (base, pos) => {
        const who = runnerLabel(base);
        if (base === "third") {
            mutate((g) => {
                if (g.bases.third)
                    g.bases.third.ue = true; // scored because of the error
                creditRun(g, g.bases.third);
                g.bases.third = false;
                addRuns(g, 1, "error");
                const enote = logError(g, pos);
                logPlay(g, `Throwing error \u2014 ${who} scores from 3rd (${enote})`);
            });
            setBaseMenu(null);
            return;
        }
        const target = base === "first" ? "second" : "third";
        if (game.bases[target]) {
            mutate((g) => logPlay(g, `${baseLabel(target)} is occupied \u2014 move blocked`, "info"));
            setBaseMenu(null);
            return;
        }
        mutate((g) => {
            g.bases[target] = g.bases[base];
            g.bases[base] = false;
            cardAdvance(g, g.bases[target], target === "second" ? 2 : 3);
            const enote = logError(g, pos);
            logPlay(g, `Throw gets away \u2014 ${who} takes ${baseLabel(target)} (${enote})`);
        });
        setBaseMenu(null);
    };
    const runnerClear = (base) => {
        const who = runnerLabel(base);
        mutate((g) => {
            g.bases[base] = false;
            logPlay(g, `${who} removed from ${baseLabel(base)}`, "info");
        });
        setBaseMenu(null);
    };
    const newPitcher = () => {
        commitPitcherName(); // flush a half-committed rename into the log first
        const side = pitchMenuSide || fieldingSide;
        const name = incomingName.trim() || `P${game.pitchers[side].length + 1}`;
        const roster = (game.lineup && game.lineup[side]) || teams[side].lineup;
        const match = roster.find((pl) => pl.name === name);
        mutate((g) => {
            const prev = curP(g, side);
            g.pitchers[side].push(freshPitcher(name, match ? match.num : ""));
            logPlay(g, `Pitching change (${teams[side].name}): ${name} in for ${prev.name} (${prev.pitches} pitches)`, "info");
        });
        setIncomingName("");
        setPitchMenuSide(null);
    };
    // rename / renumber the current pitcher without polluting undo history
    const renamePitcher = (value) => setGame((g) => {
        const n = snapshot(g);
        curP(n, pitchMenuSide || fieldingSide).name = value;
        return n;
    });
    // Commit an edited pitcher name back through the play-by-play, so a line
    // written as "P2 in for Diego F." reads with the real name. Called on blur
    // rather than per-keystroke so half-typed names never hit the log.
    const commitPitcherName = () => setGame((g) => {
        const n = snapshot(g);
        const pp = curP(n, pitchMenuSide || fieldingSide);
        const from = (pp.logName || "").trim();
        const to = (pp.name || "").trim();
        if (!from || !to || from === to)
            return n;
        const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rx = new RegExp(`(^|[^\\w])${esc}(?=$|[^\\w])`, "g");
        const swap = (t) => (typeof t === "string" ? t.replace(rx, (_m, lead) => lead + to) : t);
        n.log.forEach((e) => {
            if (e.t)
                e.t = swap(e.t);
            if (e.result)
                e.result = swap(e.result);
        });
        n.lastPlay = swap(n.lastPlay || "");
        pp.logName = to;
        return n;
    });
    const setPitcherNum = (value) => setGame((g) => {
        const n = snapshot(g);
        curP(n, pitchMenuSide || fieldingSide).num = value.replace(/[^0-9]/g, "").slice(0, 2);
        return n;
    });
    const adjustRun = (n) => mutate((g) => {
        const row = g.linescore[g.inning - 1];
        row[battingSide] = Math.max(0, (row[battingSide] || 0) + n);
        logPlay(g, n > 0 ? "Run added" : "Run removed", "info");
    });
    const manualEndHalf = () => mutate((g) => {
        g.openPA = null;
        endHalf(g);
        logPlay(g, "Side retired", "info");
    });
    // earned runs for a pitcher = total runs minus unearned
    const earnedOf = (pp) => Math.max(0, (pp.r || 0) - (pp.uer || 0));
    // sensible default W/L/S from the final line — always overrideable
    const suggestDecisions = (g) => {
        const aw = g.linescore.reduce((s2, r) => s2 + (r.away || 0), 0);
        const hm = g.linescore.reduce((s2, r) => s2 + (r.home || 0), 0);
        if (aw === hm)
            return { w: null, l: null, s: null };
        const winSide = aw > hm ? "away" : "home";
        const loseSide = winSide === "away" ? "home" : "away";
        const margin = Math.abs(aw - hm);
        const wp = g.pitchers[winSide];
        const lp = g.pitchers[loseSide];
        let wIdx = 0;
        wp.forEach((pp, i) => {
            if (pp.outs > wp[wIdx].outs)
                wIdx = i;
        }); // longest outing
        let lIdx = 0;
        lp.forEach((pp, i) => {
            if (pp.r > lp[lIdx].r)
                lIdx = i;
        }); // most runs allowed
        let sIdx = null;
        const lastW = wp.length - 1;
        if (wp.length > 1 && lastW !== wIdx && margin <= 3)
            sIdx = lastW; // closer in a tight game
        return {
            w: { side: winSide, idx: wIdx },
            l: { side: loseSide, idx: lIdx },
            s: sIdx != null ? { side: winSide, idx: sIdx } : null,
        };
    };
    const setDecision = (role, side, idx) => mutate((g) => {
        if (!g.decisions)
            g.decisions = { w: null, l: null, s: null };
        const cur = g.decisions[role];
        if (cur && cur.side === side && cur.idx === idx)
            g.decisions[role] = null;
        else
            g.decisions[role] = { side, idx };
    });
    const decisionTag = (side, i) => {
        const d = game && game.decisions;
        if (!d)
            return "";
        if (d.w && d.w.side === side && d.w.idx === i)
            return "W";
        if (d.l && d.l.side === side && d.l.idx === i)
            return "L";
        if (d.s && d.s.side === side && d.s.idx === i)
            return "S";
        return "";
    };
    const adjustUER = (delta) => mutate((g) => {
        const pp = curP(g, pitchMenuSide);
        pp.uer = Math.max(0, Math.min(pp.r, (pp.uer || 0) + delta));
    });
    // BNS 5.2.7.8 — "last batter" called: credit the pitcher with the count
    // at the time of the call; the live counter keeps counting actual pitches.
    const callLastBatter = () => mutate((g) => {
        const pp = curP(g, fieldingSide);
        if (pp.lastB || pp.pitches <= 0)
            return;
        pp.lastB = { at: pp.pitches, inning: g.inning };
        logPlay(g, `Last batter called — ${pp.name} credited with ${pp.pitches} pitches`, "info");
    });
    const clearLastBatter = () => mutate((g) => {
        const pp = curP(g, pitchMenuSide || fieldingSide);
        if (!pp.lastB)
            return;
        logPlay(g, `Last batter call cleared for ${pp.name}`, "info");
        pp.lastB = null;
    });
    // adjust the credited number (e.g. bump 33 -> the official 35 threshold)
    // without polluting undo history, like renamePitcher
    const editLastBatter = (v) => setGame((g) => {
        const n = snapshot(g);
        const pp = curP(n, pitchMenuSide || fieldingSide);
        if (pp.lastB)
            pp.lastB.at = Math.max(0, Math.min(200, parseInt(v || "0", 10) || 0));
        return n;
    });
    const endGame = () => mutate((g) => {
        // If "final" is called before anything happened in the current half
        // (no plate appearance, no pitch, no runs), the game really ended in
        // the previous half — roll the book back so a 6-inning game doesn't
        // read "Top 7".
        let rolledBack = false;
        if (g.half === "top" && g.inning > 1 && (g.halfPA || 0) === 0 && g.balls === 0 && g.strikes === 0) {
            const idx = g.inning - 1;
            const row = g.linescore[idx];
            const rowUntouched = row && (row.away || 0) === 0 && row.home == null;
            if (rowUntouched) {
                if (idx === g.linescore.length - 1)
                    g.linescore.pop(); // drop the untouched extra column
                g.inning -= 1;
                g.half = "bottom";
                rolledBack = true;
            }
        }
        g.over = true;
        g.bases = emptyBases();
        if (!g.decisions)
            g.decisions = { w: null, l: null, s: null };
        g.decisions = suggestDecisions(g);
        // If the home team never batted in the final inning, mark that cell 'X'.
        const ci = g.inning - 1;
        const row = g.linescore[ci];
        if (row && row.away != null) {
            const homeDidNotBat = rolledBack ? false : (g.half === "top" ? true : (g.halfPA || 0) === 0);
            if (homeDidNotBat)
                row.homeX = true;
        }
        logPlay(g, "Final", "info");
    });
    const startLogEdit = (idx) => {
        const e = game.log[idx];
        if (!e)
            return;
        setPbpText(e.type === "pa" ? (e.result || "") : (e.t || ""));
        setPbpEdit(idx);
    };
    const saveLogEdit = () => {
        const idx = pbpEdit;
        if (idx == null)
            return;
        mutate((g) => {
            const e = g.log[idx];
            if (!e)
                return;
            if (e.type === "pa")
                e.result = pbpText;
            else
                e.t = pbpText;
            if (idx === g.log.length - 1 && pbpText)
                g.lastPlay = pbpText;
        });
        setPbpEdit(null);
        setPbpText("");
    };
    const totals = (side) => game.linescore.reduce((sum, r) => sum + (r[side] || 0), 0);
    /* ---------------- live spectator (view-only) ---------------- */
    const LIVE_ENDPOINT = "/.netlify/functions/game";
    const liveLink = () => liveCode ? `${location.origin}/spectate.html?g=${liveCode}` : "";
    // Turn a pasted YouTube or StreamYard link (or full <iframe> embed) into a
    // SAFE embed URL. Allowlisted hosts only; we never inject pasted HTML.
    const parseStreamUrl = (input) => {
        if (!input) return null;
        let s = String(input).trim();
        const m = s.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
        if (m) s = m[1];
        const urlm = s.match(/https?:\/\/[^\s"'<>]+/i);
        if (urlm) s = urlm[0];
        s = s.replace(/^http:\/\//i, "https://");
        if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
        let u;
        try { u = new URL(s); } catch (e) { return null; }
        if (u.protocol !== "https:") return null;
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        const ytHost = host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")
            || host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com");
        if (ytHost) {
            let id = "";
            if (host === "youtu.be") id = u.pathname.slice(1);
            else if (u.searchParams.get("v")) id = u.searchParams.get("v");
            else { const p = u.pathname.match(/\/(?:live|embed|shorts|v)\/([A-Za-z0-9_-]{6,})/); if (p) id = p[1]; }
            id = (id || "").split(/[/?&#]/)[0];
            if (/^[A-Za-z0-9_-]{6,}$/.test(id))
                return { type: "youtube", mode: "embed", src: "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&playsinline=1" };
            const ch = u.pathname.match(/\/channel\/(UC[A-Za-z0-9_-]{10,})/);
            if (ch)
                return { type: "youtube", mode: "embed", src: "https://www.youtube-nocookie.com/embed/live_stream?channel=" + ch[1] + "&autoplay=1" };
            return { type: "youtube", mode: "link", src: u.href };
        }
        if (host === "streamyard.com" || host.endsWith(".streamyard.com"))
            return { type: "streamyard", mode: "embed", src: u.href };
        if (host === "facebook.com" || host === "fb.watch" || host.endsWith(".facebook.com")) {
            if (u.pathname.indexOf("/plugins/video.php") === 0)
                return { type: "facebook", mode: "embed", src: u.href };
            return { type: "facebook", mode: "embed", src: "https://www.facebook.com/plugins/video.php?show_text=false&href=" + encodeURIComponent(u.href) };
        }
        if (host === "instagram.com" || host.endsWith(".instagram.com"))
            return { type: "instagram", mode: "link", src: u.href };
        if (host === "tiktok.com" || host.endsWith(".tiktok.com"))
            return { type: "tiktok", mode: "link", src: u.href };
        return null;
    };
    const buildLiveSnap = () => {
        const g = game;
        const nm = (side) => (teams[side].name || "").trim() || (side === "away" ? "Visitors" : "Home");
        const bat = g.lineup[battingSide][g.batter[battingSide]];
        const lu = g.lineup[battingSide];
        const onDeck = lu && lu.length
            ? lu[(g.batter[battingSide] + 1) % lu.length]
            : null;
        const fp = curP(g, fieldingSide);
        return {
            v: 1,
            av: APP_VERSION,
            over: !!g.over,
            away: { name: nm("away"), abbr: autoAbbr(nm("away")), runs: totals("away"), hits: g.hits.away, errors: g.errors.away, color: teamColor("away"), logo: teams.away.logo || "" },
            home: { name: nm("home"), abbr: autoAbbr(nm("home")), runs: totals("home"), hits: g.hits.home, errors: g.errors.home, color: teamColor("home"), logo: teams.home.logo || "" },
            inning: g.inning,
            half: g.half,
            balls: g.balls,
            strikes: g.strikes,
            outs: g.outs,
            bases: (() => {
                const bs = (k) => {
                    const r = g.bases[k];
                    if (!r)
                        return false;
                    if (r.cr)
                        return { n: `${r.cr.name} (CR)` };
                    const p = (r.b != null && g.lineup[battingSide][r.b]) || null;
                    return { n: p ? p.name : "" };
                };
                return { first: bs("first"), second: bs("second"), third: bs("third") };
            })(),
            batter: bat ? bat.name : "",
            onDeck: onDeck ? onDeck.name : "",
            pitches: fp ? fp.pitches || 0 : 0,
            pitcher: fp ? fp.name : "",
            lastPlay: g.lastPlay || "",
            linescore: g.linescore.map((r) => ({ away: r.away, home: r.home })),
            log: (g.log || []).slice(-40).map((e) => e.type === "pa"
                ? { p: 1, i: e.i, h: e.h, b: e.batter, r: e.result || "", q: (e.seq || []).join(" ") }
                : { i: e.i, h: e.h, t: e.t || "" }),
            video: parseStreamUrl(liveVideo) || null,
        };
    };
    const startLive = () => {
        let code = liveCode;
        if (!code) {
            code = Math.random().toString(36).slice(2, 8).toUpperCase();
            setLiveCode(code);
        }
        setLiveOn(true);
        setShareOpen(false);
        setLiveOpen(true);
    };
    const stopLive = () => {
        setLiveOn(false);
    };
    // Persist the code + on-flag so a reload or accidental close keeps the same link.
    useEffect(() => {
        try {
            if (liveCode)
                localStorage.setItem(LIVE_KEY, JSON.stringify({ code: liveCode, on: liveOn, list: liveList, video: liveVideo }));
        }
        catch (_a) { }
    }, [liveCode, liveOn, liveList, liveVideo]);
    // Broadcast the game state: once on every change (debounced), plus a heartbeat
    // every few seconds so the viewer stays "live" during quiet stretches and
    // re-seeds instantly after a backgrounded tab or a signal blip.
    useEffect(() => {
        if (!liveOn || !liveCode || !game || phase !== "game")
            return;
        const send = () => {
            fetch(LIVE_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: liveCode, snap: buildLiveSnap(), list: liveList }),
            }).catch(() => { });
        };
        const id = setTimeout(send, 600); // publish this change
        const hb = setInterval(send, 5000); // heartbeat
        return () => {
            clearTimeout(id);
            clearInterval(hb);
        };
    }, [game, liveOn, liveCode, phase, liveList, liveVideo]);
    const setBatterIndex = (idx) => mutate((g) => {
        g.batter[battingSide] = idx;
        g.balls = 0;
        g.strikes = 0;
        g.openPA = null;
        g.lastPlay = `Now batting: ${g.lineup[battingSide][idx].name}`;
    });
    const buildRecap = () => {
        const line = (side) => `${teams[side].name.padEnd(14)} ${game.linescore
            .map((r) => (r[side] === null ? "-" : r[side]))
            .join(" ")}  |  R ${totals(side)}  H ${game.hits[side]}  E ${game.errors[side]}`;
        const batLines = (side) => teams[side].lineup
            .map((p, i) => {
            const st = game.stats[side][i];
            return `${i + 1}. ${p.name}${p.pos ? ` (${p.pos})` : ""}: ${st.h}-${st.ab}, ${st.r} R, ${st.rbi} RBI, ${st.bb} BB, ${st.k} K`;
        })
            .join("\n");
        const pitLines = (side) => game.pitchers[side]
            .map((pp) => {
            const base = `${pLabel(pp)}: ${ipDisplay(pp.outs)} IP, ${pp.h} H, ${pp.r} R, ${pp.bb} BB, ${pp.k} K, ${pp.hr} HR, ${pp.pitches} NP${pp.wp ? `, ${pp.wp} WP` : ""}`;
            const bi = pInnStr(pp);
            return bi ? `${base} (by inning ${bi})` : base;
        })
            .join("\n  ");
        const scoring = game.log
            .filter((e) => (e.type === "pa" && e.result && /score|run forced/i.test(e.result)) ||
            (e.type === "ev" && /scores/i.test(e.t)))
            .map((e) => e.type === "pa"
            ? `${e.h === "top" ? "T" : "B"}${e.i} — ${e.batter}: ${e.result}`
            : `${e.h === "top" ? "T" : "B"}${e.i} — ${e.t}`)
            .join("\n");
        return (`${game.over ? "FINAL" : `LIVE (${game.half === "top" ? "T" : "B"}${game.inning})`} — ` +
            `${teams.away.name} ${totals("away")}, ${teams.home.name} ${totals("home")}\n\n` +
            `${line("away")}\n${line("home")}\n\n` +
            `SCORING PLAYS\n${scoring || "None"}\n\n` +
            `PITCHING — ${teams.away.name}\n  ${pitLines("away")}\n` +
            `PITCHING — ${teams.home.name}\n  ${pitLines("home")}\n\n` +
            `BATTING — ${teams.away.name}\n${batLines("away")}\n\n` +
            `BATTING — ${teams.home.name}\n${batLines("home")}\n\n` +
            `— scored with DugoutIQ`);
    };
    // Branded score-graphic recap (1080x1080 PNG)
    const drawRecapCanvas = () => new Promise((resolve) => {
        const W = 1080;
        const H = 1080;
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const ctx = c.getContext("2d");
        if (typeof ctx.roundRect !== "function") {
            ctx.roundRect = function (x, y, w, h) {
                this.rect(x, y, w, h);
            };
        }
        const finish = (logoImg, awayLogo, homeLogo) => {
            // background
            const grad = ctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, "#1D2D5C");
            grad.addColorStop(1, "#101A3D");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
            ctx.strokeStyle = "#2B5AA0";
            ctx.lineWidth = 6;
            ctx.strokeRect(20, 20, W - 40, H - 40);
            // logo
            let y = 70;
            if (logoImg) {
                const lw = 360;
                const lh = (logoImg.height / logoImg.width) * lw;
                ctx.drawImage(logoImg, (W - lw) / 2, y, lw, lh);
                y += lh + 26;
            }
            else {
                ctx.fillStyle = "#FFFFFF";
                ctx.font = "800 64px 'Saira Condensed', sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("DUGOUTIQ", W / 2, y + 60);
                y += 110;
            }
            // status badge
            const status = game.over
                ? "FINAL"
                : `LIVE · ${game.half === "top" ? "TOP" : "BOT"} ${game.inning}`;
            ctx.font = "800 34px 'Saira Condensed', sans-serif";
            ctx.textAlign = "center";
            const bw = ctx.measureText(status).width + 60;
            ctx.fillStyle = game.over ? "#E8291C" : "#F5C518";
            ctx.beginPath();
            ctx.roundRect((W - bw) / 2, y, bw, 54, 10);
            ctx.fill();
            ctx.fillStyle = game.over ? "#FFFFFF" : "#1D2D5C";
            ctx.fillText(status, W / 2, y + 39);
            y += 110;
            // teams + scores
            const aWin = totals("away") > totals("home");
            const hWin = totals("home") > totals("away");
            const teamRow = (name, score, win, ty, accent, logo) => {
                let nx = 110;
                if (logo) {
                    const ls = 78;
                    try {
                        ctx.drawImage(logo, 110, ty - 58, ls, ls);
                    }
                    catch (_a) { }
                    nx = 110 + ls + 18;
                }
                ctx.textAlign = "left";
                ctx.fillStyle = win && game.over ? "#F5C518" : (accent || "#FFFFFF");
                ctx.font = "700 58px 'Saira Condensed', sans-serif";
                ctx.fillText(name.toUpperCase().slice(0, logo ? 13 : 16), nx, ty);
                ctx.textAlign = "right";
                ctx.font = "700 96px 'Saira Condensed', sans-serif";
                ctx.fillStyle = win && game.over ? "#F5C518" : "#FFFFFF";
                ctx.fillText(String(score), W - 110, ty + 10);
            };
            teamRow(teams.away.name, totals("away"), aWin, y + 60, teamColor("away"), awayLogo);
            teamRow(teams.home.name, totals("home"), hWin, y + 180, teamColor("home"), homeLogo);
            y += 250;
            // linescore grid
            const maxInn = 12;
            const innings = game.linescore.slice(-maxInn);
            const skipped = game.linescore.length - innings.length;
            const cols = innings.length + 3;
            const gridW = W - 220;
            const colW = Math.min(70, gridW / cols);
            const startX = (W - (colW * cols + 110)) / 2 + 110;
            ctx.font = "500 30px 'Saira Condensed', sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "#A9C5E8";
            innings.forEach((_, i) => {
                ctx.fillText(String(skipped + i + 1), startX + colW * i + colW / 2, y);
            });
            ["R", "H", "E"].forEach((hh, i) => {
                ctx.fillText(hh, startX + colW * (innings.length + i) + colW / 2, y);
            });
            const lsRow = (side, ry) => {
                ctx.textAlign = "left";
                ctx.fillStyle = "#A9C5E8";
                ctx.font = "700 30px 'Saira Condensed', sans-serif";
                ctx.fillText(teams[side].name.toUpperCase().slice(0, 6), startX - 105, ry);
                ctx.textAlign = "center";
                ctx.font = "700 32px 'Saira Condensed', sans-serif";
                ctx.fillStyle = "#FFFFFF";
                innings.forEach((r, i) => {
                    ctx.fillText(side === "home" && r.homeX ? "X" : r[side] == null ? "-" : String(r[side]), startX + colW * i + colW / 2, ry);
                });
                ctx.fillStyle = "#F5C518";
                [totals(side), game.hits[side], game.errors[side]].forEach((v, i) => {
                    ctx.fillText(String(v), startX + colW * (innings.length + i) + colW / 2, ry);
                });
            };
            ctx.strokeStyle = "#2B5AA0";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(90, y + 18);
            ctx.lineTo(W - 90, y + 18);
            ctx.stroke();
            lsRow("away", y + 62);
            lsRow("home", y + 112);
            y += 170;
            // footer
            ctx.textAlign = "center";
            ctx.fillStyle = "#A9C5E8";
            ctx.font = "700 26px 'Saira Condensed', sans-serif";
            ctx.fillText(`${new Date().toLocaleDateString()}  ·  DUGOUTIQ — MANAGE THE GAME`, W / 2, H - 60);
            resolve(c);
        };
        const loadImg = (src) => new Promise((res) => {
            if (!src)
                return res(null);
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = () => res(null);
            im.src = src;
        });
        Promise.all([
            loadImg(LOGO),
            loadImg(teams.away.logo),
            loadImg(teams.home.logo),
        ]).then(([brand, al, hl]) => finish(brand, al, hl));
    });
    // Classic paper-scorebook page: batters down, innings across, a diamond per cell
    const drawScorebookCanvas = (side) => new Promise((resolve) => {
        const lineup = (game.lineup && game.lineup[side]) || teams[side].lineup;
        const entries = (game.card && game.card[side]) || [];
        const maxInn = 12;
        const allInns = Math.max(game.linescore.length, 7);
        const innCount = Math.min(allInns, maxInn);
        const skipped = Math.max(0, game.linescore.length - innCount);
        const W = 1080;
        const nameW = 200;
        const statW = 44;
        const statCols = ["AB", "R", "H", "BB"];
        const gridX = 40 + nameW;
        const cellW = (W - 40 - nameW - statCols.length * statW - 40) / innCount;
        const cellH = 92;
        const headerH = 190;
        const rowsTop = headerH + 56;
        const H = rowsTop + lineup.length * cellH + 120;
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const ctx = c.getContext("2d");
        const finish = (logoImg) => {
            // paper
            ctx.fillStyle = "#FAF6EC";
            ctx.fillRect(0, 0, W, H);
            // header band
            ctx.fillStyle = "#1D2D5C";
            ctx.fillRect(0, 0, W, headerH);
            if (logoImg) {
                const lw = 200;
                const lh = (logoImg.height / logoImg.width) * lw;
                ctx.drawImage(logoImg, 40, (headerH - lh) / 2, lw, lh);
            }
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "700 44px 'Saira Condensed', sans-serif";
            ctx.textAlign = "left";
            ctx.fillText("OFFICIAL SCORECARD", 270, 80);
            ctx.font = "600 30px 'Saira Condensed', sans-serif";
            ctx.fillStyle = "#A9C5E8";
            ctx.fillText(`${teams[side].name.toUpperCase().slice(0, 18)}  ·  ${side === "away" ? "VISITORS" : "HOME"}`, 270, 124);
            ctx.fillText(`${teams.away.name} ${totals("away")} — ${teams.home.name} ${totals("home")}  ·  ${game.over ? "FINAL" : "IN PROGRESS"}  ·  ${new Date().toLocaleDateString()}`, 270, 160);
            const ink = "#1D2D5C";
            const grid = "#9A938A";
            // column headers
            ctx.textAlign = "center";
            ctx.font = "700 26px 'Saira Condensed', sans-serif";
            ctx.fillStyle = "#4A443C";
            for (let i = 0; i < innCount; i++) {
                ctx.fillText(String(skipped + i + 1), gridX + cellW * i + cellW / 2, rowsTop - 18);
            }
            statCols.forEach((h, i) => {
                ctx.fillText(h, gridX + cellW * innCount + statW * i + statW / 2, rowsTop - 18);
            });
            // rows
            lineup.forEach((p, r) => {
                const y = rowsTop + r * cellH;
                // name cell
                ctx.textAlign = "left";
                ctx.fillStyle = ink;
                ctx.font = "700 28px 'Saira Condensed', sans-serif";
                ctx.fillText(`${r + 1}. ${p.name.slice(0, 14)}`, 48, y + 40);
                ctx.font = "500 20px 'Saira Condensed', sans-serif";
                ctx.fillStyle = "#7A746B";
                ctx.fillText(p.pos || "", 48, y + 68);
                // inning cells with diamonds
                for (let i = 0; i < innCount; i++) {
                    const cx = gridX + cellW * i + cellW / 2;
                    const cy = y + cellH / 2 + 4;
                    const rR = Math.min(24, cellW * 0.32);
                    const pts = {
                        home: [cx, cy + rR],
                        first: [cx + rR, cy],
                        second: [cx, cy - rR],
                        third: [cx - rR, cy],
                    };
                    // faint diamond outline
                    ctx.strokeStyle = "#CFC8BC";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(...pts.home);
                    ctx.lineTo(...pts.first);
                    ctx.lineTo(...pts.second);
                    ctx.lineTo(...pts.third);
                    ctx.closePath();
                    ctx.stroke();
                    const cell = entries.filter((e) => e.b === r && e.inning === skipped + i + 1);
                    if (cell.length) {
                        const e0 = cell[0];
                        if (e0.base >= 4) {
                            // scored: fill the diamond
                            ctx.fillStyle = ink;
                            ctx.beginPath();
                            ctx.moveTo(...pts.home);
                            ctx.lineTo(...pts.first);
                            ctx.lineTo(...pts.second);
                            ctx.lineTo(...pts.third);
                            ctx.closePath();
                            ctx.fill();
                        }
                        else if (e0.base > 0) {
                            // bold the basepaths travelled
                            const path = [pts.home, pts.first, pts.second, pts.third, pts.home];
                            ctx.strokeStyle = ink;
                            ctx.lineWidth = 4;
                            ctx.beginPath();
                            ctx.moveTo(...path[0]);
                            for (let b = 1; b <= e0.base; b++)
                                ctx.lineTo(...path[b]);
                            ctx.stroke();
                        }
                        // result notation
                        ctx.fillStyle = e0.base === 0 ? "#8A4A3C" : ink;
                        ctx.font = "700 22px 'Saira Condensed', sans-serif";
                        ctx.textAlign = "center";
                        if (e0.base === 0) {
                            if (e0.res === "\uA4D8") {
                                // called strikeout — draw a horizontally-flipped K
                                // so it renders regardless of font glyph coverage
                                ctx.save();
                                ctx.translate(cx, cy + 8);
                                ctx.scale(-1, 1);
                                ctx.fillText("K", 0, 0);
                                ctx.restore();
                            }
                            else {
                                ctx.fillText(e0.res, cx, cy + 8);
                            }
                        }
                        else {
                            // "1B8" is wider than "1B" — keep it inside the cell
                            const w = ctx.measureText(e0.res).width;
                            const lx = Math.max(cx - rR - 2, cx - cellW / 2 + 3 + w / 2);
                            ctx.fillText(e0.res, lx, y + cellH - 12);
                        }
                        if (cell.length > 1) {
                            ctx.font = "700 18px 'Saira Condensed', sans-serif";
                            ctx.fillText("+" + (cell.length - 1), cx + rR + 6, y + 22);
                        }
                        // circled out number, bottom-right — which out of the inning
                        const outNo = cell.map((e) => e.out).find((o) => o);
                        if (outNo) {
                            const oR = Math.min(11, cellW * 0.13);
                            const ox = cx + cellW / 2 - oR - 3;
                            const oy = y + cellH - 22;
                            ctx.beginPath();
                            ctx.arc(ox, oy, oR, 0, Math.PI * 2);
                            ctx.fillStyle = "#FAF6EC";
                            ctx.fill();
                            ctx.strokeStyle = "#9A938A";
                            ctx.lineWidth = 1.5;
                            ctx.stroke();
                            ctx.fillStyle = "#4A443C";
                            ctx.font = `700 ${Math.round(oR * 1.5)}px 'Saira Condensed', sans-serif`;
                            ctx.textAlign = "center";
                            ctx.fillText(String(outNo), ox, oy + oR * 0.55);
                        }
                    }
                }
                // stat columns
                const st = game.stats[side][r] || { ab: 0, r: 0, h: 0, bb: 0 };
                ctx.fillStyle = ink;
                ctx.font = "700 24px 'Saira Condensed', sans-serif";
                ctx.textAlign = "center";
                [st.ab, st.r, st.h, st.bb].forEach((v, i) => {
                    ctx.fillText(String(v), gridX + cellW * innCount + statW * i + statW / 2, y + cellH / 2 + 8);
                });
            });
            // grid lines
            ctx.strokeStyle = grid;
            ctx.lineWidth = 1.5;
            for (let r = 0; r <= lineup.length; r++) {
                const y = rowsTop + r * cellH;
                ctx.beginPath();
                ctx.moveTo(40, y);
                ctx.lineTo(W - 40, y);
                ctx.stroke();
            }
            for (let i = 0; i <= innCount; i++) {
                const x = gridX + cellW * i;
                ctx.beginPath();
                ctx.moveTo(x, rowsTop);
                ctx.lineTo(x, rowsTop + lineup.length * cellH);
                ctx.stroke();
            }
            for (let i = 1; i <= statCols.length; i++) {
                const x = gridX + cellW * innCount + statW * i;
                ctx.beginPath();
                ctx.moveTo(x, rowsTop);
                ctx.lineTo(x, rowsTop + lineup.length * cellH);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(40, rowsTop);
            ctx.lineTo(40, rowsTop + lineup.length * cellH);
            ctx.stroke();
            // runs-by-inning footer
            const fy = rowsTop + lineup.length * cellH + 44;
            ctx.textAlign = "left";
            ctx.fillStyle = ink;
            ctx.font = "700 26px 'Saira Condensed', sans-serif";
            ctx.fillText("RUNS", 48, fy);
            ctx.textAlign = "center";
            ctx.font = "700 26px 'Saira Condensed', sans-serif";
            for (let i = 0; i < innCount; i++) {
                const rv = game.linescore[skipped + i] ? game.linescore[skipped + i][side] : null;
                ctx.fillText(rv === null || rv === undefined ? "-" : String(rv), gridX + cellW * i + cellW / 2, fy);
            }
            ctx.fillStyle = "#7A746B";
            ctx.font = "600 20px 'Saira Condensed', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("DUGOUTIQ — YOUR SCOREBOOK JUST UPGRADED", W / 2, H - 28);
            resolve(c);
        };
        const img = new Image();
        img.onload = () => finish(img);
        img.onerror = () => finish(null);
        img.src = LOGO;
    });
    // Tall, branded box score — visitor (batting then pitching) then home.
    const drawBoxScoreCanvas = () => new Promise((resolve) => {
        const W = 1080, M = 40;
        const navy = "#1D2D5C", amber = "#F5C518", ink = "#1C2438", linec = "#E1E5EE";
        const headerH = 210;
        const aLU = game.lineup.away, hLU = game.lineup.home;
        const aP = game.pitchers.away, hP = game.pitchers.home;
        const innN = Math.max(game.linescore.length, 1);
        const battH = (n) => 142 + 40 * n;
        const lsH = 34 + 2 * 38 + 28;
        const H = headerH + 36 + lsH +
            battH(aLU.length) + battH(aP.length) + battH(hLU.length) + battH(hP.length) + 760;
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const ctx = c.getContext("2d");
        const finish = (logoImg) => {
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = navy;
            ctx.fillRect(0, 0, W, headerH);
            ctx.fillStyle = amber;
            ctx.fillRect(0, headerH, W, 6);
            if (logoImg) {
                const lw = 150, lh = (logoImg.height / logoImg.width) * lw;
                ctx.drawImage(logoImg, 40, 40, lw, lh);
            }
            ctx.textAlign = "left";
            ctx.fillStyle = amber;
            ctx.font = "700 30px 'Saira Condensed', sans-serif";
            ctx.fillText("OFFICIAL BOX SCORE", 210, 72);
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "700 42px 'Saira Condensed', sans-serif";
            ctx.fillText(`${teams.away.name}  ${totals("away")} — ${totals("home")}  ${teams.home.name}`, 210, 118);
            ctx.fillStyle = "#A9C5E8";
            ctx.font = "400 24px 'Saira Condensed', sans-serif";
            const dstr = (game.date ? new Date(game.date + "T00:00:00") : new Date()).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
            ctx.fillText(`${game.over ? "Final" : "Live"}  ·  ${dstr}`, 210, 158);
            let y = headerH + 36;
            // linescore
            const lsNameW = 170;
            const lsCols = [];
            for (let i = 1; i <= innN; i++)
                lsCols.push(String(i));
            lsCols.push("R", "H", "E");
            const lsCW = (W - 2 * M - lsNameW) / lsCols.length;
            ctx.fillStyle = navy;
            ctx.fillRect(M, y, W - 2 * M, 34);
            ctx.textAlign = "center";
            ctx.font = "700 18px 'Saira Condensed', sans-serif";
            lsCols.forEach((cn, i) => {
                ctx.fillStyle = (cn === "R" || cn === "H" || cn === "E") ? amber : "#FFFFFF";
                ctx.fillText(cn, M + lsNameW + lsCW * i + lsCW / 2, y + 22);
            });
            y += 34;
            const lsRow = (nm, side) => {
                ctx.textAlign = "left";
                ctx.fillStyle = ink;
                ctx.font = "700 20px 'Saira Condensed', sans-serif";
                ctx.fillText(nm.toUpperCase().slice(0, 16), M + 10, y + 25);
                ctx.textAlign = "center";
                for (let i = 0; i < innN; i++) {
                    const cell = game.linescore[i] || {};
                    const v = cell[side];
                    const disp = side === "home" && cell.homeX ? "X" : v == null ? "-" : String(v);
                    ctx.font = "400 19px 'Saira Condensed', sans-serif";
                    ctx.fillStyle = ink;
                    ctx.fillText(disp, M + lsNameW + lsCW * i + lsCW / 2, y + 25);
                }
                [totals(side), game.hits[side], game.errors[side]].forEach((v, j) => {
                    ctx.font = "700 20px 'Saira Condensed', sans-serif";
                    ctx.fillStyle = navy;
                    ctx.fillText(String(v), M + lsNameW + lsCW * (innN + j) + lsCW / 2, y + 25);
                });
                ctx.strokeStyle = linec;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(M, y + 37);
                ctx.lineTo(W - M, y + 37);
                ctx.stroke();
                y += 38;
            };
            lsRow(teams.away.name, "away");
            lsRow(teams.home.name, "home");
            y += 28;
            const nameW = 360;
            const drawTable = (title, cols, rows, totalsRow) => {
                ctx.textAlign = "left";
                ctx.fillStyle = navy;
                ctx.font = "700 24px 'Saira Condensed', sans-serif";
                ctx.fillText(title, M, y + 22);
                y += 34;
                const cw = (W - 2 * M - nameW) / cols.length;
                ctx.fillStyle = navy;
                ctx.fillRect(M, y, W - 2 * M, 36);
                ctx.textAlign = "center";
                ctx.font = "700 19px 'Saira Condensed', sans-serif";
                ctx.fillStyle = "#FFFFFF";
                cols.forEach((cn, i) => ctx.fillText(cn, M + nameW + cw * i + cw / 2, y + 24));
                y += 36;
                rows.forEach((r) => {
                    ctx.textAlign = "left";
                    ctx.fillStyle = ink;
                    ctx.font = "400 23px 'Saira Condensed', sans-serif";
                    ctx.fillText(String(r.label).slice(0, 26), M + 10, y + 27);
                    ctx.textAlign = "center";
                    ctx.font = "400 22px 'Saira Condensed', sans-serif";
                    r.vals.forEach((v, i) => ctx.fillText(String(v), M + nameW + cw * i + cw / 2, y + 27));
                    ctx.strokeStyle = linec;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(M, y + 40);
                    ctx.lineTo(W - M, y + 40);
                    ctx.stroke();
                    y += 40;
                });
                ctx.textAlign = "left";
                ctx.fillStyle = navy;
                ctx.font = "700 23px 'Saira Condensed', sans-serif";
                ctx.fillText("Totals", M + 10, y + 27);
                ctx.textAlign = "center";
                ctx.font = "700 22px 'Saira Condensed', sans-serif";
                totalsRow.forEach((v, i) => ctx.fillText(String(v), M + nameW + cw * i + cw / 2, y + 27));
                y += 50;
            };
            const posLabel = (p) => {
                const h = Array.isArray(p.posHist) && p.posHist.length ? p.posHist : (p.pos ? [p.pos] : []);
                return h.join("-");
            };
            const battingRows = (lineup, side) => lineup.map((p, i) => {
                const s = game.stats[side][i] || { ab: 0, r: 0, h: 0, rbi: 0, bb: 0, k: 0 };
                const num = p.num ? ` #${p.num}` : "";
                const pl = posLabel(p);
                const label = `${p.name}${num}${pl ? `  ${pl}` : ""}`;
                return { label, vals: [s.ab, s.r, s.h, s.rbi, s.bb, s.k] };
            });
            const battingTot = (side, n) => {
                const t = [0, 0, 0, 0, 0, 0];
                for (let i = 0; i < n; i++) {
                    const s = game.stats[side][i] || {};
                    t[0] += s.ab || 0;
                    t[1] += s.r || 0;
                    t[2] += s.h || 0;
                    t[3] += s.rbi || 0;
                    t[4] += s.bb || 0;
                    t[5] += s.k || 0;
                }
                return t;
            };
            const pitchingRows = (arr) => arr.map((p) => ({
                label: pLabel(p), vals: [ipDisplay(p.outs), p.h, p.r, Math.max(0, p.r - (p.uer || 0)), p.bb, p.k, p.hr],
            }));
            const pitchingTot = (arr) => {
                let o = 0, h = 0, r = 0, er = 0, bb = 0, k = 0, hr = 0;
                arr.forEach((p) => { o += p.outs; h += p.h; r += p.r; er += Math.max(0, p.r - (p.uer || 0)); bb += p.bb; k += p.k; hr += p.hr; });
                return [ipDisplay(o), h, r, er, bb, k, hr];
            };
            const BAT = ["AB", "R", "H", "RBI", "BB", "SO"];
            const PIT = ["IP", "H", "R", "ER", "BB", "SO", "HR"];
            const noteCat = (players, label, alwaysCount) => {
                const parts = players
                    .filter((p) => p.n > 0)
                    .map((p) => (p.n > 1 || alwaysCount ? `${p.name} ${p.n}` : p.name));
                return parts.length ? `${label}: ${parts.join(", ")}` : "";
            };
            // errors charged to this team's fielders, plus passed balls
            const defenseNotes = (side) => {
                const lines = [];
                const errs = (game.errLog || []).filter((e) => e.side === side);
                if (errs.length) {
                    const tally = {};
                    errs.forEach((e) => {
                        const key = e.name || (e.pos ? `Position ${e.pos}` : "Unassigned");
                        tally[key] = (tally[key] || 0) + 1;
                    });
                    lines.push(`E: ${Object.entries(tally).map(([k, v]) => (v > 1 ? `${k} ${v}` : k)).join(", ")}`);
                }
                const pb = (game.pb && game.pb[side]) || 0;
                if (pb) {
                    const c = ((game.lineup && game.lineup[side]) || []).find((p) => p.pos === "C");
                    lines.push(`PB: ${c ? c.name : "Catcher"}${pb > 1 ? ` ${pb}` : ""}`);
                }
                return lines;
            };
            const battingNotes = (lineup, side) => {
                const col = (key) => lineup.map((p, i) => ({ name: p.name, n: (game.stats[side][i] || {})[key] || 0 }));
                const tb = lineup.map((p, i) => {
                    const s = game.stats[side][i] || {};
                    return { name: p.name, n: (s.h || 0) + (s.x2b || 0) + 2 * (s.x3b || 0) + 3 * (s.xhr || 0) };
                });
                return [
                    noteCat(col("x2b"), "2B"),
                    noteCat(col("x3b"), "3B"),
                    noteCat(col("xhr"), "HR"),
                    noteCat(tb, "TB", true),
                    noteCat(col("sac"), "SAC"),
                    noteCat(col("hbp"), "HBP"),
                ].filter(Boolean);
            };
            const pitchingNotes = (arr) => {
                const ps = arr.filter((p) => (p.pitches || 0) > 0).map((p) => `${p.name} ${p.pitches || 0}-${p.strikes || 0}`);
                const bf = arr.filter((p) => (p.bf || 0) > 0).map((p) => `${p.name} ${p.bf || 0}`);
                const wps = arr.filter((p) => (p.wp || 0) > 0).map((p) => (p.wp > 1 ? `${p.name} ${p.wp}` : p.name));
                const lines = [];
                if (ps.length)
                    lines.push(`P-S: ${ps.join(", ")}`);
                if (bf.length)
                    lines.push(`BF: ${bf.join(", ")}`);
                if (wps.length)
                    lines.push(`WP: ${wps.join(", ")}`);
                return lines;
            };
            const drawNotes = (lines) => {
                if (!lines.length) {
                    y += 8;
                    return;
                }
                ctx.textAlign = "left";
                ctx.font = "400 19px 'Saira Condensed', sans-serif";
                ctx.fillStyle = "#5A6478";
                const maxW = W - 2 * M;
                lines.forEach((line) => {
                    const words = line.split(" ");
                    let cur = "";
                    const flush = () => { ctx.fillText(cur, M, y + 15); y += 24; cur = ""; };
                    words.forEach((w) => {
                        const t = cur ? cur + " " + w : w;
                        if (ctx.measureText(t).width > maxW) {
                            flush();
                            cur = w;
                        }
                        else
                            cur = t;
                    });
                    if (cur)
                        flush();
                });
                y += 12;
            };
            drawTable(`${teams.away.name.toUpperCase()} — BATTING`, BAT, battingRows(aLU, "away"), battingTot("away", aLU.length));
            drawNotes(battingNotes(aLU, "away").concat(defenseNotes("away")));
            drawTable(`${teams.away.name.toUpperCase()} — PITCHING`, PIT, pitchingRows(aP), pitchingTot(aP));
            drawNotes(pitchingNotes(aP));
            drawTable(`${teams.home.name.toUpperCase()} — BATTING`, BAT, battingRows(hLU, "home"), battingTot("home", hLU.length));
            drawNotes(battingNotes(hLU, "home").concat(defenseNotes("home")));
            drawTable(`${teams.home.name.toUpperCase()} — PITCHING`, PIT, pitchingRows(hP), pitchingTot(hP));
            drawNotes(pitchingNotes(hP));
            const footerTop = y + 6;
            ctx.fillStyle = navy;
            ctx.fillRect(0, footerTop, W, 70);
            ctx.fillStyle = amber;
            ctx.fillRect(0, footerTop, W, 4);
            ctx.textAlign = "left";
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "700 22px 'Saira Condensed', sans-serif";
            ctx.fillText("DugoutIQ — Manage the Game", M, footerTop + 44);
            ctx.textAlign = "right";
            ctx.fillStyle = "#A9C5E8";
            ctx.font = "400 20px 'Saira Condensed', sans-serif";
            ctx.fillText("DugoutIQ.ca", W - M, footerTop + 44);
            const finalH = footerTop + 70;
            const out = document.createElement("canvas");
            out.width = W;
            out.height = finalH;
            out.getContext("2d").drawImage(c, 0, 0);
            resolve(out);
        };
        const img = new Image();
        img.onload = () => finish(img);
        img.onerror = () => finish(null);
        img.src = LOGO;
    });
    const shareScorebook = async (side) => {
        setBookChoose(false);
        try {
            const c = await drawScorebookCanvas(side);
            const dataUrl = c.toDataURL("image/png");
            const blob = await new Promise((res) => c.toBlob(res, "image/png"));
            const file = new File([blob], `dugoutiq-scorebook-${side}.png`, { type: "image/png" });
            const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
            setRecapPreview({
                dataUrl,
                canShare,
                title: `${teams[side].name} — scorebook page`,
                fname: `dugoutiq-scorebook-${side}.png`,
            });
        }
        catch (_a) {
            mutate((g) => (g.lastPlay = "Couldn't create the scorebook on this device"));
        }
    };
    const shareImageRecap = async () => {
        setShareOpen(false);
        try {
            const c = await drawRecapCanvas();
            const dataUrl = c.toDataURL("image/png");
            const blob = await new Promise((res) => c.toBlob(res, "image/png"));
            const file = new File([blob], "dugoutiq-recap.png", { type: "image/png" });
            const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
            setRecapPreview({ dataUrl, canShare });
        }
        catch (_a) {
            mutate((g) => (g.lastPlay = "Couldn't create the score graphic on this device"));
        }
    };
    const shareBoxScore = async () => {
        setShareOpen(false);
        try {
            const c = await drawBoxScoreCanvas();
            const dataUrl = c.toDataURL("image/png");
            const blob = await new Promise((res) => c.toBlob(res, "image/png"));
            const file = new File([blob], "dugoutiq-boxscore.png", { type: "image/png" });
            const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
            setRecapPreview({
                dataUrl,
                canShare,
                title: `${teams.away.name} ${totals("away")}, ${teams.home.name} ${totals("home")} — box score`,
                fname: "dugoutiq-boxscore.png",
            });
        }
        catch (_a) {
            mutate((g) => (g.lastPlay = "Couldn't create the box score on this device"));
        }
    };
    // BNS-style pitch count sheet as a printable image
    const drawPitchSheetCanvas = () => {
        const dv = (game.division || division) || "";
        const innCount = Math.min(Math.max(game.linescore.length, 7), 9);
        const W = 1600;
        const m = 60;
        const nameW = 300;
        const restW = 150;
        const innW = (W - m * 2 - nameW - restW) / innCount;
        const rowH = 44;
        const headH = 44;
        const blockGap = 46;
        const rowsFor = (side) => Math.max(game.pitchers[side].length, 6);
        const blockH = (side) => 34 + headH + rowsFor(side) * rowH;
        const refTop = 210 + blockH("home") + blockGap + blockH("away") + blockGap;
        const H = refTop + 300;
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const ctx = c.getContext("2d");
        const ink = "#141414";
        const grid = "#444";
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = ink;
        ctx.textAlign = "center";
        ctx.font = "700 42px 'Saira Condensed', sans-serif";
        ctx.fillText("PITCH COUNT SHEET", W / 2, 78);
        ctx.fillStyle = ink;
        ctx.font = "600 26px 'Saira Condensed', sans-serif";
        // Two columns: left grows right from the margin, right grows LEFT from
        // the margin, so a long club name can never run off the sheet.
        const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "\u2026" : s);
        const rowL = (label, value, y) => {
            ctx.textAlign = "left";
            ctx.fillText(`${label}  ${value}`, m, y);
        };
        const rowR = (label, value, y) => {
            ctx.textAlign = "right";
            ctx.fillText(`${label}  ${value}`, W - m, y);
        };
        rowL("Home Team:", clip(teams.home.name, 28), 158);
        rowR("Visiting Team:", clip(teams.away.name, 28), 158);
        rowL("Game Date:", game.date || new Date().toISOString().slice(0, 10), 194);
        rowR("Division:", dv || "______", 194);
        ctx.textAlign = "left";
        const drawBlock = (side, top) => {
            ctx.textAlign = "left"; // drawBlock leaves textAlign centered — reset on entry
            ctx.font = "700 26px 'Saira Condensed', sans-serif";
            ctx.fillStyle = ink;
            ctx.fillText(side === "home" ? "HOME TEAM" : "VISITING TEAM", m, top + 24);
            const t0 = top + 34;
            const rows = rowsFor(side);
            const cols = [nameW];
            for (let i = 0; i < innCount; i++)
                cols.push(innW);
            cols.push(restW);
            // grid
            ctx.strokeStyle = grid;
            ctx.lineWidth = 1.5;
            let x = m;
            const tableW = W - m * 2;
            const tableH = headH + rows * rowH;
            ctx.strokeRect(m, t0, tableW, tableH);
            cols.slice(0, -1).forEach((w) => {
                x += w;
                ctx.beginPath();
                ctx.moveTo(x, t0);
                ctx.lineTo(x, t0 + tableH);
                ctx.stroke();
            });
            for (let r = 0; r <= rows; r++) {
                const y = t0 + headH + r * rowH;
                if (r < rows) {
                    ctx.beginPath();
                    ctx.moveTo(m, y);
                    ctx.lineTo(m + tableW, y);
                    ctx.stroke();
                }
            }
            // header labels
            ctx.font = "700 22px 'Saira Condensed', sans-serif";
            ctx.fillStyle = ink;
            ctx.textAlign = "left";
            ctx.fillText("Pitcher", m + 12, t0 + 30);
            ctx.textAlign = "center";
            for (let i = 0; i < innCount; i++) {
                const label = i < 7 ? String(i + 1) : `Extra (${i + 1})`;
                ctx.fillText(label, m + nameW + innW * i + innW / 2, t0 + 30);
            }
            ctx.fillText("Days Rest", m + tableW - restW / 2, t0 + 30);
            // rows
            game.pitchers[side].forEach((pp, r) => {
                const yTxt = t0 + headH + r * rowH + 30;
                const row = pitchSheetRow(pp, innCount);
                ctx.textAlign = "left";
                ctx.font = "600 22px 'Saira Condensed', sans-serif";
                ctx.fillText((pp.num ? `#${pp.num} ${pp.name}` : pp.name).slice(0, 24), m + 12, yTxt);
                ctx.textAlign = "center";
                ctx.font = "500 22px 'Saira Condensed', sans-serif";
                for (let i = 0; i < innCount; i++) {
                    const txt = sheetCellText(pp, row, i);
                    if (txt)
                        ctx.fillText(txt, m + nameW + innW * i + innW / 2, yTxt);
                }
                const rest = dv ? String(daysRestFor(dv, creditedOf(pp))) : "";
                if (rest)
                    ctx.fillText(rest, m + tableW - restW / 2, yTxt);
            });
        };
        const homeTop = 210;
        drawBlock("home", homeTop);
        drawBlock("away", homeTop + blockH("home") + blockGap);
        // reference table (selected division highlighted)
        const rTop = refTop;
        const rCols = [110, 150, 150, 150, 150, 150, 110];
        const rW = rCols.reduce((a, b) => a + b, 0);
        const rRowH = 36;
        const heads = ["Division", "No Rest", "1 Day Rest", "2 Days Rest", "3 Days Rest", "4 Days Rest", "Max"];
        ctx.strokeStyle = grid;
        const divs = Object.keys(PITCH_DIVISIONS);
        ctx.strokeRect(m, rTop, rW, rRowH * (divs.length + 1));
        let rx = m;
        rCols.slice(0, -1).forEach((w) => {
            rx += w;
            ctx.beginPath();
            ctx.moveTo(rx, rTop);
            ctx.lineTo(rx, rTop + rRowH * (divs.length + 1));
            ctx.stroke();
        });
        ctx.textAlign = "center";
        ctx.font = "700 19px 'Saira Condensed', sans-serif";
        ctx.fillStyle = ink;
        heads.forEach((h, i) => {
            const cx = m + rCols.slice(0, i).reduce((a, b) => a + b, 0) + rCols[i] / 2;
            ctx.fillText(h, cx, rTop + 25);
        });
        divs.forEach((d, r) => {
            const y0 = rTop + rRowH * (r + 1);
            if (d === dv) {
                ctx.fillStyle = "rgba(43,90,160,.15)";
                ctx.fillRect(m + 1, y0 + 1, rW - 2, rRowH - 2);
            }
            ctx.beginPath();
            ctx.moveTo(m, y0);
            ctx.lineTo(m + rW, y0);
            ctx.stroke();
            const t = PITCH_DIVISIONS[d];
            const vals = [d, `1 - ${t[0]}`, `${t[0] + 1} - ${t[1]}`, `${t[1] + 1} - ${t[2]}`, `${t[2] + 1} - ${t[3]}`, `${t[3] + 1} - ${t[4]}`, String(t[4])];
            ctx.fillStyle = ink;
            ctx.font = d === dv ? "700 19px 'Saira Condensed', sans-serif" : "500 19px 'Saira Condensed', sans-serif";
            vals.forEach((v, i) => {
                const cx = m + rCols.slice(0, i).reduce((a, b) => a + b, 0) + rCols[i] / 2;
                ctx.fillText(v, cx, y0 + 25);
            });
        });
        // signatures
        const sx = m + rW + 60;
        const sw = W - m - sx;
        ctx.textAlign = "left";
        ctx.font = "600 24px 'Saira Condensed', sans-serif";
        ctx.fillStyle = ink;
        ctx.fillText("Home Coach Signature:", sx, rTop + 60);
        ctx.beginPath();
        ctx.moveTo(sx, rTop + 90);
        ctx.lineTo(sx + sw, rTop + 90);
        ctx.stroke();
        ctx.fillText("Visiting Coach Signature:", sx, rTop + 150);
        ctx.beginPath();
        ctx.moveTo(sx, rTop + 180);
        ctx.lineTo(sx + sw, rTop + 180);
        ctx.stroke();
        return c;
    };
    const sharePitchSheet = async () => {
        setSheetOpen(false);
        try {
            const c = drawPitchSheetCanvas();
            const dataUrl = c.toDataURL("image/png");
            const blob = await new Promise((res) => c.toBlob(res, "image/png"));
            const file = new File([blob], "dugoutiq-pitchcount.png", { type: "image/png" });
            const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
            setRecapPreview({
                dataUrl,
                canShare,
                title: `${teams.home.name} vs ${teams.away.name} — pitch count sheet`,
                fname: "dugoutiq-pitchcount.png",
            });
        }
        catch (_a) {
            mutate((g) => (g.lastPlay = "Couldn't create the pitch count sheet on this device"));
        }
    };
    const shareRecapFile = async () => {
        if (!recapPreview)
            return;
        try {
            const blob = await (await fetch(recapPreview.dataUrl)).blob();
            const file = new File([blob], (recapPreview && recapPreview.fname) || "dugoutiq-recap.png", { type: "image/png" });
            await navigator.share({
                files: [file],
                title: `${teams.away.name} ${totals("away")}, ${teams.home.name} ${totals("home")} — DugoutIQ`,
            });
            setRecapPreview(null);
            mutate((g) => (g.lastPlay = "Score graphic shared"));
        }
        catch (err) {
            if (err && err.name === "AbortError")
                return; // user closed the share sheet
            mutate((g) => (g.lastPlay = "Sharing failed — long-press the image to save it instead"));
        }
    };
    const downloadRecapFile = () => {
        if (!recapPreview)
            return;
        const a = document.createElement("a");
        a.href = recapPreview.dataUrl;
        a.download = (recapPreview && recapPreview.fname) || "dugoutiq-recap.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        mutate((g) => (g.lastPlay = "Saved to your Downloads folder (Files app on iPhone)"));
    };
    const shareRecap = async () => {
        setShareOpen(false);
        const text = buildRecap();
        const title = `${teams.away.name} ${totals("away")}, ${teams.home.name} ${totals("home")} — DugoutIQ`;
        if (navigator.share) {
            try {
                await navigator.share({ title, text });
                mutate((g) => (g.lastPlay = "Recap shared"));
                return;
            }
            catch (err) {
                if (err && err.name === "AbortError")
                    return; // user closed the share sheet
            }
        }
        try {
            await navigator.clipboard.writeText(text);
            mutate((g) => (g.lastPlay = "Recap copied — paste into any message"));
        }
        catch (_a) {
            mutate((g) => (g.lastPlay = "Sharing isn't available on this device"));
        }
    };
    /* ---------------- small components ---------------- */
    const Lamp = ({ on, color, mini }) => (React.createElement("span", { className: `lamp ${mini ? "mini" : ""} ${on ? "on " + color : ""}`, "aria-hidden": "true" }));
    const Diamond = () => (React.createElement("svg", { ref: svgRef, viewBox: "0 -12 200 186", className: "diamond", role: "group", onPointerDown: basePointerDown, onPointerMove: basePointerMove, onPointerUp: basePointerUp, onPointerCancel: basePointerUp, "aria-label": "Baserunners \u2014 tap a base for options, drag a runner to move them" },
        React.createElement("rect", { x: "0", y: "-12", width: "200", height: "186", fill: "transparent", "data-capture": "1" }),
        React.createElement("path", { d: "M100 158 L172 86 L100 14 L28 86 Z", fill: "rgba(255,255,255,0.04)", stroke: "#3D6FB4", strokeWidth: "2", style: { pointerEvents: "none" } }),
        themeLogo && (React.createElement("image", { href: themeLogo, x: "68", y: "54", width: "64", height: "64", opacity: "0.45", preserveAspectRatio: "xMidYMid meet", style: { pointerEvents: "none" } })),
        [
            { base: "first", x: 172, y: 86, lx: 152, ly: 91, anchor: "end" },
            { base: "second", x: 100, y: 14, lx: 100, ly: 46, anchor: "middle" },
            { base: "third", x: 28, y: 86, lx: 48, ly: 91, anchor: "start" },
        ].map(({ base, x, y, lx, ly, anchor }) => (React.createElement("g", { key: base },
            React.createElement("g", { transform: `translate(${x} ${y}) rotate(45)`, className: "basegrab", role: "button", "aria-label": `${baseLabel(base)} base — ${game.bases[base]
                    ? `${runnerLabel(base)} on, tap for options or drag to move`
                    : "empty, tap to place runner"}` },
                React.createElement("rect", { x: "-13", y: "-13", width: "26", height: "26", rx: "3", "data-base": base, className: `basepad ${game.bases[base] ? "occ" : ""} ${drag && drag.moved && drag.from === base ? "dragging" : ""} ${drag && drag.moved && drag.occupied && drag.from !== base && !game.bases[base]
                        ? "droptarget"
                        : ""}` })),
            game.bases[base] && (React.createElement("text", { x: lx, y: ly, textAnchor: anchor, className: "base-name" }, runnerLabel(base).slice(0, 10)))))),
        React.createElement("g", { transform: "translate(100 158)" },
            React.createElement("circle", { r: "17", fill: "transparent", "data-base": "home" }),
            React.createElement("path", { d: "M-11 -6 L11 -6 L11 2 L0 11 L-11 2 Z", "data-base": "home", fill: "#FFFFFF", opacity: drag && drag.moved ? "1" : "0.85", className: drag && drag.moved ? "home-hot" : "" })),
        drag && drag.moved && drag.occupied && (React.createElement("circle", { cx: drag.x, cy: drag.y, r: "11", className: "ghost-runner" }))));
    /* ---------------- render ---------------- */
    return (React.createElement("div", { className: "dg-root", style: { "--accent": themeColor } },
        React.createElement("style", null, `
        @import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;700;800&family=Roboto+Mono:wght@500;700&display=swap');

        .dg-root {
          --navy: #1D2D5C;
          --navy-deep: #14204A;
          --royal: #134A8E;
          --line: #2B5AA0;
          --white: #FFFFFF;
          --powder: #A9C5E8;
          --red: #E8291C;
          --amberw: #F5C518;
          --accent: #1B57A0;
          min-height: 100vh;
          background:
            radial-gradient(1200px 600px at 50% -10%, var(--accent) 0%, var(--navy) 55%, var(--navy-deep) 100%);
          color: var(--white);
          font-family: 'Saira Condensed', system-ui, sans-serif;
          padding: 16px 12px 48px;
          box-sizing: border-box;
        }
        .dg-root *, .dg-root *::before { box-sizing: border-box; }
        .shell { max-width: 760px; margin: 0 auto; }

        .brand { position: relative; display: flex; justify-content: center; align-items: center; margin: 0 auto 10px; }
        .brand-logo { display: block; height: 88px; width: auto; max-width: 70%; object-fit: contain; margin: 0 auto; }
        .gear-btn { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,.06); border: 1px solid var(--line); border-radius: 12px; width: 44px; height: 44px; font-size: 22px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .gear-btn:active { transform: translateY(-50%) scale(.94); }

        /* ---- scoreboard header ---- */
        .board {
          display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px;
          align-items: stretch; margin-bottom: 14px;
        }
        .team-cell {
          background: var(--navy-deep); border: 1px solid var(--line);
          border-radius: 6px; padding: 10px 12px; text-align: center;
        }
        .team-cell .tname {
          font-size: 15px; font-weight: 700; letter-spacing: .12em;
          text-transform: uppercase; color: var(--powder);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .team-cell .tscore {
          font-family: 'Saira Condensed', sans-serif; font-weight: 700;
          font-size: 44px; line-height: 1; color: var(--white);
          text-shadow: 0 0 18px rgba(169,197,232,.45);
        }
        .team-cell.atbat { border-color: var(--white); }
        .team-custom { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
        .team-custom .swatch { width:22px; height:22px; border-radius:50%; border:2px solid rgba(255,255,255,.25); padding:0; cursor:pointer; }
        .team-custom .swatch.sel { border-color:#fff; box-shadow:0 0 0 2px rgba(255,255,255,.4); }
        .team-custom .swatch-custom { width:30px; height:26px; padding:0; border:none; background:none; cursor:pointer; }
        .team-custom .logo-btn { display:inline-flex; align-items:center; justify-content:center; min-width:60px; height:30px; padding:0 8px; border:1px dashed var(--line); border-radius:8px; color:var(--powder); font-size:13px; cursor:pointer; }
        .team-custom .logo-btn img { height:24px; width:24px; object-fit:contain; border-radius:4px; }
        .team-custom .logo-rm { width:24px; height:24px; border-radius:50%; border:none; background:rgba(51,65,85,.6); color:#fff; cursor:pointer; }
        .tlogo { height:22px; width:22px; object-fit:contain; vertical-align:middle; margin-right:6px; border-radius:4px; }
        .theme-bar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; background:rgba(255,255,255,.05); border:1px solid var(--line); border-radius:12px; padding:10px 14px; margin-bottom:14px; }
        .theme-bar .theme-label { font-weight:700; color:var(--white); font-size:15px; }
        .theme-bar .theme-swatches { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .inning-cell {
          display: flex; flex-direction: column; justify-content: center;
          align-items: center; padding: 0 14px;
        }
        .inning-cell .arrow { font-size: 14px; color: var(--red); line-height: 1; }
        .inning-cell .num {
          font-family: 'Saira Condensed', sans-serif; font-size: 34px;
          font-weight: 700; line-height: 1.05;
        }
        .inning-cell .lbl { font-size: 10px; letter-spacing: .3em; color: var(--powder); }

        /* ---- field row: lamps + diamond ---- */
        .fieldrow {
          display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 14px;
        }
        @media (min-width: 560px) { .fieldrow { grid-template-columns: 1fr 1fr; } }
        .lamps {
          display: flex; justify-content: center; align-items: center; gap: 22px;
          background: var(--navy-deep); border: 1px solid var(--line);
          border-radius: 6px; padding: 10px 8px 12px;
        }
        .lampgroup { text-align: center; }
        .lampgroup .glabel {
          font-size: 11px; letter-spacing: .28em; color: var(--powder);
          margin-bottom: 6px; text-transform: uppercase;
        }
        .lamp {
          display: inline-block; width: 16px; height: 16px; border-radius: 50%;
          background: #1A2C60; border: 1px solid #2B4480; margin: 0 4px;
          transition: background .12s, box-shadow .12s;
        }
        .lamp.on.white { background: var(--white); box-shadow: 0 0 12px var(--powder); border-color: var(--white); }
        .lamp.on.red { background: var(--red); box-shadow: 0 0 12px var(--red); border-color: var(--red); }
        button.pitchbtn {
          background: transparent; border: 1px solid var(--line); border-radius: 6px;
          padding: 4px 10px 2px; cursor: pointer; color: inherit;
          font-family: inherit;
        }
        button.pitchbtn:focus-visible { outline: 2px solid var(--white); outline-offset: 2px; }
        .pcount {
          font-family: 'Saira Condensed', sans-serif; font-weight: 700;
          font-size: 22px; line-height: 1; color: var(--white);
        }
        .plimit-tag {
          font-size: 9px; letter-spacing: .18em; font-weight: 800;
          color: var(--red); margin-top: 2px;
        }
        .plimit-tag.warn { color: var(--amberw); }
        button.pitchbtn.warn { border-color: var(--amberw); }
        button.pitchbtn.warn .pcount { color: var(--amberw); }
        button.pitchbtn.over {
          border-color: var(--red);
          animation: plimit-pulse 1.2s ease-in-out infinite;
        }
        button.pitchbtn.over .pcount { color: var(--red); }
        @keyframes plimit-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(232,41,28,.55); }
          50% { box-shadow: 0 0 0 7px rgba(232,41,28,0); }
        }
        .limitcard { margin-top: 16px; }
        .limitrow { display: grid; grid-template-columns: 90px 1fr; gap: 10px; align-items: center; }
        .limithint { font-size: 13px; color: var(--powder); letter-spacing: .04em; }
        .license-card { max-width: 420px; margin: 24px auto 0; }
        .license-sub { color: var(--powder); font-size: 14px; margin: 4px 0 14px; line-height: 1.4; }
        .license-in {
          font-family: 'Saira Condensed', sans-serif; letter-spacing: .08em;
          text-align: center; font-size: 14px; padding: 11px 8px;
        }
        .license-err { color: var(--red); font-size: 13px; margin-top: 8px; letter-spacing: .03em; }
        .license-foot { color: var(--powder); font-size: 11px; text-align: center; margin-top: 12px; letter-spacing: .06em; }
        .setup-msg {
          text-align: center; font-size: 13px; color: var(--amberw);
          letter-spacing: .05em; margin-top: 8px;
        }
        textarea.import-box {
          min-height: 110px; resize: vertical; margin-bottom: 12px;
          font-family: 'Saira Condensed', sans-serif; font-size: 11px;
        }

        .diamond-card {
          position: relative; margin-bottom: 14px;
          background: var(--navy-deep); border: 1px solid var(--line);
          border-radius: 6px; padding: 22px 8px 8px; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .diamond { width: 100%; max-width: 250px; height: auto; touch-action: none; }
        .count-corner { position: absolute; left: 12px; bottom: 12px; }
        .crow { display: flex; align-items: center; gap: 4px; margin-top: 4px; }
        .crow span {
          width: 12px; font-size: 11px; font-weight: 800; color: var(--powder);
          letter-spacing: .05em;
        }
        .lamp.mini { width: 11px; height: 11px; margin: 0; }
        .diamond-card .pitchbtn.corner-r {
          position: absolute; right: 12px; bottom: 12px; padding: 4px 8px 3px;
        }
        .diamond-card .pitchbtn.corner-r .pcount { font-size: 18px; }
        .diamond-hint {
          position: absolute; top: 6px; left: 0; right: 0;
          font-size: 10px; letter-spacing: .18em; color: var(--powder);
          text-transform: uppercase; text-align: center;
        }
        .basegrab { cursor: grab; touch-action: none; }
        .basepad {
          fill: #1A2C60; stroke: #3D6FB4; stroke-width: 2;
          transition: fill .12s, filter .12s, opacity .12s;
        }
        .basepad.occ {
          fill: var(--white); stroke: var(--white);
          filter: drop-shadow(0 0 8px rgba(255,255,255,.7));
        }
        .basepad.dragging { opacity: .35; }
        .basepad.droptarget {
          stroke: var(--amberw); stroke-dasharray: 5 3;
          fill: rgba(245, 197, 24, .22);
          filter: drop-shadow(0 0 8px rgba(245, 197, 24, .65));
        }
        .ghost-runner {
          fill: var(--white); opacity: .9; pointer-events: none;
          filter: drop-shadow(0 0 10px rgba(255,255,255,.8));
        }
        .home-hot { filter: drop-shadow(0 0 9px rgba(255,255,255,.9)); }
        .base-name {
          fill: var(--white); font-family: 'Saira Condensed', sans-serif;
          font-size: 12px; font-weight: 700; letter-spacing: .04em;
          pointer-events: none; paint-order: stroke;
          stroke: rgba(20,32,74,.85); stroke-width: 3px;
        }


        /* ---- linescore ---- */
        .linescore-wrap { overflow-x: auto; margin-bottom: 14px; border-radius: 6px; border: 1px solid var(--line); }
        table.linescore { border-collapse: collapse; width: 100%; min-width: 480px; background: var(--navy-deep); }
        .linescore th, .linescore td {
          font-family: 'Saira Condensed', sans-serif; font-size: 14px;
          padding: 6px 9px; text-align: center; border-bottom: 1px solid var(--line);
        }
        .linescore th { color: var(--powder); font-weight: 500; font-size: 11px; }
        .linescore td.tm { font-family: 'Saira Condensed'; font-weight: 700; letter-spacing: .08em; text-align: left; text-transform: uppercase; font-size: 13px; }
        .linescore td.rhe { color: var(--white); font-weight: 700; border-left: 1px solid var(--line); }
        .linescore td.cur { background: var(--royal); }

        .ticker {
          text-align: center; font-size: 15px; letter-spacing: .06em;
          color: var(--powder); min-height: 22px; margin-bottom: 12px;
        }
        .ticker-btn { width: 100%; background: none; border: none; cursor: pointer; }
        .ticker-hint { color: var(--line); font-size: 12px; letter-spacing: .04em; }
        .pbp-list { max-height: 60vh; overflow-y: auto; text-align: left; margin: 6px 0 12px; }
        .pbp-inn { font-weight: 700; color: var(--amberw); font-size: 13px; letter-spacing: .08em; margin: 10px 0 4px; }
        .pbp-row { margin-bottom: 4px; }
        .pbp-tap { display: block; width: 100%; text-align: left; background: rgba(255,255,255,.04); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; cursor: pointer; color: var(--white); }
        .pbp-bat { font-weight: 700; margin-right: 8px; }
        .pbp-text { color: var(--powder); }
        .pbp-seq { display: block; font-size: 11px; color: var(--line); margin-top: 3px; letter-spacing: .04em; }
        .pbp-edit { display: flex; gap: 6px; align-items: center; }
        .pbp-edit .dg-in { flex: 1; }

        .atbat-card {
          background: var(--navy-deep); border: 1px solid var(--line);
          border-radius: 6px; padding: 12px 14px; margin-bottom: 12px;
          display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
          width: 100%; cursor: pointer; text-align: left; color: inherit;
          font-family: inherit;
        }
        .atbat-card:active { border-color: var(--powder); }
        .atbat-edit { color: var(--powder); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; flex-shrink: 0; align-self: center; }
        .atbat-card .who { font-size: 20px; font-weight: 700; letter-spacing: .04em; }
        .atbat-card .who small { color: var(--powder); font-weight: 500; margin-left: 6px; }
        .atbat-card .statline { font-family: 'Saira Condensed', sans-serif; font-size: 12px; color: var(--powder); white-space: nowrap; }

        /* ---- opposing pitcher strip ---- */
        button.d3k-banner {
          width: 100%; margin-bottom: 8px; padding: 10px 8px;
          background: transparent; border: 1px dashed var(--amberw); border-radius: 8px;
          color: var(--amberw); font-family: 'Saira Condensed', sans-serif;
          font-size: 14px; letter-spacing: .04em; cursor: pointer;
        }
        button.d3k-banner strong { font-weight: 700; }
        button.d3k-banner.tagup { border-color: var(--powder); color: var(--powder); }
        table.lineup tr.retired td { color: var(--powder); opacity: .7; font-style: italic; }
        table.lineup tr.retired em { font-style: normal; opacity: .8; }
        .sub-list { display: flex; flex-direction: column; gap: 5px; max-height: 30vh; overflow-y: auto; margin-bottom: 8px; }
        button.sub-row {
          display: flex; justify-content: space-between; align-items: center; gap: 8px;
          background: #18295A; border: 1px solid var(--line); border-radius: 6px;
          padding: 9px 10px; color: var(--white); font-family: 'Saira Condensed', sans-serif;
          font-size: 15px; text-align: left; cursor: pointer;
        }
        button.sub-row.sel { border-color: var(--amberw); background: #1E335F; }
        .sub-tag { font-size: 12px; color: var(--amberw); font-weight: 700; white-space: nowrap; }
        .sub-form { display: flex; gap: 6px; align-items: stretch; margin-bottom: 6px; }
        .sub-form .dg-in { flex: 1; }
        .sub-hint { font-size: 11.5px; color: var(--powder); opacity: .85; margin: 7px 0 0; line-height: 1.35; }
        .sub-hint b { color: var(--white); font-weight: 700; }
        .order-state { font-size: 12px; color: var(--amberw); margin: 0 0 8px; letter-spacing: .02em; }
        button.rm-spot { width: 100%; margin-top: 8px; color: var(--red); border-color: var(--line); font-size: 13px; }
        .pn-wrap { display: flex; align-items: center; gap: 5px; }
        .pn-wrap .dg-in { max-width: 96px; }
        .pn-wrap .jersey-in { width: 40px; min-width: 40px; flex: none; }
        b.dtag {
          background: var(--amber); color: var(--deep); border-radius: 4px;
          font-family: 'Saira Condensed', sans-serif; font-size: 11px; font-weight: 700;
          padding: 1px 5px; letter-spacing: .02em;
        }
        .uer-row {
          display: flex; justify-content: space-between; align-items: center;
          margin-top: 10px; font-family: 'Saira Condensed', sans-serif;
          font-size: 13px; color: var(--powder);
        }
        .uer-ctl { display: flex; align-items: center; gap: 8px; }
        .uer-ctl button.dg { padding: 4px 12px; font-size: 16px; }
        .uer-ctl b { font-family: 'Saira Condensed', sans-serif; min-width: 16px; text-align: center; color: var(--white); }
        .dec-block { margin-bottom: 12px; }
        .dec-label { font-family: 'Saira Condensed', sans-serif; font-weight: 700; font-size: 14px; color: var(--powder); margin-bottom: 5px; letter-spacing: .03em; }
        .dec-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .dec-row button.dg { flex: 0 1 auto; padding: 8px 12px; font-size: 14px; }
        .dec-note { font-size: 12px; color: var(--powder); opacity: .8; margin-top: 4px; }
        button.pstrip {
          width: 100%; display: flex; justify-content: space-between; align-items: baseline;
          gap: 10px; flex-wrap: wrap; cursor: pointer; text-align: left;
          background: var(--navy-deep); border: 1px solid var(--line); border-radius: 6px;
          padding: 8px 12px; margin-bottom: 12px; color: var(--white);
          font-family: 'Saira Condensed', sans-serif;
        }
        button.pstrip:focus-visible { outline: 2px solid var(--white); outline-offset: 2px; }
        .pstrip-who { font-size: 15px; font-weight: 700; letter-spacing: .04em; }
        .pstrip-who small { color: var(--powder); font-weight: 500; }
        .pstrip-line { font-family: 'Saira Condensed', sans-serif; font-size: 11px; color: var(--powder); }
        .pstrip-np { font-family: 'Saira Condensed', sans-serif; font-size: 12px; font-weight: 700; }
        button.pstrip.warn { border-color: var(--amberw); }
        button.pstrip.warn .pstrip-np { color: var(--amberw); }
        button.pstrip.over { border-color: var(--red); animation: plimit-pulse 1.2s ease-in-out infinite; }
        button.pstrip.over .pstrip-np { color: var(--red); }

        /* ---- buttons ---- */
        .btnrow { display: grid; gap: 8px; margin-bottom: 8px; }
        .r3 { grid-template-columns: repeat(3, 1fr); }
        .r4 { grid-template-columns: repeat(4, 1fr); }
        .r5 { grid-template-columns: repeat(5, 1fr); }
        .r5 button.dg { font-size: 14px; padding: 12px 2px; }
        .r6 { grid-template-columns: repeat(6, 1fr); gap: 5px; }
        .r6 button.dg { font-size: 12px; padding: 12px 2px; letter-spacing: .02em; }
        button.dg {
          font-family: 'Saira Condensed', sans-serif; font-weight: 700;
          font-size: 16px; letter-spacing: .08em; text-transform: uppercase;
          padding: 12px 4px; border-radius: 6px; cursor: pointer;
          border: 1px solid var(--line); background: var(--royal); color: var(--white);
          transition: transform .05s, background .12s;
        }
        button.dg:active { transform: scale(.97); }
        button.dg:focus-visible { outline: 2px solid var(--white); outline-offset: 2px; }
        button.dg.count { background: #1B3E74; }
        button.dg.hit { background: var(--white); border-color: var(--white); color: var(--navy-deep); }
        button.dg.outb { background: #7E1812; border-color: var(--red); color: #FFD9D5; }
        button.dg.ghost { background: transparent; color: var(--powder); }
        button.dg:disabled { opacity: .35; cursor: default; }

        /* ---- lineup table ---- */
        .lineup-wrap { border: 1px solid var(--line); border-radius: 6px; overflow: hidden; margin-top: 16px; }
        .lineup-head {
          display: flex; justify-content: space-between; padding: 8px 12px;
          background: var(--navy-deep); font-size: 12px; letter-spacing: .25em;
          color: var(--powder); text-transform: uppercase;
        }
        table.lineup { width: 100%; border-collapse: collapse; background: rgba(20,32,74,.6); }
        .lineup td {
          padding: 8px 10px; border-top: 1px solid var(--line);
          font-size: 15px; cursor: pointer;
        }
        .lineup td.num { font-family: 'Saira Condensed', sans-serif; color: var(--powder); width: 28px; font-size: 12px; }
        .lineup td.stat { font-family: 'Saira Condensed', sans-serif; font-size: 12px; color: var(--powder); text-align: right; white-space: nowrap; }
        .lineup tr.cur td { background: var(--royal); color: var(--white); }
        .lineup tr.cur td.stat { color: var(--white); }

        /* ---- play-by-play log ---- */
        button.loghead {
          width: 100%; border: none; cursor: pointer; font-family: inherit;
          font-weight: 700;
        }
        button.loghead:focus-visible { outline: 2px solid var(--white); outline-offset: -2px; }
        .gamelog { max-height: 300px; overflow-y: auto; background: rgba(20,32,74,.6); }
        .log-row {
          display: grid; grid-template-columns: 34px 1fr; gap: 8px;
          padding: 6px 12px; border-top: 1px solid var(--line); font-size: 14px;
          align-items: baseline;
        }
        .log-inn {
          font-family: 'Saira Condensed', sans-serif; font-size: 11px;
          color: var(--powder);
        }
        .log-row.pa strong { color: var(--white); font-weight: 700; letter-spacing: .03em; }
        .log-seq { color: var(--powder); font-size: 13px; }
        .log-res { color: var(--white); }
        .log-open { color: var(--amberw); font-style: italic; font-size: 13px; }
        .log-row.info .log-txt { color: var(--powder); font-style: italic; font-size: 13px; }
        .log-row.play .log-txt { color: var(--white); }

        /* ---- pitcher log in modal ---- */
        .plog { margin-bottom: 12px; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
        .plog-row {
          display: grid; grid-template-columns: 1fr auto; align-items: center;
          gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--line);
          font-size: 13px; text-align: left;
        }
        .plog-row:last-child { border-bottom: none; }
        .plog-row.cur { background: var(--royal); }
        .plog-row.head { background: rgba(20,32,74,.8); }
        .plog-row.head .plog-stats span { color: var(--powder); font-size: 10px; }
        .plog-row.total { background: rgba(20,32,74,.8); }
        .plog-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .plog-name.done { color: var(--powder); }
        input.plog-name { max-width: 110px; padding: 4px 6px; font-size: 13px; }
        .plog-stats {
          display: grid; grid-template-columns: repeat(8, 27px);
          font-family: 'Saira Condensed', sans-serif; font-size: 12px;
          text-align: right; white-space: nowrap;
        }

        /* ---- setup ---- */
        .setup-grid { display: grid; gap: 18px; grid-template-columns: 1fr; }
        @media (min-width: 640px) { .setup-grid { grid-template-columns: 1fr 1fr; } }
        .setup-card { background: var(--navy-deep); border: 1px solid var(--line); border-radius: 6px; padding: 14px; }
        .setup-card h2 { margin: 0 0 10px; font-size: 13px; letter-spacing: .3em; color: var(--powder); text-transform: uppercase; font-weight: 700; }
        input.dg-in, select.dg-sel {
          font-family: 'Saira Condensed', sans-serif; font-size: 15px;
          background: #18295A; color: var(--white); border: 1px solid var(--line);
          border-radius: 4px; padding: 7px 8px; width: 100%;
        }
        input.dg-in:focus, select.dg-sel:focus { outline: 2px solid var(--white); outline-offset: 1px; }
        .prow {
          display: grid; grid-template-columns: 30px 46px 1fr 64px 24px; gap: 6px;
          align-items: center; margin-bottom: 6px; transition: transform .12s ease;
        }
        .jersey-in { text-align: center; padding: 0 4px; }
        .prow.dragging .dg-in, .prow.dragging .dg-sel { border-color: var(--amberw); }
        button.drag-handle {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 32px; padding: 0; background: transparent; border: 1px solid var(--line);
          border-radius: 4px; color: var(--powder); cursor: grab; touch-action: none;
          font-family: 'Saira Condensed', sans-serif; font-size: 11px; line-height: 1;
        }
        button.drag-handle:active { cursor: grabbing; border-color: var(--amberw); color: var(--amberw); }
        .drag-handle .grip { font-size: 9px; line-height: .7; opacity: .7; }
        .prow .n { font-family: 'Saira Condensed', sans-serif; font-size: 12px; color: var(--powder); text-align: right; }
        button.rm {
          background: transparent; border: 1px solid var(--line); border-radius: 4px;
          color: var(--powder); font-size: 16px; line-height: 1; height: 30px;
          cursor: pointer; padding: 0;
        }
        button.rm:hover { color: var(--red); border-color: var(--red); }
        button.dg.addrow { width: 100%; margin-top: 4px; font-size: 13px; padding: 8px 4px; border-style: dashed; }
        button.dg.rosterbtn { font-size: 11px; padding: 8px 4px; }
        button.roster-load {
          flex: 1; background: transparent; border: none; cursor: pointer; text-align: left;
          font-family: 'Saira Condensed', sans-serif; font-size: 15px; font-weight: 700;
          color: var(--white); padding: 4px 0;
        }
        button.roster-load:hover { color: var(--amberw); }
        .roster-n { color: var(--powder); font-weight: 500; font-size: 12px; }
        .teamname-in { margin-bottom: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }

        /* Scan lineup card — the fast path, sitting above the manual entry */
        .scan-bar {
          display: flex; align-items: center; gap: 12px; cursor: pointer;
          padding: 12px 14px; border-radius: 12px; margin-bottom: 12px;
          background: linear-gradient(180deg, rgba(43,90,160,.30), rgba(19,74,142,.18));
          border: 1px solid rgba(245,197,24,.35);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 8px 22px -12px rgba(0,0,0,.7);
          transition: border-color .15s, transform .06s, background .15s;
        }
        .scan-bar:hover { border-color: rgba(245,197,24,.65); background: linear-gradient(180deg, rgba(43,90,160,.40), rgba(19,74,142,.24)); }
        .scan-bar:active { transform: scale(.995); }
        .scan-bar.busy { cursor: default; opacity: .85; }
        .scan-bar:focus-within { outline: 2px solid var(--amber); outline-offset: 2px; }
        .scan-ico {
          flex: 0 0 auto; width: 38px; height: 38px; border-radius: 10px;
          display: grid; place-items: center; color: var(--navy);
          background: linear-gradient(180deg, #FFD84D, var(--amber));
          box-shadow: 0 6px 16px -6px rgba(245,197,24,.8);
        }
        .scan-txt { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
        .scan-txt b { font-size: 15px; letter-spacing: .02em; color: var(--white); font-weight: 700; }
        .scan-txt small { font-size: 11.5px; color: var(--powder); opacity: .85; }
        .scan-arrow { color: var(--powder); font-size: 20px; opacity: .55; flex: 0 0 auto; }
        .scan-spin {
          width: 17px; height: 17px; border-radius: 50%;
          border: 2px solid rgba(20,32,74,.35); border-top-color: var(--navy);
          animation: scanspin .7s linear infinite;
        }
        @keyframes scanspin { to { transform: rotate(360deg); } }
        .scan-msg { font-size: 12px; margin: -4px 2px 12px; line-height: 1.4; }
        .scan-msg.ok { color: #3ad07a; }
        .scan-msg.err { color: #E8915A; }

        /* ---- modal ---- */
        .modal-back {
          position: fixed; inset: 0; background: rgba(8,14,36,.8);
          display: flex; align-items: center; justify-content: center; z-index: 50;
          padding: 16px; overflow-y: auto;
        }
        .modal {
          background: var(--navy-deep); border: 1px solid var(--white);
          border-radius: 8px; padding: 18px; width: 100%; max-width: 400px; text-align: center;
          max-height: 90vh; overflow-y: auto; margin: auto;
        }
        .modal h3 { margin: 0 0 4px; font-size: 20px; letter-spacing: .06em; }
        /* Settings: one rhythm for every section instead of ad-hoc inline styles */
        .set-modal { max-width: 520px; text-align: left; }
        .set-group { border-top: 1px solid rgba(169,197,232,.16); margin-top: 18px; padding-top: 14px; }
        .set-group:first-of-type { border-top: 0; margin-top: 10px; padding-top: 0; }
        .set-sec { font-weight: 700; color: var(--powder); font-size: 12px; letter-spacing: .1em;
                   text-transform: uppercase; margin: 0 0 10px; }
        .set-hint { font-size: 12px; opacity: .68; line-height: 1.4; margin: 8px 0 0;
                    text-transform: none; letter-spacing: 0; }
        .set-foot { border-top: 1px solid rgba(169,197,232,.16); margin-top: 20px; padding-top: 14px; }
        .set-ver { font-size: 11px; opacity: .5; text-align: center; margin: 12px 0 0;
                   text-transform: none; letter-spacing: 0; }
        .set-code { background: #0E1A3A; border: 1px solid #2B5AA0; border-radius: 8px;
                    padding: 10px 12px; margin-bottom: 10px; }
        .season-modal { max-width: 680px; text-align: left; }
        .season-controls { display: flex; align-items: center; gap: 12px; margin: 8px 0 12px; }
        .season-controls select { flex: 1; }
        .season-gp { color: var(--powder); font-size: 13px; white-space: nowrap; }
        .season-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
        .season-tabs .dg { flex: 1; }
        .season-table { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--line); border-radius: 10px; }
        .season-table table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
        .season-table th, .season-table td { padding: 7px 9px; text-align: right; font-size: 13px; white-space: nowrap; font-family: 'Saira Condensed', sans-serif; }
        .season-table th { position: sticky; top: 0; background: #16244f; color: var(--powder); cursor: pointer; user-select: none; font-weight: 700; border-bottom: 1px solid var(--line); }
        .season-table th.on { color: var(--amber); }
        .season-table th.l, .season-table td.l { text-align: left; position: sticky; left: 0; background: var(--navy-deep); z-index: 1; }
        .season-table th.l { background: #16244f; z-index: 2; }
        .season-table tbody tr:nth-child(odd) td { background: rgba(255,255,255,.03); }
        .season-table tbody tr:nth-child(odd) td.l { background: #101a3d; }
        .season-table td { color: var(--white); }
        .season-note { font-size: 11px !important; letter-spacing: .02em !important; text-transform: none !important; opacity: .7; margin: 10px 0 12px !important; }
        .modal p { margin: 0 0 14px; color: var(--powder); font-size: 13px; letter-spacing: .12em; text-transform: uppercase; }
        .modal p.limitstatus { font-weight: 700; }
        .recap-img {
          width: 100%; border-radius: 8px; border: 1px solid var(--line);
          margin-bottom: 8px; display: block;
        }
        .recap-hint {
          font-size: 11px !important; letter-spacing: .06em !important;
          text-transform: none !important;
        }
        .modal p.limitstatus.warn { color: var(--amberw); }
        .modal p.limitstatus.over { color: var(--red); }
        .modal .btnrow { grid-template-columns: 1fr; }

        .final-banner {
          text-align: center; background: var(--red); color: var(--white);
          font-weight: 800; letter-spacing: .3em; padding: 8px; border-radius: 6px;
          margin-bottom: 12px; text-transform: uppercase;
        }
        @media (prefers-reduced-motion: reduce) { .dg-root * { transition: none !important; } }
      `),
        React.createElement("div", { className: "shell" },
            React.createElement("div", { className: "brand" },
                React.createElement("img", { src: LOGO, alt: "DugoutIQ \u2014 Manage the Game", className: "brand-logo" }),
                licensed && (React.createElement("button", { className: "gear-btn", onClick: () => setSettingsOpen(true), "aria-label": "Settings", title: "Settings" }, "\u2699\uFE0F"))),
            !licensed && (React.createElement("div", { className: "setup-card license-card" },
                React.createElement("h2", null, "Activate DugoutIQ"),
                React.createElement("p", { className: "license-sub" }, "Enter the license key from your purchase receipt. You only do this once \u2014 after activation the app works fully offline."),
                React.createElement("input", { className: "dg-in license-in", value: licenseKey, onChange: (e) => setLicenseKey(e.target.value), onKeyDown: (e) => e.key === "Enter" && activate(), placeholder: "XXXXXXXX-XXXXXXXX-XXXXXXXX", "aria-label": "License key", autoComplete: "off" }),
                licenseErr && React.createElement("div", { className: "license-err" }, licenseErr),
                React.createElement("button", { className: "dg hit", style: { width: "100%", fontSize: 17, padding: "12px 0", marginTop: 10 }, onClick: activate, disabled: licenseBusy || !licenseKey.trim() }, licenseBusy ? "Verifying…" : "Activate"),
                React.createElement("p", { className: "license-foot" }, "Your license key is in your purchase receipt \u2014 activate once, works offline forever"))),
            licensed && phase === "setup" && (React.createElement(React.Fragment, null,
                React.createElement("div", { className: "btnrow", style: { marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" } },
                    React.createElement("button", { className: "dg ghost", onClick: () => setGamesOpen(true) },
                        "\uD83D\uDCC1 Saved games",
                        games.length ? ` (${games.length})` : ""),
                    games.length > 0 && (React.createElement("button", { className: "dg ghost", onClick: () => {
                            if (!seasonTeam)
                                setSeasonTeam(seasonTeamList()[0] || "");
                            setSeasonSort({ col: "ab", dir: -1 });
                            setSeasonOpen(true);
                        } }, "\uD83D\uDCCA Season stats")),
                    React.createElement("label", { style: { display: "inline-flex", alignItems: "center", gap: 8, color: "var(--powder)", fontSize: 14 } },
                        "Game date",
                        React.createElement("input", { type: "date", className: "dg-in", style: { width: "auto" }, value: gameDate, onChange: (e) => setGameDate(e.target.value), "aria-label": "Game date" }))),
                React.createElement("div", { className: "setup-grid" }, ["away", "home"].map((side) => (React.createElement("div", { className: "setup-card", key: side },
                    React.createElement("h2", null, side === "away" ? "Visiting Club" : "Home Club"),
                    React.createElement("input", { className: "dg-in teamname-in", value: teams[side].name, onChange: (e) => setTeamName(side, e.target.value), "aria-label": `${side} team name` }),
                    React.createElement("label", { className: `scan-bar ${scanBusy === side ? "busy" : ""}` },
                        React.createElement("span", { className: "scan-ico", "aria-hidden": "true" }, scanBusy === side
                            ? React.createElement("span", { className: "scan-spin" })
                            : React.createElement("svg", { viewBox: "0 0 24 24", width: "19", height: "19", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" },
                                React.createElement("path", { d: "M3 8V5.5A1.5 1.5 0 0 1 4.5 4H7" }),
                                React.createElement("path", { d: "M17 4h2.5A1.5 1.5 0 0 1 21 5.5V8" }),
                                React.createElement("path", { d: "M21 16v2.5a1.5 1.5 0 0 1-1.5 1.5H17" }),
                                React.createElement("path", { d: "M7 20H4.5A1.5 1.5 0 0 1 3 18.5V16" }),
                                React.createElement("path", { d: "M7 9.5h10M7 12.5h7M7 15.5h4" }))),
                        React.createElement("span", { className: "scan-txt" },
                            React.createElement("b", null, scanBusy === side ? "Reading the card\u2026" : "Scan lineup card"),
                            React.createElement("small", null, scanBusy === side ? "This takes a few seconds" : "Snap a photo \u2014 names, numbers, positions fill in")),
                        scanBusy !== side && React.createElement("span", { className: "scan-arrow", "aria-hidden": "true" }, "\u203A"),
                        React.createElement("input", { type: "file", accept: "image/*", style: { display: "none" }, disabled: scanBusy != null, onChange: (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; scanLineup(side, f); } })),
                    scanMsg && scanMsg.side === side && (React.createElement("p", { className: `scan-msg ${scanMsg.ok ? "ok" : "err"}` }, scanMsg.text)),
                    React.createElement("div", { className: "team-custom" },
                        PRESET_TEAM_COLORS.map((c) => (React.createElement("button", { key: c, type: "button", className: `swatch ${teamColor(side) === c ? "sel" : ""}`, style: { background: c }, onClick: () => setTeamColor(side, c), "aria-label": `Set ${side} team color` }))),
                        React.createElement("input", { type: "color", className: "swatch-custom", value: teamColor(side), onChange: (e) => setTeamColor(side, e.target.value), "aria-label": `Custom ${side} team color` }),
                        React.createElement("label", { className: "logo-btn" },
                            teams[side].logo ? (React.createElement("img", { src: teams[side].logo, alt: "team logo" })) : ("＋ Logo"),
                            React.createElement("input", { type: "file", accept: "image/*", onChange: (e) => onLogoPick(side, e), style: { display: "none" } })),
                        teams[side].logo && (React.createElement("button", { type: "button", className: "logo-rm", onClick: () => setTeamLogo(side, ""), "aria-label": "Remove logo" }, "\u2715"))),
                    React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr 1fr", marginBottom: 10 } },
                        React.createElement("button", { className: "dg ghost rosterbtn", onClick: () => saveRoster(side) }, "\uD83D\uDCBE Save roster"),
                        React.createElement("button", { className: "dg ghost rosterbtn", onClick: () => setTeamPickSide(side), disabled: !rosters.length },
                            "\uD83D\uDCC2 My teams (",
                            rosters.length,
                            ")")),
                    teams[side].lineup.map((p, i) => (React.createElement("div", { className: `prow ${rowDrag && rowDrag.side === side && rowDrag.from === i ? "dragging" : ""}`, key: i, style: rowStyle(side, i) },
                        React.createElement("button", { className: "drag-handle", onPointerDown: rowHandleDown(side, i), onPointerMove: rowHandleMove, onPointerUp: rowHandleUp, "aria-label": `Batter ${i + 1} — drag to reorder` },
                            i + 1,
                            React.createElement("span", { className: "grip" }, "\u2261")),
                        React.createElement("input", { className: "dg-in jersey-in", value: p.num || "", onChange: (e) => setPlayer(side, i, "num", e.target.value.replace(/[^0-9]/g, "").slice(0, 2)), inputMode: "numeric", placeholder: "#", "aria-label": `${side} batter ${i + 1} number` }),
                        React.createElement("input", { className: "dg-in", value: p.name, onChange: (e) => setPlayer(side, i, "name", e.target.value), "aria-label": `${side} batter ${i + 1} name` }),
                        React.createElement("select", { className: "dg-sel", value: p.pos, onChange: (e) => setPlayer(side, i, "pos", e.target.value), "aria-label": `${side} batter ${i + 1} position` }, POSITIONS.map((pos) => (React.createElement("option", { key: pos, value: pos }, pos || "POS")))),
                        teams[side].lineup.length > MIN_BATTERS ? (React.createElement("button", { className: "rm", onClick: () => removePlayer(side, i), "aria-label": `Remove ${side} batter ${i + 1}` }, "\u00D7")) : (React.createElement("span", null))))),
                    React.createElement("button", { className: "dg ghost addrow", onClick: () => addPlayer(side), disabled: teams[side].lineup.length >= MAX_BATTERS },
                        "+ Add batter (",
                        teams[side].lineup.length,
                        ")"),
                    )))),
                React.createElement("div", { className: "setup-card limitcard" },
                    React.createElement("h2", null, "League Pitch Limit"),
                    React.createElement("div", { className: "limitrow", style: { marginBottom: 8 } },
                        React.createElement("select", { className: "dg-sel", value: division, onChange: (e) => {
                                const dv = e.target.value;
                                setDivision(dv);
                                if (dv && PITCH_DIVISIONS[dv])
                                    setPitchLimit(PITCH_DIVISIONS[dv][4]); // daily max
                            }, "aria-label": "Age division for pitch count rules" },
                            React.createElement("option", { value: "" }, "Off"),
                            Object.keys(PITCH_DIVISIONS).map((d) => (React.createElement("option", { key: d, value: d }, d)))),
                        React.createElement("span", { className: "limithint" }, division
                            ? `BNS ${division} thresholds ${PITCH_DIVISIONS[division].join(" / ")}`
                            : "age division \u00B7 BNS thresholds + pitch count sheet")),
                    React.createElement("div", { className: "limitrow" },
                        React.createElement("input", { className: "dg-in", type: "number", min: "0", max: "200", value: pitchLimit, onChange: (e) => setPitchLimit(Math.max(0, parseInt(e.target.value || "0", 10))), "aria-label": "Pitch limit per pitcher" }),
                        React.createElement("span", { className: "limithint" },
                            "per pitcher \u00B7 warning lights at ",
                            pitchLimit > 0 ? Math.max(0, pitchLimit - 10) : "—",
                            " \u00B7 set 0 to turn off"))),
                React.createElement("div", { className: "btnrow r3", style: { marginTop: 12 } },
                    React.createElement("button", { className: "dg ghost", onClick: copyLineups }, "Export lineups"),
                    React.createElement("button", { className: "dg ghost", onClick: () => {
                            setImportText("");
                            setImportOpen(true);
                        } }, "Import lineups"),
                    React.createElement("span", null)),
                setupMsg && React.createElement("div", { className: "setup-msg" }, setupMsg),
                React.createElement("div", { style: { marginTop: 10 } },
                    React.createElement("button", { className: "dg hit", style: { width: "100%", fontSize: 20, padding: "14px 0" }, onClick: playBall }, "\u26BE Play Ball")))),
            licensed && phase === "game" && game && (React.createElement(React.Fragment, null,
                game.over && React.createElement("div", { className: "final-banner" }, "Final"),
                React.createElement("div", { className: "board" },
                    React.createElement("div", { className: `team-cell ${battingSide === "away" && !game.over ? "atbat" : ""}`, style: Object.assign({ cursor: "pointer" }, (battingSide === "away" && !game.over ? { borderColor: teamColor("away") } : {})), onClick: () => { setSubSide("away"); setSubSlot(null); setSubMenu(true); }, title: "Edit lineup" },
                        React.createElement("div", { className: "tname", style: { color: teamColor("away") } },
                            teams.away.logo && React.createElement("img", { src: teams.away.logo, className: "tlogo", alt: "" }),
                            teams.away.name),
                        React.createElement("div", { className: "tscore" }, totals("away"))),
                    React.createElement("div", { className: "inning-cell" },
                        React.createElement("div", { className: "arrow" }, game.half === "top" ? "▲" : "▽"),
                        React.createElement("div", { className: "num" }, game.inning),
                        React.createElement("div", { className: "lbl" }, game.half === "top" ? "TOP" : "BOT")),
                    React.createElement("div", { className: `team-cell ${battingSide === "home" && !game.over ? "atbat" : ""}`, style: Object.assign({ cursor: "pointer" }, (battingSide === "home" && !game.over ? { borderColor: teamColor("home") } : {})), onClick: () => { setSubSide("home"); setSubSlot(null); setSubMenu(true); }, title: "Edit lineup" },
                        React.createElement("div", { className: "tname", style: { color: teamColor("home") } },
                            teams.home.logo && React.createElement("img", { src: teams.home.logo, className: "tlogo", alt: "" }),
                            teams.home.name),
                        React.createElement("div", { className: "tscore" }, totals("home")))),
                React.createElement("div", { className: "diamond-card" },
                    React.createElement("div", { className: "diamond-hint" }, "Drag runner \u00B7 tap = options"),
                    React.createElement(Diamond, null),
                    React.createElement("div", { className: "count-corner", role: "status", "aria-label": `${game.balls} balls, ${game.strikes} strikes, ${game.outs} outs` },
                        React.createElement("div", { className: "crow" },
                            React.createElement("span", null, "B"),
                            [0, 1, 2].map((i) => (React.createElement(Lamp, { key: i, on: game.balls > i, color: "white", mini: true })))),
                        React.createElement("div", { className: "crow" },
                            React.createElement("span", null, "S"),
                            [0, 1].map((i) => (React.createElement(Lamp, { key: i, on: game.strikes > i, color: "white", mini: true })))),
                        React.createElement("div", { className: "crow" },
                            React.createElement("span", null, "O"),
                            [0, 1].map((i) => (React.createElement(Lamp, { key: i, on: game.outs > i, color: "red", mini: true }))))),
                    React.createElement("button", { className: `pitchbtn corner-r ${pitchStatus(curP(game, fieldingSide).pitches)}`, onClick: () => setPitchMenuSide(fieldingSide), "aria-label": `${curP(game, fieldingSide).name}, ${curP(game, fieldingSide).pitches} pitches, tap for pitcher options` },
                        React.createElement("div", { className: "glabel" }, curP(game, fieldingSide).name.slice(0, 10)),
                        React.createElement("div", { className: "pcount" }, curP(game, fieldingSide).pitches),
                        pitchStatus(curP(game, fieldingSide).pitches) === "over" && (React.createElement("div", { className: "plimit-tag" }, "AT LIMIT")),
                        pitchStatus(curP(game, fieldingSide).pitches) === "warn" && (React.createElement("div", { className: "plimit-tag warn" },
                            pitchLimit - curP(game, fieldingSide).pitches,
                            " LEFT")),
                        division && pitchStatus(curP(game, fieldingSide).pitches) === "" && !curP(game, fieldingSide).lastB && (() => {
                            // BNS 5.2.7.17 — flag an approaching threshold (within 3 pitches)
                            const p = curP(game, fieldingSide);
                            const nt = p.pitches > 0 ? nextThresholdFor(division, p.pitches) : null;
                            return nt != null && nt - p.pitches <= 3
                                ? React.createElement("div", { className: "plimit-tag warn" }, p.pitches >= nt ? `AT ${nt}` : `${nt} NEAR`)
                                : null;
                        })())),
                React.createElement("div", { className: "linescore-wrap" },
                    React.createElement("table", { className: "linescore" },
                        React.createElement("thead", null,
                            React.createElement("tr", null,
                                React.createElement("th", null),
                                game.linescore.map((_, i) => (React.createElement("th", { key: i }, i + 1))),
                                React.createElement("th", null, "R"),
                                React.createElement("th", null, "H"),
                                React.createElement("th", null, "E"))),
                        React.createElement("tbody", null, ["away", "home"].map((side) => (React.createElement("tr", { key: side },
                            React.createElement("td", { className: "tm" }, teams[side].name.slice(0, 12)),
                            game.linescore.map((r, i) => (React.createElement("td", { key: i, className: i === game.inning - 1 && side === battingSide && !game.over
                                    ? "cur"
                                    : "" }, side === "home" && r.homeX ? "X" : r[side] === null ? "" : r[side]))),
                            React.createElement("td", { className: "rhe" }, totals(side)),
                            React.createElement("td", { className: "rhe" }, game.hits[side]),
                            React.createElement("td", { className: "rhe" }, game.errors[side]))))))),
                React.createElement("div", { className: "ticker ticker-btn", onClick: () => setPbpOpen(true), role: "button", tabIndex: 0 },
                    game.lastPlay,
                    React.createElement("span", { className: "ticker-hint" }, " \u00B7 tap for play-by-play")),
                !game.over && (React.createElement(React.Fragment, null,
                    React.createElement("button", { className: "atbat-card", onClick: openBatterMenu },
                        React.createElement("div", { className: "who" },
                            currentBatterName(),
                            React.createElement("small", null, (game.lineup || teams)[battingSide]
                                ? (game.lineup
                                    ? game.lineup[battingSide][game.batter[battingSide]]
                                    : teams[battingSide].lineup[game.batter[battingSide]]).pos
                                : "")),
                        React.createElement("div", { className: "statline" }, (() => {
                            const s = game.stats[battingSide][game.batter[battingSide]];
                            return `${s.h}-${s.ab} · ${s.r} R · ${s.rbi} RBI · ${s.bb} BB`;
                        })()),
                        React.createElement("span", { className: "atbat-edit" }, "edit \u203A")),
                    game.openK && !game.over && (React.createElement("button", { className: "d3k-banner", onClick: d3kReach },
                        "Dropped 3rd strike? ",
                        React.createElement("strong", null, "Batter safe at 1st \u2014 tap here"))),
                    game.openTag &&
                        !game.over &&
                        game.openTag.kind === "ground" &&
                        game.bases.third && (React.createElement("button", { className: "d3k-banner tagup", onClick: groundScore },
                        "Run score from third? ",
                        React.createElement("strong", null, "Tap to score + RBI"))),
                    game.openTag &&
                        !game.over &&
                        game.openTag.kind !== "ground" &&
                        (game.bases.first || game.bases.second || game.bases.third) && (React.createElement("button", { className: "d3k-banner tagup", onClick: () => setTagMenu(true) },
                        "Runner tag up? ",
                        React.createElement("strong", null, "Advance on the catch \u2014 tap here"))),
                    (() => {
                        const p = curP(game, fieldingSide);
                        const status = pitchStatus(p.pitches);
                        return (React.createElement("button", { className: `pstrip ${status}`, onClick: () => setPitchMenuSide(fieldingSide), "aria-label": `Pitching: ${p.name}, ${p.pitches} pitches${pitchLimit > 0
                                ? `, ${Math.max(0, pitchLimit - p.pitches)} remaining`
                                : ""}. Tap for pitcher options.` },
                            React.createElement("span", { className: "pstrip-who" },
                                "\u26BE ",
                                p.name,
                                " ",
                                React.createElement("small", null,
                                    "(",
                                    teams[fieldingSide].name,
                                    ")")),
                            React.createElement("span", { className: "pstrip-line" },
                                ipDisplay(p.outs),
                                " IP \u00B7 ",
                                p.h,
                                " H \u00B7 ",
                                p.r,
                                " R \u00B7 ",
                                p.bb,
                                " BB \u00B7 ",
                                p.k,
                                " K"),
                            React.createElement("span", { className: "pstrip-np" },
                                p.pitches,
                                " NP",
                                pitchLimit > 0 &&
                                    (status === "over"
                                        ? " · AT LIMIT"
                                        : ` · ${pitchLimit - p.pitches} left`))));
                    })(),
                    React.createElement("div", { className: "btnrow r6" },
                        React.createElement("button", { className: "dg count", onClick: tapBall }, "Ball"),
                        React.createElement("button", { className: "dg count", onClick: () => { if (game.strikes === 2) setKMenu(true); else tapStrike(); } }, "Strike"),
                        React.createElement("button", { className: "dg count", onClick: tapFoul }, "Foul"),
                        React.createElement("button", { className: "dg count", onClick: tapFoulTip }, "Tip"),
                        React.createElement("button", { className: "dg count", onClick: tapHBP }, "HBP"),
                        React.createElement("button", { className: "dg count", onClick: tapIBB }, "IBB")),
                    React.createElement("div", { className: "btnrow r4" },
                        React.createElement("button", { className: "dg hit", onClick: () => openFieldOne("Single", "Tap where the ball was hit.", (loc) => playHit(1, "single", loc)) }, "1B"),
                        React.createElement("button", { className: "dg hit", onClick: () => openFieldOne("Double", "Tap where the ball was hit.", (loc) => playHit(2, "double", loc)) }, "2B"),
                        React.createElement("button", { className: "dg hit", onClick: () => openFieldOne("Triple", "Tap where the ball was hit.", (loc) => playHit(3, "triple", loc)) }, "3B"),
                        React.createElement("button", { className: "dg hit", onClick: () => openFieldOne("Home run", "Tap where the ball was hit.", (loc) => playHit(4, "HOME RUN", loc)) }, "HR")),
                    React.createElement("div", { className: "btnrow r5" },
                        React.createElement("button", { className: "dg outb", onClick: () => openFieldPick("groundout", false) }, "Gnd"),
                        React.createElement("button", { className: "dg outb", onClick: () => openFieldPick("flyout", false) }, "Fly"),
                        React.createElement("button", { className: "dg outb", onClick: () => openFieldPick("popup", false) }, "Pop"),
                        React.createElement("button", { className: "dg outb", onClick: () => openFieldPick("lineout", false) }, "Line"),
                        React.createElement("button", { className: "dg outb", onClick: () => playOut("strikeout", true) }, "K")),
                    React.createElement("div", { className: "btnrow r5" },
                        React.createElement("button", { className: "dg outb", onClick: () => setDpMenu(true), disabled: game.outs >= 2 ||
                                (!game.bases.first && !game.bases.second && !game.bases.third) }, "DP"),
                        React.createElement("button", { className: "dg outb", onClick: () => setFcMenu(true), disabled: !game.bases.first && !game.bases.second && !game.bases.third }, "FC"),
                        React.createElement("button", { className: "dg outb", onClick: () => setSacMenu(true), disabled: !game.bases.first && !game.bases.second && !game.bases.third }, "Sac"),
                        React.createElement("button", { className: "dg", onClick: () => openFieldOne("Error", "Tap the fielder who made the error.", (pos) => playError(pos)) }, "Error"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setMoreMenu(true), disabled: game.over }, "More")),
                    React.createElement("div", { className: "btnrow r5" },
                        React.createElement("button", { className: "dg ghost", onClick: () => adjustRun(1) }, "+ Run"),
                        React.createElement("button", { className: "dg ghost", onClick: () => adjustRun(-1) }, "\u2212 Run"),
                        React.createElement("button", { className: "dg ghost", onClick: () => {
                                setSubSide(battingSide);
                                setSubSlot(null);
                                setSubMenu(true);
                            } }, "Lineup"),
                        React.createElement("button", { className: "dg ghost", onClick: undo, disabled: !history.length }, "Undo"),
                        React.createElement("button", { className: "dg ghost", onClick: manualEndHalf }, "End half")))),
                React.createElement("div", { className: "btnrow r3", style: { marginTop: 4 } },
                    React.createElement("button", { className: "dg ghost", onClick: () => setShareOpen(true) }, "Share recap"),
                    !game.over ? (React.createElement("button", { className: "dg ghost", onClick: endGame }, "Call it final")) : (React.createElement("button", { className: "dg ghost", onClick: () => setDecisionsOpen(true) }, "Decisions")),
                    React.createElement("button", { className: "dg ghost", onClick: () => setConfirmNew(true) }, "New game")),
                !game.over && (React.createElement("div", { className: "lineup-wrap" },
                    React.createElement("div", { className: "lineup-head" },
                        React.createElement("span", null,
                            teams[battingSide].name,
                            " \u2014 batting order"),
                        React.createElement("span", null, "H-AB \u00B7 R \u00B7 RBI \u00B7 BB \u00B7 K")),
                    React.createElement("table", { className: "lineup" },
                        React.createElement("tbody", null,
                            (game.lineup ? game.lineup[battingSide] : teams[battingSide].lineup).map((p, i) => {
                                const s = game.stats[battingSide][i];
                                return (React.createElement("tr", { key: i, className: i === game.batter[battingSide] ? "cur" : "", onClick: () => setBatterIndex(i) },
                                    React.createElement("td", { className: "num" }, i + 1),
                                    React.createElement("td", null,
                                        p.name,
                                        p.pos ? ` · ${p.pos}` : ""),
                                    React.createElement("td", { className: "stat" },
                                        s.h,
                                        "-",
                                        s.ab,
                                        " \u00B7 ",
                                        s.r,
                                        " \u00B7 ",
                                        s.rbi,
                                        " \u00B7 ",
                                        s.bb,
                                        " \u00B7 ",
                                        s.k)));
                            }),
                            game.subs &&
                                game.subs[battingSide].map((p, i) => (React.createElement("tr", { key: `sub${i}`, className: "retired" },
                                    React.createElement("td", { className: "num" }, p.slot + 1),
                                    React.createElement("td", null,
                                        p.name,
                                        p.pos ? ` · ${p.pos}` : "",
                                        " ",
                                        React.createElement("em", null, "(out)")),
                                    React.createElement("td", { className: "stat" },
                                        p.h,
                                        "-",
                                        p.ab,
                                        " \u00B7 ",
                                        p.r,
                                        " \u00B7 ",
                                        p.rbi,
                                        " \u00B7 ",
                                        p.bb,
                                        " \u00B7 ",
                                        p.k)))))))),
                React.createElement("div", { className: "lineup-wrap" },
                    React.createElement("button", { className: "lineup-head loghead", onClick: () => setShowLog((v) => !v), "aria-expanded": showLog },
                        React.createElement("span", null,
                            "Play-by-play \u00B7 ",
                            game.log.length,
                            " events"),
                        React.createElement("span", null, showLog ? "▲ hide" : "▼ show")),
                    showLog && (React.createElement("div", { className: "gamelog" }, [...game.log].reverse().map((e, idx) => e.type === "pa" ? (React.createElement("div", { className: "log-row pa", key: game.log.length - idx },
                        React.createElement("span", { className: "log-inn" },
                            e.h === "top" ? "T" : "B",
                            e.i),
                        React.createElement("span", { className: "log-txt" },
                            React.createElement("strong", null, e.batter),
                            " ",
                            React.createElement("span", { className: "log-seq" },
                                e.seq.join("-"),
                                e.seq.length > 0 && "-"),
                            React.createElement("span", { className: e.result ? "log-res" : "log-open" }, e.result || "batting…")))) : (React.createElement("div", { className: `log-row ${e.k}`, key: game.log.length - idx },
                        React.createElement("span", { className: "log-inn" },
                            e.h === "top" ? "T" : "B",
                            e.i),
                        React.createElement("span", { className: "log-txt" }, e.t))))))))),
            pbpOpen && game && (React.createElement("div", { className: "modal-back", onClick: () => { setPbpOpen(false); setPbpEdit(null); } },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Play-by-play"),
                    React.createElement("p", null, "Tap a play to fix its wording. This edits the description only \u2014 it won\u2019t change stats or the score (use Undo for that)."),
                    React.createElement("div", { className: "pbp-list" }, (() => {
                        const rows = [];
                        let lastKey = "";
                        game.log.forEach((e, idx) => {
                            const key = `${e.h}-${e.i}`;
                            if (key !== lastKey) {
                                lastKey = key;
                                rows.push(React.createElement("div", { className: "pbp-inn", key: `h${idx}` },
                                    e.h === "top" ? "▲ Top" : "▼ Bot",
                                    " ",
                                    e.i));
                            }
                            const text = e.type === "pa"
                                ? (e.result || (e.seq && e.seq.length ? "(at bat…)" : ""))
                                : e.t;
                            rows.push(React.createElement("div", { className: "pbp-row", key: idx }, pbpEdit === idx ? (React.createElement("div", { className: "pbp-edit" },
                                React.createElement("input", { className: "dg-in", value: pbpText, onChange: (ev) => setPbpText(ev.target.value), "aria-label": "Edit play description" }),
                                React.createElement("button", { className: "dg hit", onClick: saveLogEdit }, "Save"),
                                React.createElement("button", { className: "dg ghost", onClick: () => { setPbpEdit(null); setPbpText(""); } }, "Cancel"))) : (React.createElement("button", { className: "pbp-tap", onClick: () => startLogEdit(idx) },
                                e.type === "pa" && React.createElement("span", { className: "pbp-bat" }, e.batter),
                                React.createElement("span", { className: "pbp-text" }, text),
                                e.type === "pa" && e.seq && e.seq.length > 0 && (React.createElement("span", { className: "pbp-seq" }, e.seq.join(" · ")))))));
                        });
                        return rows;
                    })()),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg ghost", onClick: () => { setPbpOpen(false); setPbpEdit(null); } }, "Close"))))),
            gamesOpen && (React.createElement("div", { className: "modal-back", onClick: () => setGamesOpen(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Saved games"),
                    React.createElement("p", null, "Games are saved here automatically when you tap \u201CCall it final.\u201D Tap one to reopen and re-share its box score."),
                    React.createElement("div", { className: "plog", style: { textAlign: "left" } },
                        games.length === 0 && (React.createElement("div", { className: "plog-row", style: { opacity: 0.7, padding: "8px 4px" } }, "No saved games yet.")),
                        games.map((gm) => {
                            const played = gm.date || (gm.snapshot && gm.snapshot.game && gm.snapshot.game.date) || null;
                            const dstr = (played ? new Date(played + "T00:00:00") : new Date(gm.savedAt)).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                            });
                            return (React.createElement("div", { className: "plog-row", key: gm.id },
                                React.createElement("button", { className: "roster-load", onClick: () => reopenGame(gm) },
                                    gm.away.name,
                                    " ",
                                    gm.awayRuns,
                                    " \u2014 ",
                                    gm.homeRuns,
                                    " ",
                                    gm.home.name,
                                    React.createElement("span", { className: "roster-n" },
                                        " \u00B7 ",
                                        dstr)),
                                confirmGameDel === gm.id ? (React.createElement("span", { style: { display: "inline-flex", gap: 6, alignItems: "center" } },
                                    React.createElement("button", { onClick: () => { deleteGame(gm.id); setConfirmGameDel(null); }, style: { background: "#B91C1C", color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer" } }, "Delete"),
                                    React.createElement("button", { onClick: () => setConfirmGameDel(null), style: { background: "transparent", color: "var(--powder)", border: "1px solid var(--line)", borderRadius: 6, padding: "5px 10px", fontSize: 13, cursor: "pointer" } }, "Keep"))) : (React.createElement("button", { className: "rm", onClick: () => setConfirmGameDel(gm.id), "aria-label": "Delete saved game" }, "\u00D7"))));
                        })),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg ghost", onClick: () => setGamesOpen(false) }, "Close"))))),
            teamPickSide && (React.createElement("div", { className: "modal-back", onClick: () => setTeamPickSide(null) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "My Teams"),
                    React.createElement("p", null,
                        "Load into the ",
                        teamPickSide === "away" ? "visiting" : "home",
                        " lineup"),
                    React.createElement("div", { className: "plog", style: { textAlign: "left" } }, rosters.map((r, i) => (React.createElement("div", { className: "plog-row", key: i },
                        React.createElement("button", { className: "roster-load", onClick: () => loadRoster(teamPickSide, i) },
                            r.name,
                            React.createElement("span", { className: "roster-n" },
                                " \u00B7 ",
                                r.lineup.length,
                                " batters")),
                        confirmRosterDel === i ? (React.createElement("span", { style: { display: "inline-flex", gap: 6, alignItems: "center" } },
                            React.createElement("button", { onClick: () => { deleteRoster(i); setConfirmRosterDel(null); }, style: { background: "#B91C1C", color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer" } }, "Delete"),
                            React.createElement("button", { onClick: () => setConfirmRosterDel(null), style: { background: "transparent", color: "var(--powder)", border: "1px solid var(--line)", borderRadius: 6, padding: "5px 10px", fontSize: 13, cursor: "pointer" } }, "Keep"))) : (React.createElement("button", { className: "rm", onClick: () => setConfirmRosterDel(i), "aria-label": `Delete saved roster ${r.name}` }, "\u00D7")))))),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg ghost", onClick: () => setTeamPickSide(null) }, "Cancel"))))),
            importOpen && (React.createElement("div", { className: "modal-back", onClick: () => setImportOpen(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Import lineups"),
                    React.createElement("p", null, "Paste a lineup code from Export Lineups"),
                    React.createElement("textarea", { className: "dg-in import-box", value: importText, onChange: (e) => setImportText(e.target.value), placeholder: '{"dugoutiq":1,"away":{...},"home":{...}}', "aria-label": "Lineup code" }),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg hit", onClick: importLineups, disabled: !importText.trim() }, "Import"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setImportOpen(false) }, "Cancel"))))),
            shareOpen && game && (React.createElement("div", { className: "modal-back", onClick: () => setShareOpen(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Share recap"),
                    React.createElement("p", null,
                        teams.away.name,
                        " ",
                        totals("away"),
                        ", ",
                        teams.home.name,
                        " ",
                        totals("home"),
                        game.over ? " · Final" : " · Live"),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg hit", onClick: shareImageRecap }, "\uD83D\uDDBC Score graphic (image)"),
                        React.createElement("button", { className: "dg", onClick: shareBoxScore }, "\uD83D\uDCCA Box score (image)"),
                        React.createElement("button", { className: "dg", onClick: () => {
                                setShareOpen(false);
                                setBookChoose(true);
                            } }, "\uD83D\uDCD2 Scorebook page (classic)"),
                        React.createElement("button", { className: "dg", onClick: () => {
                                setShareOpen(false);
                                setSheetOpen(true);
                            } }, "\uD83D\uDCCB Pitch count sheet (BNS)"),
                        React.createElement("button", { className: "dg", onClick: () => {
                                setShareOpen(false);
                                setStoryCopied(false);
                                try {
                                    setStoryOpen(buildGameStory(game, teams));
                                }
                                catch (_a) {
                                    mutate((g) => (g.lastPlay = "Couldn't build the game story"));
                                }
                            } }, "\uD83D\uDCF0 Game story"),
                        React.createElement("button", { className: "dg", onClick: startLive }, "\uD83D\uDCE1 Live game link (spectators)"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setShareOpen(false) }, "Cancel"))))),
            storyOpen && (React.createElement("div", { className: "modal-back", onClick: () => setStoryOpen(null) },
                React.createElement("div", { className: "modal set-modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Game story"),
                    React.createElement("div", { style: { fontFamily: "'Saira Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: "#F5C518", lineHeight: 1.2, margin: "6px 0 12px" } }, storyOpen.headline),
                    React.createElement("div", { style: { fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap", maxHeight: "42vh", overflowY: "auto", textTransform: "none", letterSpacing: 0, paddingRight: 4 } }, storyOpen.body),
                    React.createElement("pre", { style: { fontFamily: "'Roboto Mono', monospace", fontSize: 10.5, lineHeight: 1.5, color: "#A9C5E8", background: "#0E1A3A", border: "1px solid #2B5AA0", borderRadius: 8, padding: "8px 10px", margin: "12px 0 0", overflowX: "auto" } }, storyOpen.footer),
                    React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr 1fr", marginTop: 14 } },
                        React.createElement("button", { className: "dg hit", onClick: async () => {
                                const txt = `${storyOpen.headline}\n\n${storyOpen.body}\n\n${storyOpen.footer}`;
                                try {
                                    if (navigator.share)
                                        await navigator.share({ title: storyOpen.headline, text: txt });
                                    else {
                                        await navigator.clipboard.writeText(txt);
                                        setStoryCopied(true);
                                    }
                                }
                                catch (_a) { }
                            } }, navigator.share ? "Share" : storyCopied ? "Copied \u2713" : "Copy"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setStoryOpen(null) }, "Close")),
                    React.createElement("p", { className: "set-hint" }, "Written from the plays you scored \u2014 no numbers are invented. Add W/L/S in the pitching menu to include the decisions.")))),
            sheetOpen && game && (() => {
                const dv = (game.division || division) || "";
                const innCount = Math.min(Math.max(game.linescore.length, 7), 9);
                const cellStyle = { border: "1px solid rgba(255,255,255,.25)", padding: "5px 7px", textAlign: "center", fontSize: 13, whiteSpace: "nowrap" };
                const nameStyle = Object.assign({}, cellStyle, { textAlign: "left", minWidth: 110 });
                const sideTable = (side) => React.createElement("div", { key: side, style: { marginBottom: 16 } },
                    React.createElement("div", { style: { fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "#A9C5E8", margin: "0 0 6px" } }, `${side === "home" ? "Home" : "Visiting"} \u2014 ${teams[side].name}`),
                    React.createElement("div", { style: { overflowX: "auto" } },
                        React.createElement("table", { style: { borderCollapse: "collapse", width: "100%" } },
                            React.createElement("thead", null,
                                React.createElement("tr", null,
                                    React.createElement("th", { style: nameStyle }, "Pitcher"),
                                    Array.from({ length: innCount }, (_, i) => (React.createElement("th", { key: i, style: cellStyle }, i < 7 ? i + 1 : `E${i + 1}`))),
                                    React.createElement("th", { style: cellStyle }, "Rest"))),
                            React.createElement("tbody", null, game.pitchers[side].map((pp, r) => {
                                const row = pitchSheetRow(pp, innCount);
                                return React.createElement("tr", { key: r },
                                    React.createElement("td", { style: nameStyle }, pp.num ? `#${pp.num} ${pp.name}` : pp.name),
                                    row.cells.map((_, i) => (React.createElement("td", { key: i, style: cellStyle }, sheetCellText(pp, row, i)))),
                                    React.createElement("td", { style: cellStyle }, dv ? daysRestFor(dv, creditedOf(pp)) : "\u2014"));
                            })))));
                return React.createElement("div", { className: "modal-back", onClick: () => setSheetOpen(false) },
                    React.createElement("div", { className: "modal season-modal", onClick: (e) => e.stopPropagation() },
                        React.createElement("h3", null, "Pitch count sheet"),
                        React.createElement("p", { style: { textTransform: "none", letterSpacing: 0 } },
                            "Running totals by inning",
                            dv ? ` \u00B7 BNS ${dv} rules` : " \u00B7 no division set (Rest column off)",
                            " \u00B7 \u201C35 (37)\u201D = last batter called, credited 35"),
                        sideTable("home"),
                        sideTable("away"),
                        React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr 1fr" } },
                            React.createElement("button", { className: "dg hit", onClick: sharePitchSheet }, "\uD83D\uDDBC Export sheet (image)"),
                            React.createElement("button", { className: "dg ghost", onClick: () => setSheetOpen(false) }, "Close"))));
            })(),
            seasonOpen &&
                (() => {
                    const data = computeSeason(seasonTeam);
                    const rows = seasonTab === "bat" ? data.bat : data.pit;
                    const sortVal = (row, col) => {
                        if (col === "name")
                            return row.name.toLowerCase();
                        if (col === "avg")
                            return row.ab > 0 ? row.h / row.ab : -1;
                        if (col === "obp") {
                            const d = row.ab + row.bb + row.hbp + row.sac;
                            return d > 0 ? (row.h + row.bb + row.hbp) / d : -1;
                        }
                        if (col === "ip")
                            return row.outs;
                        if (col === "era")
                            return row.outs > 0 ? (row.er * 27) / row.outs : -1;
                        return row[col] || 0;
                    };
                    const sorted = [...rows].sort((a, b) => {
                        const va = sortVal(a, seasonSort.col), vb = sortVal(b, seasonSort.col);
                        return va < vb ? -seasonSort.dir : va > vb ? seasonSort.dir : a.name.localeCompare(b.name);
                    });
                    const cols = seasonTab === "bat"
                        ? [["name", "Player", "l"], ["gp", "GP"], ["ab", "AB"], ["r", "R"], ["h", "H"], ["x2b", "2B"], ["x3b", "3B"], ["xhr", "HR"], ["rbi", "RBI"], ["bb", "BB"], ["k", "K"], ["avg", "AVG"], ["obp", "OBP"]]
                        : [["name", "Player", "l"], ["app", "APP"], ["ip", "IP"], ["h", "H"], ["r", "R"], ["er", "ER"], ["bb", "BB"], ["k", "K"], ["era", "ERA"]];
                    const cellVal = (row, col) => {
                        if (col === "name")
                            return `${row.num ? `#${row.num} ` : ""}${row.name}`;
                        if (col === "avg")
                            return avg3(row.h, row.ab);
                        if (col === "obp")
                            return obp3(row);
                        if (col === "ip")
                            return ipDisplay(row.outs);
                        if (col === "era")
                            return era2(row.er, row.outs);
                        return row[col];
                    };
                    const clickCol = (col) => setSeasonSort((s) => (s.col === col ? { col, dir: -s.dir } : { col, dir: col === "name" ? 1 : -1 }));
                    const copyText = () => {
                        const head = cols.map((c) => c[1]).join("\t");
                        const body = sorted.map((r) => cols.map((c) => cellVal(r, c[0])).join("\t")).join("\n");
                        try {
                            navigator.clipboard.writeText(`${seasonTeam} — Season stats\n${head}\n${body}`);
                        }
                        catch (_a) { }
                    };
                    return (React.createElement("div", { className: "modal-back", onClick: () => setSeasonOpen(false) },
                        React.createElement("div", { className: "modal season-modal", onClick: (e) => e.stopPropagation() },
                            React.createElement("h3", null, "\uD83D\uDCCA Season Stats"),
                            React.createElement("div", { className: "season-controls" },
                                React.createElement("select", { className: "dg-in", value: seasonTeam, onChange: (e) => setSeasonTeam(e.target.value), "aria-label": "Team" }, seasonTeamList().map((t) => (React.createElement("option", { key: t, value: t }, t)))),
                                React.createElement("span", { className: "season-gp" },
                                    data.gp,
                                    " ",
                                    data.gp === 1 ? "game" : "games")),
                            React.createElement("div", { className: "season-tabs" },
                                React.createElement("button", { className: `dg ${seasonTab === "bat" ? "" : "ghost"}`, onClick: () => { setSeasonTab("bat"); setSeasonSort({ col: "ab", dir: -1 }); } }, "Batting"),
                                React.createElement("button", { className: `dg ${seasonTab === "pit" ? "" : "ghost"}`, onClick: () => { setSeasonTab("pit"); setSeasonSort({ col: "outs", dir: -1 }); } }, "Pitching")),
                            sorted.length === 0 ? (React.createElement("p", { style: { color: "var(--powder)", textAlign: "center", padding: "24px 8px" } },
                                "No ",
                                seasonTab === "bat" ? "batting" : "pitching",
                                " stats for this team yet.")) : (React.createElement("div", { className: "season-table" },
                                React.createElement("table", null,
                                    React.createElement("thead", null,
                                        React.createElement("tr", null, cols.map(([col, label, al]) => (React.createElement("th", { key: col, className: `${al === "l" ? "l" : ""} ${seasonSort.col === col ? "on" : ""}`, onClick: () => clickCol(col) },
                                            label,
                                            seasonSort.col === col ? (seasonSort.dir < 0 ? " ▾" : " ▴") : ""))))),
                                    React.createElement("tbody", null, sorted.map((r, i) => (React.createElement("tr", { key: i }, cols.map(([col, , al]) => (React.createElement("td", { key: col, className: al === "l" ? "l" : "" }, cellVal(r, col))))))))))),
                            React.createElement("p", { className: "season-note" }, seasonTab === "bat"
                                ? "AVG = H/AB · OBP = (H+BB+HBP)/(AB+BB+HBP+SF). Players matched by name within the team."
                                : "ERA shown on a 9-inning basis · ER = runs minus unearned."),
                            React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr 1fr" } },
                                React.createElement("button", { className: "dg ghost", onClick: copyText }, "Copy table"),
                                React.createElement("button", { className: "dg ghost", onClick: () => setSeasonOpen(false) }, "Done")))));
                })(),
            settingsOpen && (React.createElement("div", { className: "modal-back", onClick: () => setSettingsOpen(false) },
                React.createElement("div", { className: "modal set-modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "\u2699\uFE0F Settings"),
                    React.createElement("div", { className: "set-group" },
                        React.createElement("div", { className: "set-sec" }, "App look"),
                        React.createElement("div", { className: "theme-swatches" },
                            PRESET_TEAM_COLORS.map((c) => (React.createElement("button", { key: c, type: "button", className: `swatch ${themeColor === c ? "sel" : ""}`, style: { background: c }, onClick: () => setThemeColor(c), "aria-label": "Set app theme color" }))),
                            React.createElement("input", { type: "color", className: "swatch-custom", value: themeColor, onChange: (e) => setThemeColor(e.target.value), "aria-label": "Custom app theme color" }),
                            React.createElement("label", { className: "logo-btn" },
                                themeLogo ? React.createElement("img", { src: themeLogo, alt: "app logo" }) : "\uFF0B Logo",
                                React.createElement("input", { type: "file", accept: "image/*", onChange: onThemeLogoPick, style: { display: "none" } })),
                            themeLogo && (React.createElement("button", { type: "button", className: "logo-rm", onClick: () => setThemeLogo(""), "aria-label": "Remove logo" }, "\u2715"))),
                        React.createElement("p", { className: "set-hint" }, "Sets the accent color and the watermark in the diamond.")),
                    React.createElement("div", { className: "set-group" },
                        React.createElement("div", { className: "set-sec" }, "Backup & restore"),
                        bkMeta && (React.createElement("div", { className: "set-code" },
                            React.createElement("div", { style: { fontSize: 11, color: "#A9C5E8", letterSpacing: ".05em", marginBottom: 2 } }, "YOUR BACKUP CODE"),
                            React.createElement("div", { style: { fontFamily: "'Saira Condensed', sans-serif", fontSize: 17, fontWeight: 700, color: "#F5C518", letterSpacing: ".12em", userSelect: "all" } }, bkMeta.code),
                            React.createElement("div", { style: { fontSize: 11, opacity: 0.65, marginTop: 3 } },
                                "Last backed up ",
                                new Date(bkMeta.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })))),
                        React.createElement("button", { className: "dg hit", style: { width: "100%", marginBottom: 8 }, onClick: runBackup, disabled: bkBusy }, bkBusy ? "Working\u2026" : bkMeta ? "\u2601\uFE0F Back up now (updates your code)" : "\u2601\uFE0F Back up now"),
                        React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr 1fr", marginBottom: 8 } },
                            React.createElement("button", { className: "dg ghost", onClick: exportBackupFile, disabled: bkBusy }, "\u2B07\uFE0F Export file"),
                            React.createElement("label", { className: "dg ghost", style: { textAlign: "center", cursor: "pointer" } },
                                "\uD83D\uDCC2 Import file",
                                React.createElement("input", { type: "file", accept: "application/json,.json", onChange: importBackupFile, style: { display: "none" } }))),
                        React.createElement("div", { style: { display: "flex", gap: 8 } },
                            React.createElement("input", { className: "dg-in", style: { flex: 1, textTransform: "uppercase" }, value: restoreIn, onChange: (e) => setRestoreIn(e.target.value), placeholder: "Backup code\u2026", "aria-label": "Backup code to restore", autoComplete: "off" }),
                            React.createElement("button", { className: "dg ghost", onClick: runRestore, disabled: bkBusy || !restoreIn.trim() }, "Restore")),
                        bkMsg && (React.createElement("p", { className: "set-hint", style: { color: bkMsg.ok ? "#3ad07a" : "#E8915A", opacity: 1 } }, bkMsg.text)),
                        React.createElement("p", { className: "set-hint" }, "Saves your games, teams, rosters, settings and activation. Cloud backup needs internet; Export file works offline \u2014 keep one before playoffs.")),
                    React.createElement("div", { className: "set-group" },
                        React.createElement("div", { className: "set-sec" }, "Public games"),
                        React.createElement("a", { href: "/games.html", target: "_blank", rel: "noopener", className: "dg", style: { display: "block", textAlign: "center", textDecoration: "none" } }, "Open the public Games page \u2192"),
                        React.createElement("p", { className: "set-hint" }, "Games appear there only when a scorer ticks \u201Clist publicly\u201D in the live-share window.")),
                    React.createElement("div", { className: "set-foot" },
                        React.createElement("button", { className: "dg ghost", style: { width: "100%" }, onClick: () => setSettingsOpen(false) }, "Done"),
                        React.createElement("p", { className: "set-ver" },
                            "DugoutIQ \u2014 Manage the Game \u00B7 App v",
                            APP_VERSION))))),
            liveOpen && (React.createElement("div", { className: "modal-back", onClick: () => setLiveOpen(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Live spectator link"),
                    React.createElement("p", { style: { marginBottom: "6px" } },
                        React.createElement("span", { style: {
                                display: "inline-block",
                                width: "9px",
                                height: "9px",
                                borderRadius: "50%",
                                background: liveOn ? "#3ad07a" : "#888",
                                marginRight: "7px",
                            } }),
                        liveOn ? "Broadcasting live" : "Paused",
                        " \u00B7 this link stays the same even if you close or reload the app."),
                    React.createElement("p", null, "Share it. Anyone who opens it watches the game update live \u2014 view only, no controls. It refreshes itself every few seconds."),
                    React.createElement("input", { readOnly: true, value: liveLink(), onFocus: (e) => e.target.select(), style: {
                            width: "100%",
                            padding: "10px",
                            borderRadius: "8px",
                            border: "1px solid #2B5AA0",
                            background: "#0E1A3A",
                            color: "#fff",
                            fontSize: "13px",
                            marginBottom: "10px",
                        } }),
                    React.createElement("label", { style: {
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                            margin: "2px 0 12px",
                            cursor: "pointer",
                            fontSize: "14px",
                            lineHeight: 1.35,
                        } },
                        React.createElement("input", { type: "checkbox", checked: liveList, onChange: (e) => setLiveList(e.target.checked), style: { width: "18px", height: "18px", marginTop: "1px", flex: "0 0 auto" } }),
                        React.createElement("span", null,
                            "List on the public ",
                            React.createElement("strong", null, "Games"),
                            " page",
                            React.createElement("span", { style: { color: "#A9C5E8" } },
                                " ",
                                "\u2014 team names & score only, never player names. Shows while you\u2019re broadcasting; untick to remove it."))),
                    liveList && (React.createElement("a", { href: "/games.html", target: "_blank", rel: "noopener", style: { display: "inline-block", color: "#F5C518", fontSize: "13px", marginBottom: "10px", textDecoration: "none" } }, "View the public Games page \u2192")),
                    React.createElement("div", { style: { margin: "4px 0 12px" } },
                        React.createElement("label", { style: { display: "block", fontSize: "14px", marginBottom: "5px", color: "#fff" } },
                            "\uD83D\uDCFA Live video link ",
                            React.createElement("span", { style: { color: "#A9C5E8", fontWeight: 400 } }, "(optional)")),
                        React.createElement("input", { type: "url", value: liveVideo, placeholder: "Paste a YouTube, Facebook, Instagram, TikTok, or StreamYard link", onChange: (e) => setLiveVideo(e.target.value), style: {
                                width: "100%",
                                padding: "10px",
                                borderRadius: "8px",
                                border: "1px solid #2B5AA0",
                                background: "#0E1A3A",
                                color: "#fff",
                                fontSize: "13px",
                            } }),
                        React.createElement("div", { style: { fontSize: "12px", marginTop: "5px", lineHeight: 1.35, color: liveVideo ? (parseStreamUrl(liveVideo) ? "#3ad07a" : "#E8915A") : "#A9C5E8" } }, (() => {
                            const v = parseStreamUrl(liveVideo);
                            if (!liveVideo) return "Stream on YouTube, Facebook, Instagram, TikTok, or StreamYard, then paste the link \u2014 it shows on the spectator page.";
                            if (!v) return "Link not recognized \u2014 paste a YouTube, Facebook, Instagram, TikTok, or StreamYard link.";
                            const names = { youtube: "YouTube", facebook: "Facebook", streamyard: "StreamYard", instagram: "Instagram", tiktok: "TikTok" };
                            if (v.mode === "embed") return "\u2713 " + names[v.type] + " video will play on the spectator page." + (v.type === "facebook" ? " (The post must be Public.)" : "");
                            if (v.type === "instagram" || v.type === "tiktok") return "\u2713 " + names[v.type] + " \u2014 spectators get a \u201CWatch live\u201D button (" + names[v.type] + " live can\u2019t play inside the page).";
                            return "\u2713 Saved as a \u201CWatch on " + names[v.type] + "\u201D button. Tip: for an in-page player, paste the video\u2019s watch link (youtube.com/watch?v=\u2026 or youtu.be/\u2026).";
                        })())),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg hit", onClick: async () => {
                                try {
                                    await navigator.clipboard.writeText(liveLink());
                                    setLiveCopied(true);
                                    setTimeout(() => setLiveCopied(false), 1500);
                                }
                                catch (_a) { }
                            } }, liveCopied ? "Copied!" : "Copy link"),
                        typeof navigator !== "undefined" && navigator.share && (React.createElement("button", { className: "dg", onClick: () => navigator
                                .share({ title: "DugoutIQ — live game", url: liveLink() })
                                .catch(() => { }) }, "Share\u2026")),
                        liveOn ? (React.createElement("button", { className: "dg ghost", onClick: stopLive }, "Stop sharing")) : (React.createElement("button", { className: "dg", onClick: () => setLiveOn(true) }, "Resume sharing")),
                        React.createElement("button", { className: "dg ghost", onClick: () => setLiveOpen(false) }, "Done")),
                    React.createElement("p", { style: { fontSize: "12px", opacity: 0.7, marginTop: "10px" } }, "Live sharing needs an internet connection. Scoring still works offline \u2014 viewers just see updates when you have signal.")))),
            bookChoose && game && (React.createElement("div", { className: "modal-back", onClick: () => setBookChoose(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Scorebook page"),
                    React.createElement("p", null, "The classic paper card, filled in automatically. Which team?"),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg", onClick: () => shareScorebook("away") },
                            teams.away.name,
                            " (visitors)"),
                        React.createElement("button", { className: "dg", onClick: () => shareScorebook("home") },
                            teams.home.name,
                            " (home)"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setBookChoose(false) }, "Cancel"))))),
            recapPreview && (React.createElement("div", { className: "modal-back", onClick: () => setRecapPreview(null) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, recapPreview.title || "Score graphic"),
                    React.createElement("img", { src: recapPreview.dataUrl, alt: "Game recap graphic", className: "recap-img" }),
                    React.createElement("p", { className: "recap-hint" }, "On iPhone you can also long-press the image \u2192 Save Image"),
                    React.createElement("div", { className: "btnrow" },
                        recapPreview.canShare && (React.createElement("button", { className: "dg hit", onClick: shareRecapFile }, "Share\u2026")),
                        React.createElement("button", { className: "dg", onClick: downloadRecapFile }, "Save to Downloads"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setRecapPreview(null) }, "Close"))))),
            confirmNew && (React.createElement("div", { className: "modal-back", onClick: () => setConfirmNew(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Start a new game?"),
                    React.createElement("p", null, "The current game \u2014 score, stats, pitch counts, and play-by-play \u2014 will be cleared. \"Fresh lineups\" also resets both rosters (your saved teams in \uD83D\uDCC2 My Teams are kept). This can't be undone."),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg hit", onClick: () => {
                                setHistory([]);
                                setConfirmNew(false);
                                playBall();
                            } }, "Rematch \u2014 same lineups (double-header)"),
                        React.createElement("button", { className: "dg outb", onClick: () => {
                                setTeams({
                                    away: { name: "VISITORS", lineup: freshLineup("Batter") },
                                    home: { name: "HOME", lineup: freshLineup("Batter") },
                                });
                                setPhase("setup");
                                setGame(null);
                                setHistory([]);
                                setConfirmNew(false);
                            } }, "New game \u2014 fresh lineups"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setConfirmNew(false) }, "Keep current game"))))),
            baseMenu && game && (React.createElement("div", { className: "modal-back", onClick: closeBaseMenuBackdrop },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation(), style: { position: "relative" } },
                    !menuArmed && (React.createElement("div", { style: { position: "absolute", inset: 0, zIndex: 5, background: "transparent" }, onClick: (e) => { e.stopPropagation(); e.preventDefault(); }, onPointerDown: (e) => { e.stopPropagation(); e.preventDefault(); }, "aria-hidden": "true" })),
                    React.createElement("h3", null,
                        runnerLabel(baseMenu),
                        " on ",
                        baseLabel(baseMenu)),
                    React.createElement("p", null, "What happened?"),
                    React.createElement("div", { className: "btnrow" },
                        game.openHit != null && (React.createElement("button", { className: "dg hit", onClick: () => runnerScoresOnPlay(baseMenu) },
                            "Scores on the play (RBI ",
                            game.lineup[battingSide][game.openHit.b].name,
                            ")")),
                        React.createElement("button", { className: "dg", onClick: () => stealBase(baseMenu) }, baseMenu === "third" ? "Steals home" : `Steals ${baseMenu === "first" ? "2nd" : "3rd"}`),
                        React.createElement("button", { className: "dg", onClick: () => runnerAdvanceOn(baseMenu, "wp") }, baseMenu === "third" ? "Scores on wild pitch" : `Takes ${baseMenu === "first" ? "2nd" : "3rd"} on wild pitch`),
                        React.createElement("button", { className: "dg", onClick: () => runnerAdvanceOn(baseMenu, "pb") }, baseMenu === "third" ? "Scores on passed ball" : `Takes ${baseMenu === "first" ? "2nd" : "3rd"} on passed ball`),
                        React.createElement("button", { className: "dg outb", onClick: () => caughtStealing(baseMenu) }, baseMenu === "third" ? "Caught stealing home" : `Caught stealing ${baseMenu === "first" ? "2nd" : "3rd"}`),
                        React.createElement("button", { className: "dg outb", onClick: () => pickedOff(baseMenu) }, `Picked off ${baseLabel(baseMenu)}`),
                        React.createElement("button", { className: "dg", onClick: () => { const b = baseMenu; setBaseMenu(null); openFieldOne("Error", "Tap the fielder who made the error.", (pos) => advanceOnError(b, pos)); } }, baseMenu === "third" ? "Scores on error (E)" : `Takes ${baseMenu === "first" ? "2nd" : "3rd"} on error (E)`),
                        React.createElement("button", { className: "dg", onClick: () => obstruction(baseMenu) }, baseMenu === "third" ? "Obstruction \u2014 awarded home" : `Obstruction \u2014 awarded ${baseMenu === "first" ? "2nd" : "3rd"}`),
                        React.createElement("button", { className: `dg ${game.openHit != null ? "" : "hit"}`, onClick: () => runnerScores(baseMenu) }, "Scores \u2014 no RBI"),
                        React.createElement("button", { className: "dg outb", onClick: () => runnerOut(baseMenu) }, "Out on the bases"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setCrMenu(baseMenu) }, game.bases[baseMenu] && game.bases[baseMenu].cr ? "Change / remove courtesy runner" : "Courtesy runner"),
                        React.createElement("button", { className: "dg ghost", onClick: () => runnerClear(baseMenu) }, "Remove runner"),
                        React.createElement("button", { className: "dg ghost", onClick: closeBaseMenu }, "Cancel"))))),
            crMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setCrMenu(null) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Courtesy runner"),
                    React.createElement("p", null,
                        "Runs for ",
                        (game.bases[crMenu] && game.bases[crMenu].b != null && game.lineup[battingSide][game.bases[crMenu].b].name) || "the runner",
                        " at ",
                        baseLabel(crMenu),
                        ". Stats stay with the player he runs for."),
                    React.createElement("div", { className: "btnrow" },
                        crCandidates().map((c) => (React.createElement("button", { key: c.i, className: `dg ${c.last ? "hit" : "ghost"}`, onClick: () => setCourtesyRunner(crMenu, c) },
                            c.num ? `#${c.num} ${c.name}` : c.name,
                            c.last ? " \u2014 last out" : ""))),
                        game.bases[crMenu] && game.bases[crMenu].cr && (React.createElement("button", { className: "dg outb", onClick: () => setCourtesyRunner(crMenu, null) }, "Remove courtesy runner")),
                        React.createElement("button", { className: "dg ghost", onClick: () => setCrMenu(null) }, "Cancel"))))),
            fieldPick && game && (React.createElement("div", { className: "modal-back", onClick: cancelFieldPick },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, fieldPick.title || ({ groundout: "Groundout", flyout: "Fly out", popup: "Pop out", lineout: "Line out" })[fieldPick.label] || "Out"),
                    React.createElement("p", null, fieldPick.instr || (isAirOut(fieldPick.label)
                        ? "Tap the fielder who made the catch."
                        : "Tap the fielders in order (e.g. SS then 1B = 6-3).")),
                    !isAirOut(fieldPick.label) && !fieldPick.single && (React.createElement("div", { style: { textAlign: "center", fontFamily: "'Saira Condensed', sans-serif", fontSize: "26px", fontWeight: 700, color: "#F5C518", letterSpacing: ".05em", margin: "4px 0 10px", minHeight: "30px" } }, fieldNote(fieldPick.label, fieldSeq) || "\u2014")),
                    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "12px" } }, FPOS.map((p) => React.createElement("button", { key: p.n, className: "dg outb", onClick: () => pickField(p.n) },
                        p.l,
                        React.createElement("span", { style: { opacity: .55, fontSize: "11px", marginLeft: "5px" } }, p.n)))),
                    React.createElement("div", { className: "btnrow" },
                        !isAirOut(fieldPick.label) && !fieldPick.single && (React.createElement("button", { className: "dg ghost", onClick: () => setFieldSeq((s) => s.slice(0, -1)), disabled: !fieldSeq.length }, "Undo")),
                        React.createElement("button", { className: "dg ghost", onClick: skipFieldOut }, "Skip (no detail)"),
                        !isAirOut(fieldPick.label) && !fieldPick.single && (React.createElement("button", { className: "dg", onClick: recordFieldOut, disabled: !fieldSeq.length }, "Record")))))),
            fcMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setFcMenu(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Fielder's choice"),
                    React.createElement("p", null, "Who was out on the play?"),
                    React.createElement("div", { className: "btnrow" },
                        ["third", "second", "first"].map((b) => game.bases[b] && (() => {
                            // the base the out is recorded at, when it's a true force
                            const isForced = b === "first"
                                ? true
                                : b === "second"
                                    ? !!game.bases.first
                                    : !!game.bases.first && !!game.bases.second;
                            const at = b === "first" ? "2nd" : b === "second" ? "3rd" : "home";
                            return React.createElement("button", { key: b, className: "dg outb", onClick: () => { setFcMenu(false); openFieldSeq("Fielder's choice", "Tap fielders in order (e.g. 6-4).", (note) => playFC(b, note)); } },
                                "Runner from ",
                                baseLabel(b),
                                isForced ? ` out at ${at}` : " out",
                                " \u2014 batter reaches");
                        })()),
                        React.createElement("button", { className: "dg outb", onClick: () => { setFcMenu(false); openFieldSeq("Out at 1st", "Tap fielders in order (e.g. 5-3).", (note) => playFCBatterOut(note)); } }, "Batter out at 1st \u2014 runners advance"),
                        React.createElement("button", { className: "dg", onClick: () => { setFcMenu(false); openFieldSeq("Fielder's choice \u2014 all safe", "Tap fielders in order (e.g. 6-4).", (note) => playFCAllSafe(note)); } }, "Everyone safe \u2014 no out"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setFcMenu(false) }, "Cancel"))))),
            sacMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setSacMenu(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Sacrifice"),
                    React.createElement("p", null, "Batter is out with no at-bat charged \u2014 unless an error lets the batter reach."),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg outb", onClick: () => playSac("fly"), disabled: !game.bases.third }, "Sac fly \u2014 runner on 3rd scores (RBI)"),
                        React.createElement("button", { className: "dg outb", onClick: () => playSac("bunt") }, "Sac bunt \u2014 runners advance"),
                        React.createElement("button", { className: "dg", onClick: () => { setSacMenu(false); openFieldOne("Sacrifice + error", "Tap the fielder who made the error.", (pos) => playSacError("bunt", pos)); } }, "Error on the play \u2014 batter safe, runners take extra base"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setSacMenu(false) }, "Cancel"))))),
            decisionsOpen && game && (React.createElement("div", { className: "modal-back", onClick: () => setDecisionsOpen(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Pitching decisions"),
                    (() => {
                        const aw = totals("away");
                        const hm = totals("home");
                        if (aw === hm)
                            return React.createElement("p", null, "Game is tied \u2014 no decision is recorded.");
                        const winSide = aw > hm ? "away" : "home";
                        const loseSide = winSide === "away" ? "home" : "away";
                        const roles = [
                            ["w", "Win", winSide],
                            ["l", "Loss", loseSide],
                            ["s", "Save (optional)", winSide],
                        ];
                        return roles.map(([role, label, side]) => (React.createElement("div", { key: role, className: "dec-block" },
                            React.createElement("div", { className: "dec-label" },
                                label,
                                " \u2014 ",
                                teams[side].name),
                            React.createElement("div", { className: "dec-row" }, game.pitchers[side].map((pp, i) => {
                                const d = game.decisions || {};
                                const sel = d[role] && d[role].side === side && d[role].idx === i;
                                const blockedSave = role === "s" &&
                                    d.w &&
                                    d.w.side === side &&
                                    d.w.idx === i;
                                return (React.createElement("button", { key: i, disabled: blockedSave, className: `dg ${sel ? "" : "ghost"}`, onClick: () => setDecision(role, side, i) }, pp.name));
                            })))));
                    })(),
                    React.createElement("p", { className: "dec-note" }, "Auto-filled from the final line. Tap to change; tap again to clear."),
                    React.createElement("div", { className: "btnrow", style: { marginTop: 8 } },
                        React.createElement("button", { className: "dg ghost", onClick: () => setDecisionsOpen(false) }, "Done"))))),
            batterMenu && game && game.lineup && (React.createElement("div", { className: "modal-back", onClick: () => setBatterMenu(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "At the plate"),
                    React.createElement("p", null,
                        currentBatterName(),
                        " \u2014 spot ",
                        game.batter[battingSide] + 1,
                        " in the order"),
                    React.createElement("div", { className: "sub-form" },
                        React.createElement("input", { className: "dg-in", placeholder: "Batter name", value: batName, onChange: (e) => setBatName(e.target.value) }),
                        React.createElement("input", { className: "dg-in", placeholder: "#", inputMode: "numeric", style: { maxWidth: 64 }, value: batNum, onChange: (e) => setBatNum(e.target.value) }),
                        React.createElement("input", { className: "dg-in", placeholder: "Pos", style: { maxWidth: 84 }, value: batPos, onChange: (e) => setBatPos(e.target.value) })),
                    React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr 1fr", marginTop: 6 } },
                        React.createElement("button", { className: "dg", disabled: !batName.trim(), onClick: () => {
                                editLineup(battingSide, game.batter[battingSide], batName, batPos, batNum);
                                setBatterMenu(false);
                            } }, "Save name"),
                        React.createElement("button", { className: "dg hit", disabled: !batName.trim(), onClick: () => {
                                substitute(battingSide, game.batter[battingSide], batName, batPos, batNum);
                                setBatterMenu(false);
                            } }, "Pinch hitter")),
                    React.createElement("p", { className: "sub-hint" },
                        React.createElement("b", null, "Save name"),
                        " fixes a typo \u2014 stats untouched.",
                        " ",
                        React.createElement("b", null, "Pinch hitter"),
                        " subs in a new batter; the original keeps their stats."),
                    React.createElement("div", { className: "btnrow", style: { marginTop: 10 } },
                        React.createElement("button", { className: "dg ghost", onClick: () => setBatterMenu(false) }, "Close"))))),
            subMenu && game && game.lineup && (React.createElement("div", { className: "modal-back", onClick: () => {
                    setSubMenu(false);
                    setSubSlot(null);
                } },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Lineup & subs"),
                    React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr 1fr", marginBottom: 10 } }, ["away", "home"].map((sd) => (React.createElement("button", { key: sd, className: `dg ${subSide === sd ? "" : "ghost"}`, onClick: () => {
                            setSubSide(sd);
                            setSubSlot(null);
                        } }, teams[sd].name.slice(0, 12))))),
                    React.createElement("p", { style: { marginTop: 0 } }, "Tap a spot to fix a name or position, swap in a sub, or add a late arrival. Your game data stays put."),
                    React.createElement("p", { className: "order-state" }, orderOpen(subSide)
                        ? "Order open — add or remove spots until it turns over once."
                        : "Order set — first time through the order is complete."),
                    React.createElement("div", { className: "sub-list" }, game.lineup[subSide].map((p, i) => {
                        const onBase = ["first", "second", "third"].find((b) => subSide === battingSide &&
                            game.bases[b] &&
                            game.bases[b].b === i);
                        const atBat = subSide === battingSide && i === game.batter[battingSide];
                        return (React.createElement("button", { key: i, className: `sub-row ${subSlot === i ? "sel" : ""}`, onClick: () => {
                                setSubSlot(i);
                                setSubName(p.name);
                                setSubPos(p.pos || "");
                                setSubNum(p.num || "");
                            } },
                            React.createElement("span", { className: "sub-n" },
                                i + 1,
                                ". ",
                                p.name,
                                p.pos ? ` · ${p.pos}` : ""),
                            atBat && React.createElement("span", { className: "sub-tag" }, "at bat \u2192 PH"),
                            onBase && (React.createElement("span", { className: "sub-tag" },
                                "on",
                                " ",
                                onBase === "first"
                                    ? "1B"
                                    : onBase === "second"
                                        ? "2B"
                                        : "3B",
                                " ",
                                "\u2192 PR"))));
                    })),
                    subSlot != null && (React.createElement("div", { className: "sub-form-wrap" },
                        React.createElement("div", { className: "sub-form" },
                            React.createElement("input", { className: "dg-in", placeholder: "Player name", value: subName, onChange: (e) => setSubName(e.target.value) }),
                            React.createElement("input", { className: "dg-in", placeholder: "#", inputMode: "numeric", style: { maxWidth: 64 }, value: subNum, onChange: (e) => setSubNum(e.target.value) }),
                            React.createElement("input", { className: "dg-in", placeholder: "Pos", style: { maxWidth: 84 }, value: subPos, onChange: (e) => setSubPos(e.target.value) })),
                        React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr 1fr", marginTop: 6 } },
                            React.createElement("button", { className: "dg", disabled: !subName.trim(), onClick: () => editLineup(subSide, subSlot, subName, subPos, subNum) }, "Save edit"),
                            React.createElement("button", { className: "dg hit", disabled: !subName.trim(), onClick: () => substitute(subSide, subSlot, subName, subPos, subNum) }, "Sub \u2014 new player")),
                        slotRemovable(subSide, subSlot)
                            ? React.createElement("button", { className: "dg outb", style: { width: "100%", marginTop: 8 }, onClick: () => removeBatter(subSide, subSlot) }, "Remove this spot from the order")
                            : React.createElement("p", { className: "sub-hint", style: { opacity: .75, marginTop: 8 } }, "A spot can only be removed if that player has no game activity and isn\u2019t at bat or on base. If they\u2019re due up now, tap the next batter first, then remove."),
                        React.createElement("p", { className: "sub-hint" },
                            React.createElement("b", null, "Save edit"),
                            " fixes a name or position \u2014 stats untouched.",
                            " ",
                            React.createElement("b", null, "Sub"),
                            " swaps in a new player; the original keeps their stats."))),
                    React.createElement("div", { className: "btnrow", style: {
                            gridTemplateColumns: orderOpen(subSide) ? "1fr 1fr" : "1fr",
                            marginTop: 10,
                        } },
                        orderOpen(subSide) && (React.createElement("button", { className: "dg ghost", onClick: () => addBatter(subSide) }, "+ Add batter")),
                        React.createElement("button", { className: "dg ghost", onClick: () => {
                                setSubMenu(false);
                                setSubSlot(null);
                            } }, "Close"))))),
            dpMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setDpMenu(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Double play"),
                    React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr 1fr", marginBottom: 10 } },
                        React.createElement("button", { className: `dg ${dpKind === "ground" ? "" : "ghost"}`, onClick: () => setDpKind("ground") }, "Ground ball"),
                        React.createElement("button", { className: `dg ${dpKind === "caught" ? "" : "ghost"}`, onClick: () => setDpKind("caught") }, "Caught \u2014 doubled off")),
                    React.createElement("p", null, dpKind === "caught"
                        ? "Liner or fly caught for the first out. Which runner was doubled off? Other runners hold."
                        : "Batter is forced out at first. Which runner is also out? Other forced runners advance."),
                    React.createElement("div", { className: "btnrow" },
                        ["third", "second", "first"].map((b) => game.bases[b] && (React.createElement("button", { key: b, className: "dg outb", onClick: () => { setDpMenu(false); openFieldSeq("Double play", dpKind === "caught" ? "Tap fielders in order (e.g. 7-4)." : "Tap fielders in order (e.g. 6-4-3).", (note) => playDoublePlay(b, note, dpKind)); } },
                            "Runner from ",
                            baseLabel(b)))),
                        React.createElement("button", { className: "dg ghost", onClick: () => setDpMenu(false) }, "Cancel"))))),
            tpMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setTpMenu(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Triple play"),
                    React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr 1fr", marginBottom: 10 } },
                        React.createElement("button", { className: `dg ${dpKind === "ground" ? "" : "ghost"}`, onClick: () => setDpKind("ground") }, "Ground ball"),
                        React.createElement("button", { className: `dg ${dpKind === "caught" ? "" : "ghost"}`, onClick: () => setDpKind("caught") }, "Caught \u2014 doubled off")),
                    React.createElement("p", null, "Batter is out. Tap the TWO runners also retired."),
                    React.createElement("div", { className: "btnrow" },
                        ["third", "second", "first"].map((b) => game.bases[b] && (React.createElement("button", { key: b, className: `dg ${tpSel.indexOf(b) >= 0 ? "outb" : "ghost"}`, onClick: () => setTpSel((sel) => (sel.indexOf(b) >= 0 ? sel.filter((x) => x !== b) : sel.length < 2 ? [...sel, b] : sel)) },
                            "Runner from ",
                            baseLabel(b),
                            tpSel.indexOf(b) >= 0 ? " \u2713" : ""))),
                        React.createElement("button", { className: "dg", disabled: tpSel.length !== 2, onClick: () => { const sel = tpSel; setTpMenu(false); openFieldSeq("Triple play", dpKind === "caught" ? "Tap fielders in order (e.g. 6-4-3)." : "Tap fielders in order (e.g. 5-4-3).", (note) => playTriplePlay(sel, note, dpKind)); } }, "Record triple play"),
                        React.createElement("button", { className: "dg ghost", onClick: () => { setTpMenu(false); setTpSel([]); } }, "Cancel"))))),
            moreMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setMoreMenu(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "More plays"),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg", onClick: () => playWildPitch("wp"), disabled: !game.bases.first && !game.bases.second && !game.bases.third }, "Wild pitch \u2014 runners advance"),
                        React.createElement("button", { className: "dg", onClick: () => playWildPitch("pb"), disabled: !game.bases.first && !game.bases.second && !game.bases.third }, "Passed ball \u2014 runners advance"),
                        React.createElement("button", { className: "dg hit", onClick: playCatcherInt }, "Catcher's interference \u2014 batter awarded 1st"),
                        React.createElement("button", { className: "dg outb", onClick: playBatterInt }, "Batter's interference \u2014 batter is out"),
                        React.createElement("button", { className: "dg outb", onClick: () => { setMoreMenu(false); setTpSel([]); setTpMenu(true); }, disabled: game.outs !== 0 || ["first", "second", "third"].filter((b) => game.bases[b]).length < 2 }, "Triple play"),
                        React.createElement("button", { className: "dg outb", onClick: () => { setMoreMenu(false); openFieldOne("Infield fly", "Tap the fielder.", (pos) => playOut("infieldfly", false, fieldNote("infieldfly", [pos]))); }, disabled: game.outs >= 2 || !(game.bases.first && game.bases.second) }, "Infield fly \u2014 batter out, runners hold"),
                        React.createElement("button", { className: "dg outb", onClick: () => setRhbMenu(true), disabled: !game.bases.first && !game.bases.second && !game.bases.third }, "Runner hit by batted ball"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setMoreMenu(false) }, "Cancel")),
                    React.createElement("p", { style: { textTransform: "none", letterSpacing: 0, marginTop: 10 } }, "WP/PB moves every runner up a base \u2014 tap the ball or strike first, then the play. For one runner only, tap his base instead. Batter's interference returns the runners; if the umpire called the runner out, use the base menu. Obstruction lives on the runner's base menu \u2014 it isn't an error, so nothing is charged to the defense.")))),
            kMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setKMenu(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Strike three"),
                    React.createElement("p", null, "Called or swinging? A called third strike is scored with a backwards K."),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg outb", onClick: () => { setKMenu(false); tapStrike("looking"); } }, "Called (looking) \u2014 \uA4D8"),
                        React.createElement("button", { className: "dg outb", onClick: () => { setKMenu(false); tapStrike("swinging"); } }, "Swinging \u2014 K"),
                        React.createElement("button", { className: "dg", onClick: () => { setKMenu(false); tapStrike(); } }, "Just a strikeout (K)"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setKMenu(false) }, "Cancel"))))),
            rhbMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setRhbMenu(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Runner hit by batted ball"),
                    React.createElement("p", null, "Which runner was hit? He's out, the ball is dead, and the batter is credited a single."),
                    React.createElement("div", { className: "btnrow" },
                        ["third", "second", "first"].map((b) => game.bases[b] && (React.createElement("button", { key: b, className: "dg outb", onClick: () => playRunnerHit(b) },
                            "Runner from ",
                            baseLabel(b),
                            " \u2014 ",
                            runnerLabel(b)))),
                        React.createElement("button", { className: "dg ghost", onClick: () => setRhbMenu(false) }, "Cancel"))))),
            tagMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setTagMenu(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Tag up"),
                    React.createElement("p", null, "Runners advancing after the catch. Lead runner first."),
                    React.createElement("div", { className: "btnrow" },
                        game.bases.third && (React.createElement("button", { className: "dg hit", onClick: () => {
                                tagUpScore();
                                setTagMenu(false);
                            } }, "Runner on 3rd scores (sac fly)")),
                        game.bases.second && !game.bases.third && (React.createElement("button", { className: "dg outb", onClick: () => {
                                tagUpAdvance("second");
                                setTagMenu(false);
                            } }, "Runner 2nd \u2192 3rd")),
                        game.bases.first && !game.bases.second && (React.createElement("button", { className: "dg outb", onClick: () => {
                                tagUpAdvance("first");
                                setTagMenu(false);
                            } }, "Runner 1st \u2192 2nd")),
                        React.createElement("button", { className: "dg ghost", onClick: () => setTagMenu(false) }, "Done"))))),
            pitchMenuSide && game && (React.createElement("div", { className: "modal-back", onClick: () => setPitchMenuSide(null) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Pitching log"),
                    React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr 1fr", marginBottom: 10 } }, ["away", "home"].map((sd) => (React.createElement("button", { key: sd, className: `dg ${pitchMenuSide === sd ? "" : "ghost"}`, onClick: () => setPitchMenuSide(sd) }, teams[sd].name.slice(0, 12))))),
                    React.createElement("div", { className: "plog" },
                        React.createElement("div", { className: "plog-row head" },
                            React.createElement("span", { className: "plog-name done" }, "Pitcher"),
                            React.createElement("span", { className: "plog-stats" }, ["IP", "H", "R", "ER", "BB", "K", "HR", "NP"].map((h) => (React.createElement("span", { key: h }, h))))),
                        game.pitchers[pitchMenuSide].map((p, i) => {
                            const isCur = i === game.pitchers[pitchMenuSide].length - 1;
                            return (React.createElement("div", { className: `plog-row ${isCur ? "cur" : ""}`, key: i },
                                isCur ? (React.createElement("span", { className: "plog-name pn-wrap" },
                                    React.createElement("input", { className: "dg-in jersey-in", value: p.num || "", onChange: (e) => setPitcherNum(e.target.value), inputMode: "numeric", placeholder: "#", "aria-label": "Current pitcher number" }),
                                    React.createElement("input", { className: "dg-in", value: p.name, onChange: (e) => renamePitcher(e.target.value), onBlur: commitPitcherName, "aria-label": "Current pitcher name" }),
                                    decisionTag(pitchMenuSide, i) && (React.createElement("b", { className: "dtag" }, decisionTag(pitchMenuSide, i))))) : (React.createElement("span", { className: "plog-name done" },
                                    p.num ? `#${p.num} ${p.name}` : p.name,
                                    decisionTag(pitchMenuSide, i) && (React.createElement("b", { className: "dtag" },
                                        " ",
                                        decisionTag(pitchMenuSide, i))))),
                                React.createElement("span", { className: "plog-stats" },
                                    React.createElement("span", null, ipDisplay(p.outs)),
                                    React.createElement("span", null, p.h),
                                    React.createElement("span", null, p.r),
                                    React.createElement("span", null, earnedOf(p)),
                                    React.createElement("span", null, p.bb),
                                    React.createElement("span", null, p.k),
                                    React.createElement("span", null, p.hr),
                                    React.createElement("span", null, p.pitches))));
                        }),
                        React.createElement("div", { className: "plog-row total" },
                            React.createElement("span", { className: "plog-name done" }, "Staff"),
                            React.createElement("span", { className: "plog-stats" },
                                React.createElement("span", null, ipDisplay(game.pitchers[pitchMenuSide].reduce((s, p) => s + p.outs, 0))),
                                React.createElement("span", null, game.pitchers[pitchMenuSide].reduce((s, p) => s + p.h, 0)),
                                React.createElement("span", null, game.pitchers[pitchMenuSide].reduce((s, p) => s + p.r, 0)),
                                React.createElement("span", null, game.pitchers[pitchMenuSide].reduce((s, p) => s + earnedOf(p), 0)),
                                React.createElement("span", null, game.pitchers[pitchMenuSide].reduce((s, p) => s + p.bb, 0)),
                                React.createElement("span", null, game.pitchers[pitchMenuSide].reduce((s, p) => s + p.k, 0)),
                                React.createElement("span", null, game.pitchers[pitchMenuSide].reduce((s, p) => s + p.hr, 0)),
                                React.createElement("span", null, staffTotal(game, pitchMenuSide))))),
                    React.createElement("div", { className: "uer-row" },
                        React.createElement("span", null,
                            "Unearned runs \u00B7 ",
                            curP(game, pitchMenuSide).name,
                            " (ER =",
                            " ",
                            earnedOf(curP(game, pitchMenuSide)),
                            ")"),
                        React.createElement("div", { className: "uer-ctl" },
                            React.createElement("button", { className: "dg ghost", onClick: () => adjustUER(-1) }, "\u2212"),
                            React.createElement("b", null, curP(game, pitchMenuSide).uer || 0),
                            React.createElement("button", { className: "dg ghost", onClick: () => adjustUER(1) }, "\uFF0B"))),
                    game.pitchers[pitchMenuSide].some((pp) => pInnStr(pp)) && (React.createElement("div", { style: { margin: "6px 0 12px", padding: "10px 12px", background: "rgba(43,90,160,.12)", border: "1px solid rgba(43,90,160,.35)", borderRadius: "10px" } },
                        React.createElement("div", { style: { fontSize: "11px", letterSpacing: ".07em", textTransform: "uppercase", color: "#A9C5E8", marginBottom: "6px" } }, "Pitches by inning"),
                        game.pitchers[pitchMenuSide].filter((pp) => pInnStr(pp)).map((pp, i) => React.createElement("div", { key: i, style: { fontSize: "13px", margin: "3px 0", color: "#fff" } },
                            React.createElement("b", null, pp.name + ":  "),
                            pInnStr(pp, "  \u00B7  ", "Inn "))))),
                    (() => {
                        const pp = curP(game, pitchMenuSide);
                        const cred = creditedOf(pp);
                        const nt = division ? nextThresholdFor(division, pp.pitches + 1) : null;
                        const rest = division ? daysRestFor(division, cred) : null;
                        const boxStyle = { margin: "6px 0 12px", padding: "10px 12px", background: "rgba(198,57,57,.10)", border: "1px solid rgba(198,57,57,.4)", borderRadius: "10px" };
                        return React.createElement("div", { style: boxStyle },
                            division && (React.createElement("div", { style: { fontSize: "13px", color: "#fff", marginBottom: "8px" } },
                                React.createElement("b", null, `BNS ${division}: `),
                                nt != null
                                    ? `next threshold ${nt} (${Math.max(0, nt - pp.pitches)} away)`
                                    : "past daily max",
                                ` \u00B7 ${rest} day${rest === 1 ? "" : "s"} rest required so far`)),
                            pp.lastB
                                ? React.createElement("div", { className: "limitrow" },
                                    React.createElement("span", { style: { color: "#fff", fontSize: "13px", flex: 1 } },
                                        "Last batter called \u2014 credited",
                                        pp.pitches !== pp.lastB.at ? ` (threw ${pp.pitches})` : ""),
                                    React.createElement("input", { className: "dg-in", type: "number", min: "0", max: "200", style: { width: 64 }, value: pp.lastB.at, onChange: (e) => editLastBatter(e.target.value), "aria-label": "Credited pitch count" }),
                                    React.createElement("button", { className: "dg ghost", style: { padding: "6px 10px" }, onClick: clearLastBatter }, "Clear"))
                                : React.createElement("button", { className: "dg outb", style: { width: "100%" }, disabled: pitchMenuSide !== fieldingSide || game.over || pp.pitches <= 0, onClick: callLastBatter },
                                    "\uD83D\uDD90 Last batter called \u2014 credit at ",
                                    pp.pitches,
                                    " pitches"));
                    })(),
                    pitchLimit > 0 && (React.createElement("p", { className: `limitstatus ${pitchStatus(curP(game, pitchMenuSide).pitches)}` }, pitchStatus(curP(game, pitchMenuSide).pitches) === "over"
                        ? `At/over the ${pitchLimit}-pitch limit — change pitchers`
                        : `${Math.max(0, pitchLimit - curP(game, pitchMenuSide).pitches)} pitches remaining of ${pitchLimit}`)),
                    React.createElement("div", { className: "limitrow", style: { marginBottom: 10 } },
                        React.createElement("input", { className: "dg-in", type: "number", min: "0", max: "200", value: pitchLimit, onChange: (e) => setPitchLimit(Math.max(0, parseInt(e.target.value || "0", 10))), "aria-label": "Pitch limit per pitcher" }),
                        React.createElement("span", { className: "limithint" }, "pitch limit (0 = off)")),
                    React.createElement("select", { className: "dg-sel", style: { marginBottom: 10 }, value: incomingName, onChange: (e) => setIncomingName(e.target.value), "aria-label": "Incoming pitcher" },
                        React.createElement("option", { value: "" },
                            "Incoming pitcher\u2026 (default P",
                            game.pitchers[pitchMenuSide].length + 1,
                            ")"),
                        ((game.lineup && game.lineup[pitchMenuSide]) || teams[pitchMenuSide].lineup).map((p, i) => (React.createElement("option", { key: i, value: p.name },
                            p.num ? `#${p.num} ` : "",
                            p.name,
                            p.pos ? ` (${p.pos})` : "")))),
                    React.createElement("button", { className: "dg hit", style: { width: "100%", marginBottom: 8 }, onClick: newPitcher }, "Bring in new pitcher"),
                    pitchMenuSide === fieldingSide &&
                        !game.over &&
                        (game.bases.first || game.bases.second || game.bases.third) && (React.createElement("button", { className: "dg outb", style: { width: "100%", marginBottom: 8 }, onClick: playBalk }, "Balk \u2014 all runners advance one base")),
                    React.createElement("button", { className: "dg ghost", style: { width: "100%", marginBottom: 8 }, onClick: () => {
                            setPitchMenuSide(null);
                            setSheetOpen(true);
                        } }, "\uD83D\uDCCB Pitch count sheet"),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg ghost", onClick: () => setPitchMenuSide(null) }, "Cancel"))))))));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(DugoutScorecard));
