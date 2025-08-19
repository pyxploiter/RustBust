// --- Config ---
const PLAYER_API = "https://api.rankeval.gg/api/getleaderboards"; // single type only, to extract SteamID
const SERVER_ID = "66af4fbe9dd0740a80453310"; // rustopia.gg eu main server
const TYPE = "Leaderboard";
const TEAM_API = "https://api.rankeval.gg/api/getteamleaderboards";

// --- BattleMetrics Config ---
const BM_SERVER_ID = "15096801"; // BattleMetrics server id for your target server
const BM_BASE = "https://api.battlemetrics.com/players";

const $ = (s) => document.querySelector(s);
const playerInput = $("#player");
const fetchBtn = $("#fetchBtn");
const clearBtn = $("#clearBtn");
const out = $("#out");
const steamVal = $("#steamVal");
const msg = $("#msg");
const copyBtn = $("#copyBtn");
const steamLink = $("#steamLink");

// Team refs
const teamSection = $("#teamSection");
const tblTeam = $("#tblTeam tbody");
const teamBadge = $("#teamBadge");
const teamId = $("#teamId");
const teamClan = $("#teamClan");
const teamMeta = $("#teamMeta");
const teamRank = $("#teamRank");
const teamRating = $("#teamRating");
const teamPVP = $("#teamPVP");
const teamPVE = $("#teamPVE");
const teamBallistics = $("#teamBallistics");
const teamGather = $("#teamGather");

function buildPlayerUrl(name) {
    const q = encodeURIComponent((name || "").trim());
    return `${PLAYER_API}?q=${q}&ServerFilter=${SERVER_ID}&Type=${TYPE}`;
}

function buildTeamUrl(steam) {
    const q = encodeURIComponent(steam);
    return `${TEAM_API}?q=${q}&ServerFilter=${SERVER_ID}`;
}

function buildBMUrl(name) {
    // exact-match selection is done client-side after we fetch
    const q = encodeURIComponent(name.trim());
    return `${BM_BASE}?page[size]=10&include=server&fields[server]=&filter[servers]=${BM_SERVER_ID}&filter[search]=${q}`;
}

function setStatus(text, isError = false) {
    msg.textContent = text || "";
    msg.classList.toggle('err', !!isError);
}

function showSteam(id) {
    if (!id) { out.style.display = 'none'; return; }
    steamVal.textContent = id;
    steamLink.href = `https://steamcommunity.com/profiles/${id}`;
    steamLink.style.display = 'inline-block';
    out.style.display = 'flex';
}

function fmtTime(seconds) {
    if (!seconds && seconds !== 0) return '—';
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60); return `${h}h ${m}m`;
}

function fmtISO(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    // Local time; you’re in Europe/Berlin (CET/CEST)
    return d.toLocaleString();
}

function emptyTeamTable() {
    tblTeam.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center">No team data</td></tr>`;
}

// polite fetch with retry + small delay (helps with rate limits)
async function fetchJSON(url, retries = 2, delayMs = 400) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, { headers: { Accept: "application/json" } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            if (i === retries) throw e;
            await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        }
    }
}

// ----------------- BATTLEMETRICS LOOKUP -----------------
/**
 * Pick exact name matches (case-insensitive). If multiple, choose latest lastSeen.
 * Returns { online, firstSeen, lastSeen, timePlayed, pickedName } or null if no exact match.
 */
function pickBestBMEntry(bmData, targetName) {
    const data = Array.isArray(bmData?.data) ? bmData.data : [];
    const exact = data.filter(d => {
        const nm = d?.attributes?.name;
        return typeof nm === "string" && nm.toLowerCase() === targetName.toLowerCase();
    });
    if (exact.length === 0) return null;

    // Each item contains relationships.servers.data[0].meta for this filtered server
    const withSeen = exact.map(d => {
        const entries = d?.relationships?.servers?.data || [];
        const onThis = entries.find(s => s?.id === BM_SERVER_ID || true); // already filtered to this server
        const meta = onThis?.meta || {};
        return {
            entity: d,
            lastSeen: meta.lastSeen ? new Date(meta.lastSeen).getTime() : -1,
            meta
        };
    });

    withSeen.sort((a, b) => (b.lastSeen - a.lastSeen));
    const top = withSeen[0];
    const m = top?.meta || {};
    return {
        online: !!m.online,
        firstSeen: m.firstSeen || null,
        lastSeen: m.lastSeen || null,
        timePlayed: Number.isFinite(m.timePlayed) ? m.timePlayed : null,
        pickedName: top?.entity?.attributes?.name || targetName
    };
}

async function getBMForPlayerName(name) {
    try {
        const url = buildBMUrl(name);
        const json = await fetchJSON(url);
        console.log("player["+name+"]: "+JSON.stringify(json));
        return pickBestBMEntry(json, name); // null if no exact match
    } catch (e) {
        console.warn("BM fetch failed for", name, e);
        return null;
    }
}

function renderTeam(team) {
    if (!team) {
        teamSection.style.display = 'block';
        teamBadge.textContent = 'No team';
        teamBadge.className = 'badge err';
        teamId.textContent = '—';
        teamClan.textContent = '';
        teamMeta.textContent = 'No team found for this player on this server.';
        teamRank.textContent = teamRating.textContent = teamPVP.textContent = teamPVE.textContent = teamBallistics.textContent = teamGather.textContent = '—';
        emptyTeamTable();
        return;
    }
    teamSection.style.display = 'block';
    teamBadge.textContent = 'OK';
    teamBadge.className = 'badge ok';
    teamId.textContent = team.TeamID || '—';
    teamClan.textContent = team.ClanTag ? `(${team.ClanTag})` : '';
    teamMeta.textContent = `Team Members: ${team.SteamIDs?.length || 0} (Last updated ${new Date(team.LastUpdated).toLocaleString()})`;
    const rk = team.Rankings || {};
    teamRank.textContent = rk.Rank ?? '—';
    teamRating.textContent = rk.Rating ?? '—';
    teamPVP.textContent = rk.PVPPerf ?? '—';
    teamPVE.textContent = rk.PVEPerf ?? '—';
    teamBallistics.textContent = rk.BallisticsPerf ?? '—';
    teamGather.textContent = rk.GatherPerf ?? '—';

    let members = Array.isArray(team.TeamPlayerData) ? team.TeamPlayerData : [];
    if (!members.length) { emptyTeamTable(); return; }
    members = members.sort((a, b) => (b.TimePlayed || 0) - (a.TimePlayed || 0));

    tblTeam.innerHTML = '';

    for (const m of members) {
        const avatar = m?.User?.Avatar?.avatarFull || m?.User?.Avatar?.avatar || m?.User?.Avatar?.avatarMedium || '';
        const isOnline = "unknown"; // "unknown" | "online" | "offline"
        const statusDot = `<span class="status-dot ${isOnline}"></span>`;
        const mrk = m?.Rankings || {};
        const playerRating = mrk.Rating;
        const v = (x) => (x ?? 0);
        const rowId = `row-${m.SteamID || Math.random().toString(36).slice(2)}`;

        const ratingBlock = `
            <div class="group" style="margin-top:6px">
            ${mrk.PVPPerf != null ? `<span class="pill"><b>PVP</b>&nbsp;${mrk.PVPPerf}</span>` : ''}
            ${mrk.PVEPerf != null ? `<span class="pill"><b>PVE</b>&nbsp;${mrk.PVEPerf}</span>` : ''}
            ${mrk.BallisticsPerf != null ? `<span class="pill"><b>Ballistics</b>&nbsp;${mrk.BallisticsPerf}</span>` : ''}
            ${mrk.GatherPerf != null ? `<span class="pill"><b>Gather</b>&nbsp;${mrk.GatherPerf}</span>` : ''}
            </div>`;

        const pvpBlock = `
            <div class="group">
                <div class="row">
                    <span class="pill"><b>Kills</b>&nbsp;${v(m.PVPKills)}</span>
                    <span class="pill"><b>Deaths</b>&nbsp;${v(m.Deaths)}</span>
                </div>
                <div class="row">
                    <span class="pill"><b>Arrows</b>&nbsp;${v(m.ArrowsFired)}</span>
                    <span class="pill"><b>Bullets</b>&nbsp;${v(m.BulletsFired)}</span>
                </div>
                <div class="row">
                    <span class="pill"><b>Rockets</b>&nbsp;${v(m.RocketsLaunched)}</span>
                    <span class="pill"><b>Explosives</b>&nbsp;${v(m.ExplosivesThrown)}</span>
                </div>
            </div>`;

        const pveVehBlock = `
            <div class="group">
                <div class="row">
                    <span class="pill"><b>PVE Kills</b>&nbsp;${v(m.PVEKills)}</span>
                    <span class="pill"><b>NPC Kills</b>&nbsp;${v(m.NPCKills)}</span>
                </div>
                <div class="row">
                    <span class="pill"><b>HeliHits</b>&nbsp;${v(m.HeliHits)}</span>
                    <span class="pill"><b>HeliKills</b>&nbsp;${v(m.HeliKills)}</span>
                </div>
                <div class="row">
                    <span class="pill"><b>APCHits</b>&nbsp;${v(m.APCHits)}</span>
                    <span class="pill"><b>APCKills</b>&nbsp;${v(m.APCKills)}</span>
                </div>
            </div>`;

        const gatherBlock = `
            <div class="group">
                <div class="row">
                    <span class="pill"><b>Wood</b>&nbsp;${v(m.Wood)}</span>
                    <span class="pill"><b>Stone</b>&nbsp;${v(m.Stone)}</span>
                </div>
                <div class="row">
                    <span class="pill"><b>Metal</b>&nbsp;${v(m.Metal)}</span>
                    <span class="pill"><b>HQM</b>&nbsp;${v(m.HQM)}</span>
                </div>
                <span class="pill sulfur"><b>Sulfur</b>&nbsp;${v(m.Sulfur)}</span>
            </div>`;

        const playerBlock = `
            <div class="player">
                ${avatar ? `<img class="avatar" src="${avatar}" alt="">` : ''}
                <div>
                    <div class="playername">${statusDot}${m.Name || '—'}</div>
                    <div class="sub steam">${m.SteamID || '—'}</div>
                    <div class="sub">KDR: ${v(m.KDR)}</div>
                    <div class="sub bm bm-first">First seen: <span class="bm-first-val">…</span></div>
                    <div class="sub bm bm-last">Last seen: <span class="bm-last-val">…</span></div>
                    <div class="sub bm bm-played">Played: <span class="bm-played-val">…</span></div>
                </div>
            </div>`;

        const tr = document.createElement('tr');
        tr.id = rowId;
        tr.dataset.playerName = m.Name || "";
        tr.innerHTML = `
            <td>${playerBlock}</td>
            <td>${pvpBlock}</td>
            <td>${pveVehBlock}</td>
            <td>${gatherBlock}</td>
            <td>${fmtTime(m.TimePlayed)}</td>`;
        tblTeam.appendChild(tr);
    }

    // Enrich rows with BattleMetrics data (sequential w/ small delay)
    (async () => {
        const rows = Array.from(tblTeam.querySelectorAll("tr"));
        for (const row of rows) {
            const name = row.dataset.playerName?.trim();
            if (!name) continue;

            const dot = row.querySelector(".status-dot");
            const firstEl = row.querySelector(".bm-first-val");
            const lastEl = row.querySelector(".bm-last-val");
            const playedEl = row.querySelector(".bm-played-val");

            try {
                const bm = await getBMForPlayerName(name);

                if (!bm) {
                    // no exact match found
                    dot?.classList.remove("online", "offline", "unknown");
                    dot?.classList.add("unknown");
                    if (firstEl) firstEl.textContent = "—";
                    if (lastEl) lastEl.textContent = "—";
                    if (playedEl) playedEl.textContent = "—";
                } else {
                    dot?.classList.remove("online", "offline", "unknown");
                    dot?.classList.add(bm.online ? "online" : "offline");
                    if (firstEl) firstEl.textContent = fmtISO(bm.firstSeen);
                    if (lastEl) lastEl.textContent = fmtISO(bm.lastSeen);
                    if (playedEl) playedEl.textContent = bm.timePlayed != null ? fmtTime(bm.timePlayed) : "—";
                }
            } catch (e) {
                console.warn("BM enrich failed for", name, e);
            }

            // gentle delay
            await new Promise(r => setTimeout(r, 10));
        }
    })();
}

async function fetchSteamAndTeam() {
    const name = playerInput.value.trim();
    if (!name) {
        setStatus('Please enter a player name.', true);
        playerInput.focus();
        return;
    }
    setStatus('Looking up SteamID…');
    showSteam(null); 
    teamSection.style.display = 'none';
    try {
        const res = await fetch(buildPlayerUrl(name), { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data?.leaderboard) ? data.leaderboard : [];
        const exact = list.find(x => typeof x?.Name === 'string' && x.Name.toLowerCase() === name.toLowerCase());
        const pick = exact || list[0];
        const steamId = pick?.SteamID || null;
        if (!steamId) { setStatus('No SteamID found for that name on this server.', true); return; }
        showSteam(steamId);
        setStatus('Fetching team…');

        const tRes = await fetch(buildTeamUrl(steamId), { headers: { 'Accept': 'application/json' } });
        if (!tRes.ok) throw new Error(`TEAM HTTP ${tRes.status}`);
        const tData = await tRes.json();
        const team = Array.isArray(tData?.leaderboard) ? tData.leaderboard[0] : null;
        renderTeam(team);
        setStatus('');
    } catch (e) {
        console.error(e);
        setStatus(`Failed: ${e.message || e}`, true);
        renderTeam(null);
    }
}

fetchBtn.addEventListener('click', fetchSteamAndTeam);

clearBtn.addEventListener('click', () => {
    setStatus('');
    showSteam(null);
    teamSection.style.display = 'none';
    playerInput.value = ''; playerInput.focus();
});

playerInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') fetchSteamAndTeam();
});

copyBtn.addEventListener('click', async () => {
    const t = steamVal.textContent.trim();
    if (!t) return;
    try {
        await navigator.clipboard.writeText(t);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = 'Copy', 900);
    } catch {
        setStatus('Copy failed. You can select the SteamID manually.', true);
    }
});