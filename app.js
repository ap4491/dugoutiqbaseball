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
const freshLineup = (label, n = 12) => Array.from({ length: n }, (_, i) => ({ name: `${label} ${i + 1}`, pos: "" }));
const freshStats = (n) => Array.from({ length: n }, () => ({ ab: 0, h: 0, r: 0, rbi: 0, bb: 0, k: 0 }));
const emptyBases = () => ({ first: false, second: false, third: false });
const freshPitcher = (name) => ({
    name,
    pitches: 0,
    outs: 0, // outs recorded -> IP
    k: 0,
    bb: 0,
    h: 0,
    r: 0,
    hr: 0,
});
const ipDisplay = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;
const snapshot = (s) => JSON.parse(JSON.stringify(s));
const SAVE_KEY = "dugoutiq-save-v1";
const loadSaved = () => {
    try {
        return JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    }
    catch {
        return null;
    }
};
const saved0 = loadSaved();
// License activation — verified once against the license server, then remembered
// on this device forever. Activation never re-checks and never blocks offline use.
const LICENSE_KEY_STORE = "dugoutiq-license-v1";
const loadActivation = () => {
    try {
        return localStorage.getItem(LICENSE_KEY_STORE);
    }
    catch {
        return null;
    }
};
const persistActivation = (k) => {
    try {
        localStorage.setItem(LICENSE_KEY_STORE, k);
    }
    catch { }
};
const verifyLicense = async (key) => {
    try {
        const r = await fetch("/.netlify/functions/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: key.trim() }),
        });
        const data = await r.json().catch(() => null);
        if (data && data.ok)
            return { ok: true };
        return {
            ok: false,
            message: (data && data.message) || "Key not recognized — check it against your receipt.",
        };
    }
    catch {
        return {
            ok: false,
            message: "Couldn't reach the license server — check your connection and try once; after activation the app works fully offline.",
        };
    }
};
// Saved roster store — persists on this device
const ROSTERS_KEY = "dugoutiq-rosters-v1";
const loadRosters = () => {
    try {
        return JSON.parse(localStorage.getItem(ROSTERS_KEY) || "[]");
    }
    catch {
        return [];
    }
};
const persistRosters = (list) => {
    try {
        localStorage.setItem(ROSTERS_KEY, JSON.stringify(list));
    }
    catch { }
};
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
        catch {
            setLicenseErr("Couldn't reach the license server — check your connection and try again.");
        }
        setLicenseBusy(false);
    };
    const [phase, setPhase] = useState((saved0 && saved0.phase) || "setup");
    const [teams, setTeams] = useState((saved0 && saved0.teams) || {
        away: { name: "VISITORS", lineup: freshLineup("Batter") },
        home: { name: "HOME", lineup: freshLineup("Batter") },
    });
    const [game, setGame] = useState((saved0 && saved0.game) || null);
    const [baseMenu, setBaseMenu] = useState(null); // which occupied base was tapped
    const [pitchMenuSide, setPitchMenuSide] = useState(null); // null | "away" | "home"
    const [pitchLimit, setPitchLimit] = useState(saved0 && saved0.pitchLimit != null ? saved0.pitchLimit : 85); // 0 = off
    const [incomingName, setIncomingName] = useState("");
    const [showLog, setShowLog] = useState(false);
    // autosave so a locked phone or closed tab never loses the game
    useEffect(() => {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify({ phase, teams, game, pitchLimit }));
        }
        catch { }
    }, [phase, teams, game, pitchLimit]);
    const [fcMenu, setFcMenu] = useState(false);
    const [confirmNew, setConfirmNew] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [recapPreview, setRecapPreview] = useState(null); // {dataUrl, canShare}
    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState("");
    const [setupMsg, setSetupMsg] = useState("");
    const [history, setHistory] = useState([]);
    /* ---------------- setup helpers ---------------- */
    const setTeamName = (side, name) => setTeams((t) => ({ ...t, [side]: { ...t[side], name } }));
    const setPlayer = (side, idx, field, value) => setTeams((t) => {
        const lineup = t[side].lineup.map((p, i) => i === idx ? { ...p, [field]: value } : p);
        return { ...t, [side]: { ...t[side], lineup } };
    });
    const addPlayer = (side) => setTeams((t) => {
        if (t[side].lineup.length >= MAX_BATTERS)
            return t;
        const lineup = [
            ...t[side].lineup,
            { name: `Batter ${t[side].lineup.length + 1}`, pos: "" },
        ];
        return { ...t, [side]: { ...t[side], lineup } };
    });
    const removePlayer = (side, idx) => setTeams((t) => {
        if (t[side].lineup.length <= MIN_BATTERS)
            return t;
        const lineup = t[side].lineup.filter((_, i) => i !== idx);
        return { ...t, [side]: { ...t[side], lineup } };
    });
    /* --- My Teams: saved roster library --- */
    const [rosters, setRosters] = useState(loadRosters);
    const [teamPickSide, setTeamPickSide] = useState(null); // which side to load into
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
        setTeams((t) => ({
            ...t,
            [side]: { name: r.name, lineup: snapshot(r.lineup) },
        }));
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
        return { ...t, [side]: { ...t[side], lineup } };
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
        setRowDragBoth({ ...d, dy: e.clientY - d.startY });
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
        catch {
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
                    lineup: data.away.lineup.map((p) => ({ name: p.name, pos: p.pos || "" })),
                },
                home: {
                    name: data.home.name,
                    lineup: data.home.lineup.map((p) => ({ name: p.name, pos: p.pos || "" })),
                },
            });
            setImportOpen(false);
            setImportText("");
            setSetupMsg("Lineups imported");
        }
        catch {
            setSetupMsg("That didn't look like a DugoutIQ lineup code — copy it with Export Lineups first");
            setImportOpen(false);
            setImportText("");
        }
    };
    const starterName = (side) => {
        const p = teams[side].lineup.find((pl) => pl.pos === "P");
        return p && p.name.trim() ? p.name : "P1";
    };
    const playBall = () => {
        setGame({
            inning: 1,
            half: "top",
            balls: 0,
            strikes: 0,
            outs: 0,
            bases: emptyBases(),
            openHit: null, // {b: batter idx, log: PA log index} of the just-recorded hit
            batter: { away: 0, home: 0 },
            stats: {
                away: freshStats(teams.away.lineup.length),
                home: freshStats(teams.home.lineup.length),
            },
            linescore: [{ away: 0, home: null }],
            hits: { away: 0, home: 0 },
            errors: { away: 0, home: 0 },
            pitchers: {
                away: [freshPitcher(starterName("away"))],
                home: [freshPitcher(starterName("home"))],
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
    const addRuns = (g, n) => {
        if (n <= 0)
            return;
        const row = g.linescore[g.inning - 1];
        row[battingSide] = (row[battingSide] || 0) + n;
    };
    const nextBatter = (g) => {
        g.batter[battingSide] =
            (g.batter[battingSide] + 1) % teams[battingSide].lineup.length;
        g.balls = 0;
        g.strikes = 0;
    };
    const endHalf = (g) => {
        g.balls = 0;
        g.strikes = 0;
        g.outs = 0;
        g.bases = emptyBases();
        g.openHit = null;
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
    };
    const recordOut = (g) => {
        g.outs += 1;
        if (g.outs >= 3) {
            endHalf(g);
            return true;
        }
        return false;
    };
    const currentBatterName = () => teams[battingSide].lineup[game.batter[battingSide]].name;
    // current pitcher = last entry in the team's pitcher list
    const curP = (g, side) => g.pitchers[side][g.pitchers[side].length - 1];
    const staffTotal = (g, side) => g.pitchers[side].reduce((s, p) => s + p.pitches, 0);
    // every pitch is charged to the fielding team's current pitcher
    const addPitch = (g) => {
        curP(g, fieldingSide).pitches += 1;
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
        g.log.push({
            type: "pa",
            i: g.inning,
            h: g.half,
            batter: teams[battingSide].lineup[g.batter[battingSide]].name,
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
    const closePA = (g, result, ticker) => {
        ensurePA(g);
        g.log[g.openPA].result = result;
        g.openPA = null;
        g.lastPlay = ticker;
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
        if (runner && runner.b != null)
            g.stats[battingSide][runner.b].r += 1;
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
            else
                next[slot(target)] = runner;
        }
        if (batterIdx != null) {
            if (n >= 4) {
                runs += 1;
                creditRun(g, { b: batterIdx });
            }
            else
                next[slot(n)] = { b: batterIdx };
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
                g.bases.third = g.bases.second;
            }
            g.bases.second = g.bases.first;
        }
        g.bases.first = { b: batterIdx };
        return runs;
    };
    /* --- count buttons --- */
    const tapBall = () => mutate((g) => {
        addPitch(g);
        g.openHit = null;
        if (g.balls === 3) {
            const st = g.stats[battingSide][g.batter[battingSide]];
            st.bb += 1;
            chargeP(g, "bb");
            const runs = forceAdvance(g, g.batter[battingSide]);
            addRuns(g, runs);
            st.rbi += runs; // bases-loaded walk
            chargeP(g, "r", runs);
            closePA(g, runs ? "walk, run forced in" : "walk", `${currentBatterName()} walks${runs ? ", run forced in" : ""}`);
            nextBatter(g);
        }
        else {
            g.balls += 1;
            logPitch(g, "ball", `Ball ${g.balls}`);
        }
    });
    const tapStrike = () => mutate((g) => {
        addPitch(g);
        g.openHit = null;
        if (g.strikes === 2) {
            const st = g.stats[battingSide][g.batter[battingSide]];
            st.ab += 1;
            st.k += 1;
            chargeP(g, "k");
            chargeP(g, "outs");
            closePA(g, "strikeout", `${currentBatterName()} strikes out`);
            const flipped = recordOut(g);
            if (!flipped)
                nextBatter(g);
            else
                advanceOrder(g);
        }
        else {
            g.strikes += 1;
            logPitch(g, "strike", `Strike ${g.strikes}`);
        }
    });
    const tapHBP = () => mutate((g) => {
        addPitch(g);
        g.openHit = null;
        const bIdx = g.batter[battingSide];
        const st = g.stats[battingSide][bIdx];
        st.bb += 1; // HBP counted with walks in the BB column
        chargeP(g, "bb");
        const runs = forceAdvance(g, bIdx);
        addRuns(g, runs);
        st.rbi += runs;
        chargeP(g, "r", runs);
        closePA(g, runs ? "hit by pitch, run forced in" : "hit by pitch", `${currentBatterName()} hit by pitch${runs ? ", run forced in" : ""}`);
        nextBatter(g);
    });
    const tapFoul = () => mutate((g) => {
        addPitch(g);
        g.openHit = null;
        if (g.strikes < 2)
            g.strikes += 1;
        logPitch(g, "foul", "Foul ball");
    });
    // advance batting order without resetting the (already reset) count
    const advanceOrder = (g) => {
        g.batter[battingSide] =
            (g.batter[battingSide] + 1) % teams[battingSide].lineup.length;
    };
    /* --- play outcomes (one tap, auto baserunning) --- */
    const playHit = (basesTaken, label) => mutate((g) => {
        addPitch(g);
        const bIdxForHit = g.batter[battingSide];
        const st = g.stats[battingSide][g.batter[battingSide]];
        const name = currentBatterName();
        st.ab += 1;
        st.h += 1;
        g.hits[battingSide] += 1;
        chargeP(g, "h");
        if (basesTaken >= 4)
            chargeP(g, "hr");
        const runs = advanceAll(g, basesTaken, g.batter[battingSide]);
        addRuns(g, runs);
        st.rbi += runs;
        chargeP(g, "r", runs);
        closePA(g, `${label}${runs ? ` — ${runs} score${runs > 1 ? "" : "s"}` : ""}`, `${name}: ${label}${runs ? ` — ${runs} score${runs > 1 ? "" : "s"}` : ""}`);
        g.openHit = { b: bIdxForHit, log: g.log.length - 1 };
        nextBatter(g);
    });
    const playError = () => mutate((g) => {
        addPitch(g);
        g.openHit = null;
        const st = g.stats[battingSide][g.batter[battingSide]];
        const name = currentBatterName();
        st.ab += 1;
        g.errors[fieldingSide] += 1;
        const runs = forceAdvance(g, g.batter[battingSide]);
        addRuns(g, runs); // unearned, no RBI
        chargeP(g, "r", runs);
        closePA(g, `reached on error${runs ? ", run scores" : ""}`, `${name} reaches on error${runs ? ", run scores" : ""}`);
        nextBatter(g);
    });
    const playOut = (label, isK) => mutate((g) => {
        addPitch(g);
        g.openHit = null;
        const st = g.stats[battingSide][g.batter[battingSide]];
        const name = currentBatterName();
        st.ab += 1;
        if (isK)
            st.k += 1;
        chargeP(g, "outs");
        if (isK)
            chargeP(g, "k");
        closePA(g, label, `${name}: ${label}`);
        const flipped = recordOut(g);
        if (!flipped)
            nextBatter(g);
        else
            advanceOrder(g);
    });
    // Fielder's choice: batter reaches, the selected runner is forced out.
    // Remaining runners + batter advance on the force.
    const playFC = (outBase) => {
        mutate((g) => {
            addPitch(g);
            g.openHit = null;
            const bIdx = g.batter[battingSide];
            const st = g.stats[battingSide][bIdx];
            const name = currentBatterName();
            st.ab += 1;
            chargeP(g, "outs");
            g.bases[outBase] = false;
            closePA(g, `fielder's choice — runner from ${baseLabel(outBase)} forced out`, `${name}: fielder's choice — runner from ${baseLabel(outBase)} forced out`);
            const flipped = recordOut(g);
            if (!flipped) {
                const runs = forceAdvance(g, bIdx);
                addRuns(g, runs);
                chargeP(g, "r", runs);
                if (runs)
                    logPlay(g, "Run forced in on the play", "info");
                nextBatter(g);
            }
            else
                advanceOrder(g);
        });
        setFcMenu(false);
    };
    /* --- diamond interactions: tap = menu/place, drag = move runner --- */
    const svgRef = useRef(null);
    const [drag, setDrag] = useState(null); // {from, x, y, moved, sx, sy}
    const dragRef = useRef(null); // synchronous mirror — guards against duplicate pointer events
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
        return r.b != null ? teams[battingSide].lineup[r.b].name : "Runner";
    };
    const moveRunner = (from, to) => {
        const who = runnerLabel(from);
        if (to === "home") {
            mutate((g) => {
                creditRun(g, g.bases[from]);
                g.bases[from] = false;
                addRuns(g, 1);
                chargeP(g, "r");
                if (g.openHit != null) {
                    g.stats[battingSide][g.openHit.b].rbi += 1;
                    const batterName = teams[battingSide].lineup[g.openHit.b].name;
                    amendOpenHit(g, `${who} scores`, `${who} scores on the play — RBI ${batterName}`);
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
            if (g.openHit != null) {
                amendOpenHit(g, `${who} to ${baseLabel(to)}`, `${who} takes ${baseLabel(to)} on the play`);
            }
            else {
                logPlay(g, `${who}: ${baseLabel(from)} → ${baseLabel(to)}`);
            }
        });
    };
    const basePointerDown = (base) => (e) => {
        if (game.over)
            return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = svgPoint(e);
        setDragBoth({
            from: base,
            occupied: !!game.bases[base],
            x: p.x,
            y: p.y,
            sx: e.clientX,
            sy: e.clientY,
            moved: false,
        });
    };
    const basePointerMove = (e) => {
        const d = dragRef.current;
        if (!d)
            return;
        e.stopPropagation();
        const p = svgPoint(e);
        const moved = d.moved || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8;
        setDragBoth({ ...d, x: p.x, y: p.y, moved });
    };
    const basePointerUp = (e) => {
        const d = dragRef.current;
        if (!d)
            return; // already resolved — duplicate event
        e.stopPropagation();
        setDragBoth(null);
        if (!d.moved) {
            // plain tap
            if (d.occupied)
                setBaseMenu(d.from);
            else
                mutate((g) => {
                    g.bases[d.from] = { b: null };
                    logPlay(g, `Runner placed on ${baseLabel(d.from)}`);
                });
            return;
        }
        if (!d.occupied)
            return; // dragged from an empty base — nothing to move
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const target = el && el.closest ? el.closest("[data-base]") : null;
        const to = target ? target.getAttribute("data-base") : null;
        if (!to || to === d.from)
            return; // dropped off the bases — cancel
        moveRunner(d.from, to);
    };
    const runnerScores = (base) => {
        const who = runnerLabel(base);
        mutate((g) => {
            creditRun(g, g.bases[base]);
            g.bases[base] = false;
            addRuns(g, 1);
            chargeP(g, "r");
            logPlay(g, `${who} scores from ${baseLabel(base)} (steal/PB/WP — no RBI)`);
        });
        setBaseMenu(null);
    };
    // Runner takes home as part of the just-recorded hit — batter gets the RBI
    const runnerScoresOnPlay = (base) => {
        const who = runnerLabel(base);
        mutate((g) => {
            creditRun(g, g.bases[base]);
            g.bases[base] = false;
            addRuns(g, 1);
            chargeP(g, "r");
            if (g.openHit != null) {
                g.stats[battingSide][g.openHit.b].rbi += 1;
                const batterName = teams[battingSide].lineup[g.openHit.b].name;
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
                addRuns(g, 1);
                chargeP(g, "r");
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
            logPlay(g, `${who} steals ${baseLabel(target)}`);
        });
        setBaseMenu(null);
    };
    const runnerOut = (base) => {
        const who = runnerLabel(base);
        mutate((g) => {
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
    const runnerClear = (base) => {
        const who = runnerLabel(base);
        mutate((g) => {
            g.bases[base] = false;
            logPlay(g, `${who} removed from ${baseLabel(base)}`, "info");
        });
        setBaseMenu(null);
    };
    const newPitcher = () => {
        const side = pitchMenuSide || fieldingSide;
        const name = incomingName.trim() || `P${game.pitchers[side].length + 1}`;
        mutate((g) => {
            const prev = curP(g, side);
            g.pitchers[side].push(freshPitcher(name));
            logPlay(g, `Pitching change (${teams[side].name}): ${name} in for ${prev.name} (${prev.pitches} pitches)`, "info");
        });
        setIncomingName("");
        setPitchMenuSide(null);
    };
    // rename current pitcher without polluting undo history
    const renamePitcher = (value) => setGame((g) => {
        const n = snapshot(g);
        curP(n, pitchMenuSide || fieldingSide).name = value;
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
    const endGame = () => mutate((g) => {
        g.over = true;
        g.bases = emptyBases();
        logPlay(g, "Final", "info");
    });
    const totals = (side) => game.linescore.reduce((sum, r) => sum + (r[side] || 0), 0);
    const setBatterIndex = (idx) => mutate((g) => {
        g.batter[battingSide] = idx;
        g.balls = 0;
        g.strikes = 0;
        g.openPA = null;
        logPlay(g, `Now batting: ${teams[battingSide].lineup[idx].name}`, "info");
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
            .map((pp) => `${pp.name}: ${ipDisplay(pp.outs)} IP, ${pp.h} H, ${pp.r} R, ${pp.bb} BB, ${pp.k} K, ${pp.hr} HR, ${pp.pitches} NP`)
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
        const finish = (logoImg) => {
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
            const teamRow = (name, score, win, ty) => {
                ctx.textAlign = "left";
                ctx.fillStyle = win && game.over ? "#F5C518" : "#FFFFFF";
                ctx.font = "700 58px 'Saira Condensed', sans-serif";
                ctx.fillText(name.toUpperCase().slice(0, 16), 110, ty);
                ctx.textAlign = "right";
                ctx.font = "700 96px 'IBM Plex Mono', monospace";
                ctx.fillText(String(score), W - 110, ty + 10);
            };
            teamRow(teams.away.name, totals("away"), aWin, y + 60);
            teamRow(teams.home.name, totals("home"), hWin, y + 180);
            y += 250;
            // linescore grid
            const maxInn = 12;
            const innings = game.linescore.slice(-maxInn);
            const skipped = game.linescore.length - innings.length;
            const cols = innings.length + 3;
            const gridW = W - 220;
            const colW = Math.min(70, gridW / cols);
            const startX = (W - (colW * cols + 110)) / 2 + 110;
            ctx.font = "500 30px 'IBM Plex Mono', monospace";
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
                ctx.font = "700 32px 'IBM Plex Mono', monospace";
                ctx.fillStyle = "#FFFFFF";
                innings.forEach((r, i) => {
                    ctx.fillText(r[side] === null ? "-" : String(r[side]), startX + colW * i + colW / 2, ry);
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
        const img = new Image();
        img.onload = () => finish(img);
        img.onerror = () => finish(null);
        img.src = LOGO;
    });
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
        catch {
            mutate((g) => (g.lastPlay = "Couldn't create the score graphic on this device"));
        }
    };
    const shareRecapFile = async () => {
        if (!recapPreview)
            return;
        try {
            const blob = await (await fetch(recapPreview.dataUrl)).blob();
            const file = new File([blob], "dugoutiq-recap.png", { type: "image/png" });
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
        a.download = "dugoutiq-recap.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        mutate((g) => (g.lastPlay = "Saved to your Downloads folder (Files app on iPhone)"));
    };
    // Narrative game story composed from the actual game data — free & offline
    const buildGameStory = () => {
        const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][Math.min(n % 10, 4)] || "th");
        const aT = totals("away");
        const hT = totals("home");
        const tied = aT === hT;
        const winSide = aT > hT ? "away" : "home";
        const loseSide = winSide === "away" ? "home" : "away";
        const W = teams[winSide].name;
        const L = teams[loseSide].name;
        const wT = totals(winSide);
        const lT = totals(loseSide);
        const paras = [];
        // headline
        if (game.over && !tied) {
            const margin = wT - lT;
            const verb = margin >= 6 ? "rolled past" : margin >= 3 ? "beat" : "edged";
            paras.push(`${W} ${verb} ${L} ${wT}-${lT}${game.inning > 9 ? ` in ${game.inning} innings` : ""}.`);
        }
        else if (game.over && tied) {
            paras.push(`${teams.away.name} and ${teams.home.name} played to a ${aT}-${aT} tie.`);
        }
        else {
            paras.push(`${teams.away.name} ${aT > hT ? "lead" : aT < hT ? "trail" : "are tied with"} ${teams.home.name} ${Math.max(aT, hT)}-${Math.min(aT, hT)} through ${game.half === "top" ? "the top of" : ""} the ${ord(game.inning)}.`);
        }
        // biggest inning + its scoring plays
        let bigSide = null, bigInn = -1, bigRuns = 0;
        ["away", "home"].forEach((side) => {
            game.linescore.forEach((r, i) => {
                if ((r[side] || 0) > bigRuns) {
                    bigRuns = r[side] || 0;
                    bigInn = i + 1;
                    bigSide = side;
                }
            });
        });
        if (bigSide && bigRuns >= 2) {
            const plays = game.log
                .filter((e) => e.i === bigInn &&
                (bigSide === "away") === (e.h === "top") &&
                e.type === "pa" &&
                e.result &&
                /score|run forced/i.test(e.result))
                .map((e) => `${e.batter}'s ${e.result.split(" — ")[0].split(",")[0]}`);
            let sentence = `${teams[bigSide].name} did most of the damage with a ${bigRuns}-run ${ord(bigInn)}`;
            if (plays.length)
                sentence += `, keyed by ${plays.slice(0, 2).join(" and ")}`;
            paras.push(sentence + ".");
        }
        // home runs
        const hrs = game.log.filter((e) => e.type === "pa" && e.result && /HOME RUN/i.test(e.result));
        if (hrs.length)
            paras.push(hrs
                .map((e) => `${e.batter} went deep in the ${ord(e.i)}`)
                .join("; ") + ".");
        // top hitter per team
        const hitterLine = (side) => {
            let best = null, bi = -1;
            game.stats[side].forEach((st, i) => {
                const score = st.h * 10 + st.rbi * 5 + st.r;
                if (st.h >= 2 || st.rbi >= 2) {
                    if (!best || score > bi) {
                        best = { ...st, i };
                        bi = score;
                    }
                }
            });
            if (!best)
                return null;
            const nm = teams[side].lineup[best.i].name;
            const bits = [`went ${best.h}-for-${best.ab}`];
            if (best.rbi)
                bits.push(`${best.rbi} RBI`);
            if (best.r)
                bits.push(`${best.r} run${best.r > 1 ? "s" : ""} scored`);
            return `${nm} led ${teams[side].name}, ${bits.join(", ")}`;
        };
        const hl = [hitterLine(winSide), hitterLine(loseSide)].filter(Boolean);
        if (hl.length)
            paras.push(hl.join(". ") + ".");
        // pitching for the winner (or home team if live/tied)
        const pSide = game.over && !tied ? winSide : "home";
        const starter = game.pitchers[pSide][0];
        if (starter && starter.outs >= 3) {
            const bits = [`${starter.name} threw ${ipDisplay(starter.outs)} innings for ${teams[pSide].name}`];
            if (starter.k)
                bits.push(`striking out ${starter.k}`);
            if (starter.bb === 0 && starter.outs >= 9)
                bits.push("without a walk");
            let line = bits.join(", ");
            const relievers = game.pitchers[pSide].length - 1;
            if (relievers > 0)
                line += `; ${relievers === 1 ? game.pitchers[pSide][1].name + " finished it off" : relievers + " relievers closed it out"}`;
            paras.push(line + ".");
        }
        // errors note
        if (game.errors[loseSide] >= 2 && game.over && !tied)
            paras.push(`${L} didn't help their cause, committing ${game.errors[loseSide]} errors.`);
        const line = (side) => `${teams[side].name.padEnd(14)} ${game.linescore
            .map((r) => (r[side] === null ? "-" : r[side]))
            .join(" ")}  |  R ${totals(side)}  H ${game.hits[side]}  E ${game.errors[side]}`;
        return (paras.join("\n\n") +
            `\n\n${line("away")}\n${line("home")}\n\n— scored with DugoutIQ`);
    };
    const shareGameStory = async () => {
        setShareOpen(false);
        const text = buildGameStory();
        const title = `Game story: ${teams.away.name} ${totals("away")}, ${teams.home.name} ${totals("home")}`;
        if (navigator.share) {
            try {
                await navigator.share({ title, text });
                mutate((g) => (g.lastPlay = "Game story shared"));
                return;
            }
            catch (err) {
                if (err && err.name === "AbortError")
                    return;
            }
        }
        try {
            await navigator.clipboard.writeText(text);
            mutate((g) => (g.lastPlay = "Game story copied — paste into any message"));
        }
        catch {
            mutate((g) => (g.lastPlay = "Sharing isn't available on this device"));
        }
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
        catch {
            mutate((g) => (g.lastPlay = "Sharing isn't available on this device"));
        }
    };
    /* ---------------- small components ---------------- */
    const Lamp = ({ on, color, mini }) => (React.createElement("span", { className: `lamp ${mini ? "mini" : ""} ${on ? "on " + color : ""}`, "aria-hidden": "true" }));
    const Diamond = () => (React.createElement("svg", { ref: svgRef, viewBox: "0 -12 200 186", className: "diamond", role: "group", "aria-label": "Baserunners \u2014 tap a base for options, drag a runner to move them" },
        React.createElement("path", { d: "M100 158 L172 86 L100 14 L28 86 Z", fill: "rgba(255,255,255,0.04)", stroke: "#3D6FB4", strokeWidth: "2" }),
        [
            { base: "first", x: 172, y: 86, lx: 152, ly: 91, anchor: "end" },
            { base: "second", x: 100, y: 14, lx: 100, ly: 46, anchor: "middle" },
            { base: "third", x: 28, y: 86, lx: 48, ly: 91, anchor: "start" },
        ].map(({ base, x, y, lx, ly, anchor }) => (React.createElement("g", { key: base },
            React.createElement("g", { transform: `translate(${x} ${y}) rotate(45)`, onPointerDown: basePointerDown(base), onPointerMove: basePointerMove, onPointerUp: basePointerUp, className: "basegrab", role: "button", "aria-label": `${baseLabel(base)} base — ${game.bases[base]
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
    return (React.createElement("div", { className: "dg-root" },
        React.createElement("style", null, `
        @import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;700;800&family=IBM+Plex+Mono:wght@500;700&display=swap');

        .dg-root {
          --navy: #1D2D5C;
          --navy-deep: #14204A;
          --royal: #134A8E;
          --line: #2B5AA0;
          --white: #FFFFFF;
          --powder: #A9C5E8;
          --red: #E8291C;
          --amberw: #F5C518;
          min-height: 100vh;
          background:
            radial-gradient(1200px 600px at 50% -10%, #1B57A0 0%, var(--navy) 55%, var(--navy-deep) 100%);
          color: var(--white);
          font-family: 'Saira Condensed', system-ui, sans-serif;
          padding: 16px 12px 48px;
          box-sizing: border-box;
        }
        .dg-root *, .dg-root *::before { box-sizing: border-box; }
        .shell { max-width: 760px; margin: 0 auto; }

        .brand { display: flex; justify-content: center; align-items: center; margin: 0 auto 10px; }
        .brand-logo { display: block; height: 88px; width: auto; max-width: 70%; object-fit: contain; margin: 0 auto; }

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
          font-family: 'IBM Plex Mono', monospace; font-weight: 700;
          font-size: 44px; line-height: 1; color: var(--white);
          text-shadow: 0 0 18px rgba(169,197,232,.45);
        }
        .team-cell.atbat { border-color: var(--white); }
        .inning-cell {
          display: flex; flex-direction: column; justify-content: center;
          align-items: center; padding: 0 14px;
        }
        .inning-cell .arrow { font-size: 14px; color: var(--red); line-height: 1; }
        .inning-cell .num {
          font-family: 'IBM Plex Mono', monospace; font-size: 34px;
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
          font-family: 'IBM Plex Mono', monospace; font-weight: 700;
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
          font-family: 'IBM Plex Mono', monospace; letter-spacing: .08em;
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
          font-family: 'IBM Plex Mono', monospace; font-size: 11px;
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
          font-family: 'IBM Plex Mono', monospace; font-size: 14px;
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

        .atbat-card {
          background: var(--navy-deep); border: 1px solid var(--line);
          border-radius: 6px; padding: 12px 14px; margin-bottom: 12px;
          display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
        }
        .atbat-card .who { font-size: 20px; font-weight: 700; letter-spacing: .04em; }
        .atbat-card .who small { color: var(--powder); font-weight: 500; margin-left: 6px; }
        .atbat-card .statline { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--powder); white-space: nowrap; }

        /* ---- opposing pitcher strip ---- */
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
        .pstrip-line { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--powder); }
        .pstrip-np { font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 700; }
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
        .lineup td.num { font-family: 'IBM Plex Mono', monospace; color: var(--powder); width: 28px; font-size: 12px; }
        .lineup td.stat { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--powder); text-align: right; white-space: nowrap; }
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
          font-family: 'IBM Plex Mono', monospace; font-size: 11px;
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
          display: grid; grid-template-columns: repeat(7, 30px);
          font-family: 'IBM Plex Mono', monospace; font-size: 12px;
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
          display: grid; grid-template-columns: 30px 1fr 64px 24px; gap: 6px;
          align-items: center; margin-bottom: 6px; transition: transform .12s ease;
        }
        .prow.dragging .dg-in, .prow.dragging .dg-sel { border-color: var(--amberw); }
        button.drag-handle {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 32px; padding: 0; background: transparent; border: 1px solid var(--line);
          border-radius: 4px; color: var(--powder); cursor: grab; touch-action: none;
          font-family: 'IBM Plex Mono', monospace; font-size: 11px; line-height: 1;
        }
        button.drag-handle:active { cursor: grabbing; border-color: var(--amberw); color: var(--amberw); }
        .drag-handle .grip { font-size: 9px; line-height: .7; opacity: .7; }
        .prow .n { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--powder); text-align: right; }
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
        .teamname-in { margin-bottom: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }

        /* ---- modal ---- */
        .modal-back {
          position: fixed; inset: 0; background: rgba(8,14,36,.8);
          display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px;
        }
        .modal {
          background: var(--navy-deep); border: 1px solid var(--white);
          border-radius: 8px; padding: 18px; width: 100%; max-width: 400px; text-align: center;
        }
        .modal h3 { margin: 0 0 4px; font-size: 20px; letter-spacing: .06em; }
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
                React.createElement("img", { src: LOGO, alt: "DugoutIQ \u2014 Manage the Game", className: "brand-logo" })),
            !licensed && (React.createElement("div", { className: "setup-card license-card" },
                React.createElement("h2", null, "Activate DugoutIQ"),
                React.createElement("p", { className: "license-sub" }, "Enter the license key from your purchase receipt. You only do this once \u2014 after activation the app works fully offline."),
                React.createElement("input", { className: "dg-in license-in", value: licenseKey, onChange: (e) => setLicenseKey(e.target.value), onKeyDown: (e) => e.key === "Enter" && activate(), placeholder: "XXXXXXXX-XXXXXXXX-XXXXXXXX", "aria-label": "License key", autoComplete: "off" }),
                licenseErr && React.createElement("div", { className: "license-err" }, licenseErr),
                React.createElement("button", { className: "dg hit", style: { width: "100%", fontSize: 17, padding: "12px 0", marginTop: 10 }, onClick: activate, disabled: licenseBusy || !licenseKey.trim() }, licenseBusy ? "Verifying…" : "Activate"),
                React.createElement("p", { className: "license-foot" }, "Your license key is in your purchase receipt \u2014 activate once, works offline forever"))),
            licensed && phase === "setup" && (React.createElement(React.Fragment, null,
                React.createElement("div", { className: "setup-grid" }, ["away", "home"].map((side) => (React.createElement("div", { className: "setup-card", key: side },
                    React.createElement("h2", null, side === "away" ? "Visiting Club" : "Home Club"),
                    React.createElement("input", { className: "dg-in teamname-in", value: teams[side].name, onChange: (e) => setTeamName(side, e.target.value), "aria-label": `${side} team name` }),
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
                        React.createElement("input", { className: "dg-in", value: p.name, onChange: (e) => setPlayer(side, i, "name", e.target.value), "aria-label": `${side} batter ${i + 1} name` }),
                        React.createElement("select", { className: "dg-sel", value: p.pos, onChange: (e) => setPlayer(side, i, "pos", e.target.value), "aria-label": `${side} batter ${i + 1} position` }, POSITIONS.map((pos) => (React.createElement("option", { key: pos, value: pos }, pos || "POS")))),
                        teams[side].lineup.length > MIN_BATTERS ? (React.createElement("button", { className: "rm", onClick: () => removePlayer(side, i), "aria-label": `Remove ${side} batter ${i + 1}` }, "\u00D7")) : (React.createElement("span", null))))),
                    React.createElement("button", { className: "dg ghost addrow", onClick: () => addPlayer(side), disabled: teams[side].lineup.length >= MAX_BATTERS },
                        "+ Add batter (",
                        teams[side].lineup.length,
                        ")"))))),
                React.createElement("div", { className: "setup-card limitcard" },
                    React.createElement("h2", null, "League Pitch Limit"),
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
                    React.createElement("div", { className: `team-cell ${battingSide === "away" && !game.over ? "atbat" : ""}` },
                        React.createElement("div", { className: "tname" }, teams.away.name),
                        React.createElement("div", { className: "tscore" }, totals("away"))),
                    React.createElement("div", { className: "inning-cell" },
                        React.createElement("div", { className: "arrow" }, game.half === "top" ? "▲" : "▽"),
                        React.createElement("div", { className: "num" }, game.inning),
                        React.createElement("div", { className: "lbl" }, game.half === "top" ? "TOP" : "BOT")),
                    React.createElement("div", { className: `team-cell ${battingSide === "home" && !game.over ? "atbat" : ""}` },
                        React.createElement("div", { className: "tname" }, teams.home.name),
                        React.createElement("div", { className: "tscore" }, totals("home")))),
                React.createElement("div", { className: "diamond-card" },
                    React.createElement("div", { className: "diamond-hint" }, "Drag runner \u00B7 home = scores \u00B7 tap = options"),
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
                            " LEFT")))),
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
                                    : "" }, r[side] === null ? "" : r[side]))),
                            React.createElement("td", { className: "rhe" }, totals(side)),
                            React.createElement("td", { className: "rhe" }, game.hits[side]),
                            React.createElement("td", { className: "rhe" }, game.errors[side]))))))),
                React.createElement("div", { className: "ticker" }, game.lastPlay),
                !game.over && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "atbat-card" },
                        React.createElement("div", { className: "who" },
                            currentBatterName(),
                            React.createElement("small", null, teams[battingSide].lineup[game.batter[battingSide]].pos)),
                        React.createElement("div", { className: "statline" }, (() => {
                            const s = game.stats[battingSide][game.batter[battingSide]];
                            return `${s.h}-${s.ab} · ${s.r} R · ${s.rbi} RBI · ${s.bb} BB`;
                        })())),
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
                    React.createElement("div", { className: "btnrow r4" },
                        React.createElement("button", { className: "dg count", onClick: tapBall }, "Ball"),
                        React.createElement("button", { className: "dg count", onClick: tapStrike }, "Strike"),
                        React.createElement("button", { className: "dg count", onClick: tapFoul }, "Foul"),
                        React.createElement("button", { className: "dg count", onClick: tapHBP }, "HBP")),
                    React.createElement("div", { className: "btnrow r4" },
                        React.createElement("button", { className: "dg hit", onClick: () => playHit(1, "single") }, "1B"),
                        React.createElement("button", { className: "dg hit", onClick: () => playHit(2, "double") }, "2B"),
                        React.createElement("button", { className: "dg hit", onClick: () => playHit(3, "triple") }, "3B"),
                        React.createElement("button", { className: "dg hit", onClick: () => playHit(4, "HOME RUN") }, "HR")),
                    React.createElement("div", { className: "btnrow r5" },
                        React.createElement("button", { className: "dg outb", onClick: () => playOut("groundout", false) }, "Ground"),
                        React.createElement("button", { className: "dg outb", onClick: () => playOut("flyout", false) }, "Fly"),
                        React.createElement("button", { className: "dg outb", onClick: () => playOut("strikeout", true) }, "K"),
                        React.createElement("button", { className: "dg outb", onClick: () => setFcMenu(true), disabled: !game.bases.first && !game.bases.second && !game.bases.third }, "FC"),
                        React.createElement("button", { className: "dg", onClick: playError }, "Error")),
                    React.createElement("div", { className: "btnrow r4" },
                        React.createElement("button", { className: "dg ghost", onClick: () => adjustRun(1) }, "+ Run"),
                        React.createElement("button", { className: "dg ghost", onClick: () => adjustRun(-1) }, "\u2212 Run"),
                        React.createElement("button", { className: "dg ghost", onClick: undo, disabled: !history.length }, "Undo"),
                        React.createElement("button", { className: "dg ghost", onClick: manualEndHalf }, "End half")))),
                React.createElement("div", { className: "btnrow r3", style: { marginTop: 4 } },
                    React.createElement("button", { className: "dg ghost", onClick: () => setShareOpen(true) }, "Share recap"),
                    !game.over ? (React.createElement("button", { className: "dg ghost", onClick: endGame }, "Call it final")) : (React.createElement("span", null)),
                    React.createElement("button", { className: "dg ghost", onClick: () => setConfirmNew(true) }, "New game")),
                !game.over && (React.createElement("div", { className: "lineup-wrap" },
                    React.createElement("div", { className: "lineup-head" },
                        React.createElement("span", null,
                            teams[battingSide].name,
                            " \u2014 batting order"),
                        React.createElement("span", null, "H-AB \u00B7 R \u00B7 RBI \u00B7 BB \u00B7 K")),
                    React.createElement("table", { className: "lineup" },
                        React.createElement("tbody", null, teams[battingSide].lineup.map((p, i) => {
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
                        }))))),
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
                        React.createElement("button", { className: "rm", onClick: () => deleteRoster(i), "aria-label": `Delete saved roster ${r.name}` }, "\u00D7"))))),
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
                        React.createElement("button", { className: "dg", onClick: shareGameStory }, "\uD83D\uDCF0 Game story (narrative)"),
                        React.createElement("button", { className: "dg", onClick: shareRecap }, "\uD83D\uDCC4 Full recap (text)"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setShareOpen(false) }, "Cancel"))))),
            recapPreview && (React.createElement("div", { className: "modal-back", onClick: () => setRecapPreview(null) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Score graphic"),
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
            baseMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setBaseMenu(null) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null,
                        runnerLabel(baseMenu),
                        " on ",
                        baseLabel(baseMenu)),
                    React.createElement("p", null, "What happened?"),
                    React.createElement("div", { className: "btnrow" },
                        game.openHit != null && (React.createElement("button", { className: "dg hit", onClick: () => runnerScoresOnPlay(baseMenu) },
                            "Scores on the play (RBI ",
                            teams[battingSide].lineup[game.openHit.b].name,
                            ")")),
                        React.createElement("button", { className: "dg", onClick: () => stealBase(baseMenu) }, baseMenu === "third" ? "Steals home" : `Steals ${baseMenu === "first" ? "2nd" : "3rd"}`),
                        React.createElement("button", { className: `dg ${game.openHit != null ? "" : "hit"}`, onClick: () => runnerScores(baseMenu) }, "Scores (PB / WP \u2014 no RBI)"),
                        React.createElement("button", { className: "dg outb", onClick: () => runnerOut(baseMenu) }, "Out on the bases"),
                        React.createElement("button", { className: "dg ghost", onClick: () => runnerClear(baseMenu) }, "Remove runner"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setBaseMenu(null) }, "Cancel"))))),
            fcMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setFcMenu(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Fielder's choice"),
                    React.createElement("p", null, "Batter reaches \u2014 which runner was forced out?"),
                    React.createElement("div", { className: "btnrow" },
                        ["third", "second", "first"].map((b) => game.bases[b] && (React.createElement("button", { key: b, className: "dg outb", onClick: () => playFC(b) },
                            "Runner from ",
                            baseLabel(b),
                            " out"))),
                        React.createElement("button", { className: "dg ghost", onClick: () => setFcMenu(false) }, "Cancel"))))),
            pitchMenuSide && game && (React.createElement("div", { className: "modal-back", onClick: () => setPitchMenuSide(null) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Pitching log"),
                    React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr 1fr", marginBottom: 10 } }, ["away", "home"].map((sd) => (React.createElement("button", { key: sd, className: `dg ${pitchMenuSide === sd ? "" : "ghost"}`, onClick: () => setPitchMenuSide(sd) }, teams[sd].name.slice(0, 12))))),
                    React.createElement("div", { className: "plog" },
                        React.createElement("div", { className: "plog-row head" },
                            React.createElement("span", { className: "plog-name done" }, "Pitcher"),
                            React.createElement("span", { className: "plog-stats" }, ["IP", "H", "R", "BB", "K", "HR", "NP"].map((h) => (React.createElement("span", { key: h }, h))))),
                        game.pitchers[pitchMenuSide].map((p, i) => {
                            const isCur = i === game.pitchers[pitchMenuSide].length - 1;
                            return (React.createElement("div", { className: `plog-row ${isCur ? "cur" : ""}`, key: i },
                                isCur ? (React.createElement("input", { className: "dg-in plog-name", value: p.name, onChange: (e) => renamePitcher(e.target.value), "aria-label": "Current pitcher name" })) : (React.createElement("span", { className: "plog-name done" }, p.name)),
                                React.createElement("span", { className: "plog-stats" },
                                    React.createElement("span", null, ipDisplay(p.outs)),
                                    React.createElement("span", null, p.h),
                                    React.createElement("span", null, p.r),
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
                                React.createElement("span", null, game.pitchers[pitchMenuSide].reduce((s, p) => s + p.bb, 0)),
                                React.createElement("span", null, game.pitchers[pitchMenuSide].reduce((s, p) => s + p.k, 0)),
                                React.createElement("span", null, game.pitchers[pitchMenuSide].reduce((s, p) => s + p.hr, 0)),
                                React.createElement("span", null, staffTotal(game, pitchMenuSide))))),
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
                        teams[pitchMenuSide].lineup.map((p, i) => (React.createElement("option", { key: i, value: p.name },
                            p.name,
                            p.pos ? ` (${p.pos})` : "")))),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg hit", onClick: newPitcher }, "Bring in new pitcher"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setPitchMenuSide(null) }, "Cancel"))))))));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(DugoutScorecard));
