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
const freshPitcher = (name) => ({
    name,
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
});
const ipDisplay = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;
const snapshot = (s) => JSON.parse(JSON.stringify(s));
const SAVE_KEY = "dugoutiq-save-v1";
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
    if (!g.orderLocked)
        g.orderLocked = { away: false, home: false };
    if (g.pitchers) {
        ["away", "home"].forEach((sd) => (g.pitchers[sd] || []).forEach((pp) => { if (pp.uer == null)
            pp.uer = 0; }));
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
    const [incomingName, setIncomingName] = useState("");
    const [showLog, setShowLog] = useState(false);
    useEffect(() => { try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ phase, teams, game, pitchLimit }));
    }
    catch (_a) { } }, [phase, teams, game, pitchLimit]);
    const [fcMenu, setFcMenu] = useState(false);
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
    const [liveOpen, setLiveOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
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
            away: { name: teams.away.name, color: teams.away.color || "", logo: teams.away.logo || "" },
            home: { name: teams.home.name, color: teams.home.color || "", logo: teams.home.logo || "" },
            awayRuns: sumRuns("away"),
            homeRuns: sumRuns("home"),
            snapshot: { teams: snapshot(teams), game: snapshot(g), pitchLimit },
        };
        setGames((list) => {
            const next = [record, ...list.filter((x) => x.id !== record.id)].slice(0, 100);
            persistGames(next);
            return next;
        });
    };
    const reopenGame = (record) => {
        const snap = record.snapshot || {};
        if (snap.teams)
            setTeams(snapshot(snap.teams));
        if (snap.game)
            setGame(snapshot(snap.game));
        if (typeof snap.pitchLimit !== "undefined")
            setPitchLimit(snap.pitchLimit);
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
    // Auto-save a game to the archive the moment it goes final.
    useEffect(() => {
        if (game && game.over && game.id && archivedIdRef.current !== game.id) {
            archivedIdRef.current = game.id;
            archiveGame(game);
        }
    }, [game]);
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
    const starterName = (side) => {
        const p = teams[side].lineup.find((pl) => pl.pos === "P");
        return p && p.name.trim() ? p.name : "P1";
    };
    const playBall = () => {
        setGame({
            id: Date.now(),
            date: gameDate,
            inning: 1,
            half: "top",
            balls: 0,
            strikes: 0,
            outs: 0,
            halfPA: 0, // plate appearances in the current half (to detect a home no-bat)
            bases: emptyBases(),
            card: { away: [], home: [] }, // scorebook cells: {b, inning, res, base 0-4}
            openHit: null,
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
    const staffTotal = (g, side) => g.pitchers[side].reduce((s, p) => s + p.pitches, 0);
    // every pitch is charged to the fielding team's current pitcher
    const addPitch = (g, isStrike = true) => {
        const p = curP(g, fieldingSide);
        p.pitches += 1;
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
        if (runner && runner.b != null) {
            g.stats[battingSide][runner.b].r += 1;
            cardAdvance(g, runner, 4);
            if (runner.ue) {
                const pp = curP(g, fieldingSide);
                pp.uer = (pp.uer || 0) + 1;
            }
        }
    };
    /* --- scorebook card tracking --- */
    const cardMark = (g, bIdx, res, base) => {
        if (!g.card)
            g.card = { away: [], home: [] }; // resumed older save
        g.card[battingSide].push({ b: bIdx, inning: g.inning, res, base });
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
                cardAdvance(g, g.bases.second, 3);
                g.bases.third = g.bases.second;
            }
            cardAdvance(g, g.bases.first, 2);
            g.bases.second = g.bases.first;
        }
        g.bases.first = { b: batterIdx };
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
            const d3kLegal = !g.bases.first || g.outs === 2;
            const kBatter = g.batter[battingSide];
            closePA(g, "strikeout", `${currentBatterName()} strikes out`);
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
            logPitch(g, "strike", `Strike ${g.strikes}`);
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
        addRuns(g, runs);
        st.rbi += runs;
        chargeP(g, "r", runs);
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
    // advance batting order without resetting the (already reset) count
    const advanceOrder = (g) => {
        const wrapped = (g.batter[battingSide] + 1) % g.lineup[battingSide].length === 0;
        g.batter[battingSide] =
            (g.batter[battingSide] + 1) % g.lineup[battingSide].length;
        if (wrapped && g.orderLocked)
            g.orderLocked[battingSide] = true;
    };
    /* --- play outcomes (one tap, auto baserunning) --- */
    const playHit = (basesTaken, label) => mutate((g) => {
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
        cardMark(g, bIdxForHit, ["1B", "2B", "3B", "HR"][Math.min(basesTaken, 4) - 1], Math.min(basesTaken, 4));
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
        g.openK = null;
        g.openHit = null;
        g.openTag = null;
        const st = g.stats[battingSide][g.batter[battingSide]];
        const name = currentBatterName();
        st.ab += 1;
        g.errors[fieldingSide] += 1;
        cardMark(g, g.batter[battingSide], "E", 1);
        const runs = forceAdvance(g, g.batter[battingSide]);
        addRuns(g, runs); // unearned, no RBI
        chargeP(g, "r", runs);
        if (runs) {
            const pp = curP(g, fieldingSide);
            pp.uer = (pp.uer || 0) + runs; // run forced in by the error is unearned
        }
        if (g.bases.first)
            g.bases.first.ue = true; // reached on error -> unearned if he scores
        closePA(g, `reached on error${runs ? ", run scores" : ""}`, `${name} reaches on error${runs ? ", run scores" : ""}`);
        nextBatter(g);
    });
    const playOut = (label, isK) => mutate((g) => {
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
        const note = isK
            ? "K"
            : label === "groundout"
                ? "GO"
                : label === "popup"
                    ? "P"
                    : label === "lineout"
                        ? "L"
                        : "FO";
        cardMark(g, bIdx, note, 0);
        const d3kLegal = isK && (!g.bases.first || g.outs === 2);
        const flyType = label === "flyout" || label === "popup" || label === "lineout";
        const hadRunners = !!(g.bases.first || g.bases.second || g.bases.third);
        closePA(g, label, `${name}: ${label}`);
        const flipped = recordOut(g);
        if (!flipped)
            nextBatter(g);
        else
            advanceOrder(g);
        if (d3kLegal)
            g.openK = { b: bIdx };
        if (flyType && hadRunners && !flipped)
            g.openTag = { b: bIdx, conv: false, note, log: lastPAIdx(g) };
        if (label === "groundout" && g.bases.third && !flipped)
            g.openTag = { b: bIdx, kind: "ground", note, log: lastPAIdx(g) };
    });
    // Fielder's choice: batter reaches, the selected runner is forced out.
    // Remaining runners + batter advance on the force.
    const playFC = (outBase) => {
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
            g.bases[outBase] = false;
            cardMark(g, bIdx, "FC", 1);
            closePA(g, `fielder's choice — runner from ${baseLabel(outBase)} forced out`, `${name}: fielder's choice — runner from ${baseLabel(outBase)} forced out`);
            const flipped = recordOut(g);
            if (!flipped) {
                const runs = forceAdvance(g, bIdx);
                addRuns(g, runs);
                chargeP(g, "r", runs);
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
    const playFCBatterOut = () => {
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
            cardMark(g, bIdx, "GO", 0);
            const willPlay = g.outs < 2; // runners only advance if this isn't the 3rd out
            closePA(g, willPlay ? "out at 1st — runners advance" : "out at 1st", `${name}: out at 1st${willPlay ? ", runners advance" : ""}`);
            const flipped = recordOut(g);
            if (!flipped) {
                const runs = advanceAll(g, 1, null); // station-to-station, no batter
                addRuns(g, runs);
                st.rbi += runs; // productive out — RBI credited
                chargeP(g, "r", runs);
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
                        addRuns(g, 1);
                        st.rbi += 1;
                        chargeP(g, "r", 1);
                    }
                }
                else {
                    const runs = advanceAll(g, 1, null);
                    addRuns(g, runs);
                    st.rbi += runs;
                    chargeP(g, "r", runs);
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
            g.bases.first = { b: bIdx };
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
            g.bases.first = { b: bIdx };
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
        addRuns(g, runs);
        st.rbi += runs;
        chargeP(g, "r", runs);
        closePA(g, runs ? "intentional walk, run forced in" : "intentional walk", `${currentBatterName()} — intentional walk${runs ? ", run forced in" : ""}`);
        nextBatter(g);
    });
    // Double play — batter is out plus one selected runner (two outs on the play).
    const playDoublePlay = (runnerBase) => {
        mutate((g) => {
            addPitch(g);
            g.openK = null;
            g.openHit = null;
            g.openTag = null;
            const bIdx = g.batter[battingSide];
            const st = g.stats[battingSide][bIdx];
            const name = currentBatterName();
            st.ab += 1;
            cardMark(g, bIdx, "DP", 0);
            // snapshot the runners before the play resolves
            const had = {
                first: g.bases.first,
                second: g.bases.second,
                third: g.bases.third,
            };
            // two outs on the play: the batter, plus the selected runner
            chargeP(g, "outs"); // batter
            closePA(g, "double play", `${name}: grounds into a double play`);
            recordOut(g); // batter out (DP offered only with < 2 outs)
            chargeP(g, "outs"); // runner
            const flipped = recordOut(g);
            if (!flipped) {
                // Rebuild the bases. The runner who was put out is gone; every OTHER
                // forced runner still advances one base (a forced runner from third scores).
                const nb = { first: false, second: false, third: false };
                let runs = 0;
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
                g.bases = nb;
                if (runs) {
                    addRuns(g, runs);
                    chargeP(g, "r", runs);
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
            addRuns(g, 1);
            chargeP(g, "r", 1);
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
            addRuns(g, 1);
            chargeP(g, "r", 1);
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
            addRuns(g, runs);
            chargeP(g, "r", runs);
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
            const nm = (newName || "").trim() || cur.name;
            const np = (newPos || "").trim();
            const hist = Array.isArray(cur.posHist) ? cur.posHist.slice() : (cur.pos ? [cur.pos] : []);
            if (np && !hist.includes(np))
                hist.push(np); // record each new position played
            const nn = newNum != null ? (newNum || "").trim() : (cur.num || ""); // preserve number if not supplied
            g.lineup[side][slot] = { name: nm, pos: np, num: nn, posHist: hist };
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
        if (!orderOpen(side))
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
        return r.b != null ? game.lineup[battingSide][r.b].name : "Runner";
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
                    const batterName = g.lineup[battingSide][g.openHit.b].name;
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
            cardAdvance(g, g.bases[to], to === "second" ? 2 : to === "third" ? 3 : 1);
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
        setDragBoth(Object.assign(Object.assign({}, d), { x: p.x, y: p.y, moved }));
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
            cardAdvance(g, g.bases[target], target === "second" ? 2 : 3);
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
    const endGame = () => mutate((g) => {
        g.over = true;
        g.bases = emptyBases();
        if (!g.decisions)
            g.decisions = { w: null, l: null, s: null };
        g.decisions = suggestDecisions(g);
        // If the home team never batted in the final inning, mark that cell 'X'.
        const ci = g.inning - 1;
        const row = g.linescore[ci];
        if (row && row.away != null) {
            const homeDidNotBat = g.half === "top" ? true : (g.halfPA || 0) === 0;
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
            over: !!g.over,
            away: { name: nm("away"), runs: totals("away"), hits: g.hits.away, errors: g.errors.away, color: teamColor("away"), logo: teams.away.logo || "" },
            home: { name: nm("home"), runs: totals("home"), hits: g.hits.home, errors: g.errors.home, color: teamColor("home"), logo: teams.home.logo || "" },
            inning: g.inning,
            half: g.half,
            balls: g.balls,
            strikes: g.strikes,
            outs: g.outs,
            bases: {
                first: !!g.bases.first,
                second: !!g.bases.second,
                third: !!g.bases.third,
            },
            batter: bat ? bat.name : "",
            onDeck: onDeck ? onDeck.name : "",
            pitches: fp ? fp.pitches || 0 : 0,
            pitcher: fp ? fp.name : "",
            lastPlay: g.lastPlay || "",
            linescore: g.linescore.map((r) => ({ away: r.away, home: r.home })),
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
                localStorage.setItem(LIVE_KEY, JSON.stringify({ code: liveCode, on: liveOn, list: liveList }));
        }
        catch (_a) { }
    }, [liveCode, liveOn]);
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
    }, [game, liveOn, liveCode, phase, liveList]);
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
                ctx.font = "700 96px 'IBM Plex Mono', monospace";
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
            ctx.font = "700 26px 'IBM Plex Mono', monospace";
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
                        ctx.font = "700 22px 'IBM Plex Mono', monospace";
                        ctx.textAlign = "center";
                        if (e0.base === 0) {
                            ctx.fillText(e0.res, cx, cy + 8);
                        }
                        else {
                            ctx.fillText(e0.res, cx - rR - 2, y + cellH - 12);
                        }
                        if (cell.length > 1) {
                            ctx.font = "700 18px 'IBM Plex Mono', monospace";
                            ctx.fillText("+" + (cell.length - 1), cx + rR + 6, y + 22);
                        }
                    }
                }
                // stat columns
                const st = game.stats[side][r] || { ab: 0, r: 0, h: 0, bb: 0 };
                ctx.fillStyle = ink;
                ctx.font = "700 24px 'IBM Plex Mono', monospace";
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
            ctx.font = "700 26px 'IBM Plex Mono', monospace";
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
                    ctx.font = "400 19px 'IBM Plex Mono', monospace";
                    ctx.fillStyle = ink;
                    ctx.fillText(disp, M + lsNameW + lsCW * i + lsCW / 2, y + 25);
                }
                [totals(side), game.hits[side], game.errors[side]].forEach((v, j) => {
                    ctx.font = "700 20px 'IBM Plex Mono', monospace";
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
                    ctx.font = "400 22px 'IBM Plex Mono', monospace";
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
                ctx.font = "700 22px 'IBM Plex Mono', monospace";
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
                label: p.name, vals: [ipDisplay(p.outs), p.h, p.r, Math.max(0, p.r - (p.uer || 0)), p.bb, p.k, p.hr],
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
                const lines = [];
                if (ps.length)
                    lines.push(`P-S: ${ps.join(", ")}`);
                if (bf.length)
                    lines.push(`BF: ${bf.join(", ")}`);
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
            drawNotes(battingNotes(aLU, "away"));
            drawTable(`${teams.away.name.toUpperCase()} — PITCHING`, PIT, pitchingRows(aP), pitchingTot(aP));
            drawNotes(pitchingNotes(aP));
            drawTable(`${teams.home.name.toUpperCase()} — BATTING`, BAT, battingRows(hLU, "home"), battingTot("home", hLU.length));
            drawNotes(battingNotes(hLU, "home"));
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
                        best = Object.assign(Object.assign({}, st), { i });
                        bi = score;
                    }
                }
            });
            if (!best)
                return null;
            const nm = game.lineup[side][best.i].name;
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
        catch (_a) {
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
        catch (_a) {
            mutate((g) => (g.lastPlay = "Sharing isn't available on this device"));
        }
    };
    /* ---------------- small components ---------------- */
    const Lamp = ({ on, color, mini }) => (React.createElement("span", { className: `lamp ${mini ? "mini" : ""} ${on ? "on " + color : ""}`, "aria-hidden": "true" }));
    const Diamond = () => (React.createElement("svg", { ref: svgRef, viewBox: "0 -12 200 186", className: "diamond", role: "group", "aria-label": "Baserunners \u2014 tap a base for options, drag a runner to move them" },
        React.createElement("path", { d: "M100 158 L172 86 L100 14 L28 86 Z", fill: "rgba(255,255,255,0.04)", stroke: "#3D6FB4", strokeWidth: "2" }),
        themeLogo && (React.createElement("image", { href: themeLogo, x: "68", y: "54", width: "64", height: "64", opacity: "0.45", preserveAspectRatio: "xMidYMid meet", style: { pointerEvents: "none" } })),
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
    return (React.createElement("div", { className: "dg-root", style: { "--accent": themeColor } },
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
          font-family: 'IBM Plex Mono', monospace; font-weight: 700;
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
        .atbat-card .statline { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--powder); white-space: nowrap; }

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
        b.dtag {
          background: var(--amber); color: var(--deep); border-radius: 4px;
          font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 700;
          padding: 1px 5px; letter-spacing: .02em;
        }
        .uer-row {
          display: flex; justify-content: space-between; align-items: center;
          margin-top: 10px; font-family: 'Saira Condensed', sans-serif;
          font-size: 13px; color: var(--powder);
        }
        .uer-ctl { display: flex; align-items: center; gap: 8px; }
        .uer-ctl button.dg { padding: 4px 12px; font-size: 16px; }
        .uer-ctl b { font-family: 'IBM Plex Mono', monospace; min-width: 16px; text-align: center; color: var(--white); }
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
          display: grid; grid-template-columns: repeat(8, 27px);
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
          display: grid; grid-template-columns: 30px 46px 1fr 64px 24px; gap: 6px;
          align-items: center; margin-bottom: 6px; transition: transform .12s ease;
        }
        .jersey-in { text-align: center; padding: 0 4px; }
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
          display: flex; align-items: center; justify-content: center; z-index: 50;
          padding: 16px; overflow-y: auto;
        }
        .modal {
          background: var(--navy-deep); border: 1px solid var(--white);
          border-radius: 8px; padding: 18px; width: 100%; max-width: 400px; text-align: center;
          max-height: 90vh; overflow-y: auto; margin: auto;
        }
        .modal h3 { margin: 0 0 4px; font-size: 20px; letter-spacing: .06em; }
        .season-modal { max-width: 680px; text-align: left; }
        .season-controls { display: flex; align-items: center; gap: 12px; margin: 8px 0 12px; }
        .season-controls select { flex: 1; }
        .season-gp { color: var(--powder); font-size: 13px; white-space: nowrap; }
        .season-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
        .season-tabs .dg { flex: 1; }
        .season-table { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--line); border-radius: 10px; }
        .season-table table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
        .season-table th, .season-table td { padding: 7px 9px; text-align: right; font-size: 13px; white-space: nowrap; font-family: 'IBM Plex Mono', monospace; }
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
                    React.createElement("div", { className: "btnrow r5" },
                        React.createElement("button", { className: "dg count", onClick: tapBall }, "Ball"),
                        React.createElement("button", { className: "dg count", onClick: tapStrike }, "Strike"),
                        React.createElement("button", { className: "dg count", onClick: tapFoul }, "Foul"),
                        React.createElement("button", { className: "dg count", onClick: tapHBP }, "HBP"),
                        React.createElement("button", { className: "dg count", onClick: tapIBB }, "IBB")),
                    React.createElement("div", { className: "btnrow r4" },
                        React.createElement("button", { className: "dg hit", onClick: () => playHit(1, "single") }, "1B"),
                        React.createElement("button", { className: "dg hit", onClick: () => playHit(2, "double") }, "2B"),
                        React.createElement("button", { className: "dg hit", onClick: () => playHit(3, "triple") }, "3B"),
                        React.createElement("button", { className: "dg hit", onClick: () => playHit(4, "HOME RUN") }, "HR")),
                    React.createElement("div", { className: "btnrow r5" },
                        React.createElement("button", { className: "dg outb", onClick: () => playOut("groundout", false) }, "Gnd"),
                        React.createElement("button", { className: "dg outb", onClick: () => playOut("flyout", false) }, "Fly"),
                        React.createElement("button", { className: "dg outb", onClick: () => playOut("popup", false) }, "Pop"),
                        React.createElement("button", { className: "dg outb", onClick: () => playOut("lineout", false) }, "Line"),
                        React.createElement("button", { className: "dg outb", onClick: () => playOut("strikeout", true) }, "K")),
                    React.createElement("div", { className: "btnrow r4" },
                        React.createElement("button", { className: "dg outb", onClick: () => setDpMenu(true), disabled: game.outs >= 2 ||
                                (!game.bases.first && !game.bases.second && !game.bases.third) }, "DP"),
                        React.createElement("button", { className: "dg outb", onClick: () => setFcMenu(true), disabled: !game.bases.first && !game.bases.second && !game.bases.third }, "FC"),
                        React.createElement("button", { className: "dg outb", onClick: () => setSacMenu(true), disabled: !game.bases.first && !game.bases.second && !game.bases.third }, "Sac"),
                        React.createElement("button", { className: "dg", onClick: playError }, "Error")),
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
                            const dstr = new Date(gm.savedAt).toLocaleDateString(undefined, {
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
                        React.createElement("button", { className: "dg", onClick: shareGameStory }, "\uD83D\uDCF0 Game story (narrative)"),
                        React.createElement("button", { className: "dg", onClick: shareBoxScore }, "\uD83D\uDCCA Box score (image)"),
                        React.createElement("button", { className: "dg", onClick: () => {
                                setShareOpen(false);
                                setBookChoose(true);
                            } }, "\uD83D\uDCD2 Scorebook page (classic)"),
                        React.createElement("button", { className: "dg", onClick: startLive }, "\uD83D\uDCE1 Live game link (spectators)"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setShareOpen(false) }, "Cancel"))))),
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
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "\u2699\uFE0F Settings"),
                    React.createElement("div", { style: { fontWeight: 700, color: "#A9C5E8", fontSize: 13, margin: "4px 0 8px", letterSpacing: ".4px" } }, "APP LOOK"),
                    React.createElement("div", { className: "theme-swatches", style: { marginBottom: 6 } },
                        PRESET_TEAM_COLORS.map((c) => (React.createElement("button", { key: c, type: "button", className: `swatch ${themeColor === c ? "sel" : ""}`, style: { background: c }, onClick: () => setThemeColor(c), "aria-label": "Set app theme color" }))),
                        React.createElement("input", { type: "color", className: "swatch-custom", value: themeColor, onChange: (e) => setThemeColor(e.target.value), "aria-label": "Custom app theme color" }),
                        React.createElement("label", { className: "logo-btn" },
                            themeLogo ? React.createElement("img", { src: themeLogo, alt: "app logo" }) : "＋ Logo",
                            React.createElement("input", { type: "file", accept: "image/*", onChange: onThemeLogoPick, style: { display: "none" } })),
                        themeLogo && (React.createElement("button", { type: "button", className: "logo-rm", onClick: () => setThemeLogo(""), "aria-label": "Remove logo" }, "\u2715"))),
                    React.createElement("p", { style: { fontSize: 12, opacity: 0.7, margin: "0 0 16px" } }, "Sets the accent color and the watermark in the diamond."),
                    React.createElement("div", { style: { fontWeight: 700, color: "#A9C5E8", fontSize: 13, margin: "4px 0 8px", letterSpacing: ".4px" } }, "PUBLIC GAMES"),
                    React.createElement("a", { href: "/games.html", target: "_blank", rel: "noopener", className: "dg", style: { display: "block", textAlign: "center", textDecoration: "none", marginBottom: 6 } }, "Open the public Games page \u2192"),
                    React.createElement("p", { style: { fontSize: 12, opacity: 0.7, margin: "0 0 16px" } }, "Games appear there only when a scorer ticks \u201Clist publicly\u201D in the live-share window."),
                    React.createElement("div", { className: "btnrow", style: { gridTemplateColumns: "1fr" } },
                        React.createElement("button", { className: "dg ghost", onClick: () => setSettingsOpen(false) }, "Done")),
                    React.createElement("p", { style: { fontSize: 11, opacity: 0.55, textAlign: "center", marginTop: 12 } }, "DugoutIQ \u2014 Manage the Game")))),
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
                            game.lineup[battingSide][game.openHit.b].name,
                            ")")),
                        React.createElement("button", { className: "dg", onClick: () => stealBase(baseMenu) }, baseMenu === "third" ? "Steals home" : `Steals ${baseMenu === "first" ? "2nd" : "3rd"}`),
                        React.createElement("button", { className: `dg ${game.openHit != null ? "" : "hit"}`, onClick: () => runnerScores(baseMenu) }, "Scores (PB / WP \u2014 no RBI)"),
                        React.createElement("button", { className: "dg outb", onClick: () => runnerOut(baseMenu) }, "Out on the bases"),
                        React.createElement("button", { className: "dg ghost", onClick: () => runnerClear(baseMenu) }, "Remove runner"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setBaseMenu(null) }, "Cancel"))))),
            fcMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setFcMenu(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Fielder's choice"),
                    React.createElement("p", null, "Who was out on the play?"),
                    React.createElement("div", { className: "btnrow" },
                        ["third", "second", "first"].map((b) => game.bases[b] && (React.createElement("button", { key: b, className: "dg outb", onClick: () => playFC(b) },
                            "Runner from ",
                            baseLabel(b),
                            " out \u2014 batter reaches"))),
                        React.createElement("button", { className: "dg outb", onClick: playFCBatterOut }, "Batter out at 1st \u2014 runners advance"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setFcMenu(false) }, "Cancel"))))),
            sacMenu && game && (React.createElement("div", { className: "modal-back", onClick: () => setSacMenu(false) },
                React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                    React.createElement("h3", null, "Sacrifice"),
                    React.createElement("p", null, "Batter is out; no at-bat charged."),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg outb", onClick: () => playSac("fly"), disabled: !game.bases.third }, "Sac fly \u2014 runner on 3rd scores (RBI)"),
                        React.createElement("button", { className: "dg outb", onClick: () => playSac("bunt") }, "Sac bunt \u2014 runners advance"),
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
                        React.createElement("p", { className: "sub-hint" },
                            React.createElement("b", null, "Save edit"),
                            " fixes a name or position \u2014 stats untouched.",
                            " ",
                            React.createElement("b", null, "Sub"),
                            " swaps in a new player; the original keeps their stats."),
                        slotRemovable(subSide, subSlot) && (React.createElement("button", { className: "dg ghost rm-spot", onClick: () => removeBatter(subSide, subSlot) }, "Remove this spot from the order")))),
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
                    React.createElement("p", null, "Batter is out. Which runner is also out?"),
                    React.createElement("div", { className: "btnrow" },
                        ["third", "second", "first"].map((b) => game.bases[b] && (React.createElement("button", { key: b, className: "dg outb", onClick: () => playDoublePlay(b) },
                            "Runner from ",
                            baseLabel(b)))),
                        React.createElement("button", { className: "dg ghost", onClick: () => setDpMenu(false) }, "Cancel"))))),
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
                                    React.createElement("input", { className: "dg-in", value: p.name, onChange: (e) => renamePitcher(e.target.value), "aria-label": "Current pitcher name" }),
                                    decisionTag(pitchMenuSide, i) && (React.createElement("b", { className: "dtag" }, decisionTag(pitchMenuSide, i))))) : (React.createElement("span", { className: "plog-name done" },
                                    p.name,
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
                            p.name,
                            p.pos ? ` (${p.pos})` : "")))),
                    pitchMenuSide === fieldingSide &&
                        !game.over &&
                        (game.bases.first || game.bases.second || game.bases.third) && (React.createElement("button", { className: "dg outb", style: { width: "100%", marginBottom: 8 }, onClick: playBalk }, "Balk \u2014 all runners advance one base")),
                    React.createElement("div", { className: "btnrow" },
                        React.createElement("button", { className: "dg hit", onClick: newPitcher }, "Bring in new pitcher"),
                        React.createElement("button", { className: "dg ghost", onClick: () => setPitchMenuSide(null) }, "Cancel"))))))));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(DugoutScorecard));
