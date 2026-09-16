"use strict";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CONCURRENT_REQUESTS = 4;
const TOKEN_KEY = "ghranks_token";
const THEME_KEY = "ghranks_theme";
const SEARCH_PAGE_SIZE = 100; // GitHub's per_page max for the search API
const SEARCH_RESULT_CAP = 1000; // GitHub only ever returns the first 1,000 matches for a query

let rateLimited = false;

const state = {
  entries: [],
  results: [], // enriched developer stats, successfully fetched
  filters: {
    search: "",
  },
  sort: "commits",
};

const el = {
  searchInput: document.getElementById("search-input"),
  sortSelect: document.getElementById("sort-select"),
  podium: document.getElementById("podium"),
  list: document.getElementById("leaderboard-list"),
  subtitle: document.getElementById("board-subtitle"),
  statusBanner: document.getElementById("status-banner"),
  rateLimitLabel: document.getElementById("rate-limit-label"),
  tokenBtn: document.getElementById("token-btn"),
  tokenDialog: document.getElementById("token-dialog"),
  tokenForm: document.getElementById("token-form"),
  tokenInput: document.getElementById("token-input"),
  tokenClear: document.getElementById("token-clear"),
  discoverForm: document.getElementById("discover-form"),
  discoverInput: document.getElementById("discover-input"),
  countSelect: document.getElementById("count-select"),
  quickLocations: document.getElementById("quick-locations"),
  themeToggle: document.getElementById("theme-toggle"),
};

init();

function init() {
  bindFilterEvents();
  bindTokenDialog();
  bindDiscovery();
  bindTheme();
  render();
}

// ---------- Theme ----------

function bindTheme() {
  applyTheme(localStorage.getItem(THEME_KEY));
  el.themeToggle.addEventListener("click", () => {
    const next = isDarkActive() ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}

function isDarkActive() {
  const explicit = localStorage.getItem(THEME_KEY);
  if (explicit) return explicit === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme) {
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
  el.themeToggle.textContent = isDarkActive() ? "☀️" : "🌙";
}

// ---------- GitHub API ----------

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

async function githubFetch(url, { headers: extraHeaders, trackRateLimit = true } = {}) {
  const headers = Object.assign(
    { Accept: "application/vnd.github+json" },
    extraHeaders || {}
  );
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (trackRateLimit) updateRateLimitLabel(res.headers);

  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function updateRateLimitLabel(headers) {
  const remaining = headers.get("x-ratelimit-remaining");
  const limit = headers.get("x-ratelimit-limit");
  if (remaining !== null && limit !== null) {
    el.rateLimitLabel.textContent = `${remaining}/${limit}`;
  }
}

function getCached(username) {
  try {
    const raw = localStorage.getItem(`ghranks_cache_${username.toLowerCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function setCached(username, data) {
  try {
    localStorage.setItem(
      `ghranks_cache_${username.toLowerCase()}`,
      JSON.stringify({ savedAt: Date.now(), data })
    );
  } catch {
    // storage full or unavailable — ignore, it's just a cache
  }
}

async function fetchDeveloperStats(entry) {
  const cached = getCached(entry.username);
  if (cached) return Object.assign({}, cached, { country: entry.country });

  if (rateLimited) return null;

  try {
    const profile = await githubFetch(`https://api.github.com/users/${entry.username}`);
    const repos = await githubFetch(
      `https://api.github.com/users/${entry.username}/repos?per_page=100&sort=pushed`
    );

    let stars = 0;
    const languageCounts = new Map();
    for (const repo of repos) {
      if (repo.fork) continue;
      stars += repo.stargazers_count || 0;
      if (repo.language) {
        languageCounts.set(repo.language, (languageCounts.get(repo.language) || 0) + 1);
      }
    }
    const languages = [...languageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    let commits = null;
    try {
      const commitSearch = await githubFetch(
        `https://api.github.com/search/commits?q=author:${entry.username}&per_page=1`,
        { trackRateLimit: false }
      );
      commits = commitSearch.total_count ?? null;
    } catch {
      commits = null; // search API is more rate-limited; degrade gracefully
    }

    const data = {
      username: entry.username,
      name: profile.name || profile.login,
      avatarUrl: profile.avatar_url,
      htmlUrl: profile.html_url,
      publicRepos: profile.public_repos ?? repos.length,
      followers: profile.followers ?? 0,
      stars,
      commits,
      languages,
    };

    setCached(entry.username, data);
    return Object.assign({}, data, { country: entry.country });
  } catch (err) {
    if (err.status === 403 || err.status === 429) {
      rateLimited = true;
      showStatus(
        "GitHub API rate limit reached. Add a personal access token (top right) to raise the limit, or wait a bit and reload.",
        "error"
      );
    } else if (err.status === 404) {
      // profile no longer exists on GitHub — skip quietly
    }
    return null;
  }
}

async function searchUsersByLocation(query, target) {
  const items = [];
  let totalCount = 0;
  let page = 1;

  while (items.length < target) {
    const perPage = Math.min(SEARCH_PAGE_SIZE, target - items.length);
    el.subtitle.textContent = `Searching GitHub for developers located in "${query}"…${
      page > 1 ? ` (page ${page})` : ""
    }`;

    let result;
    try {
      result = await githubFetch(
        `https://api.github.com/search/users?q=${encodeURIComponent(
          "location:" + query
        )}&per_page=${perPage}&page=${page}&sort=followers&order=desc`,
        { trackRateLimit: false }
      );
    } catch (err) {
      if (err.status === 403 || err.status === 429) rateLimited = true;
      if (items.length > 0) {
        showStatus(
          `GitHub search was rate-limited after ${items.length} results — showing what was found. Add a token (top right) for deeper searches.`,
          "error"
        );
        break;
      }
      throw err;
    }

    totalCount = result.total_count;
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= totalCount) break;
    page++;
  }

  return { items, totalCount };
}

async function discoverByLocation(query, count) {
  if (rateLimited) {
    showStatus(
      "GitHub API rate limit already reached — add a personal access token (top right) before discovering more.",
      "error"
    );
    return;
  }

  el.statusBanner.hidden = true;
  const target = Math.min(count, SEARCH_RESULT_CAP);
  el.subtitle.textContent = `Searching GitHub for developers located in "${query}"…`;

  let items, totalCount;
  try {
    ({ items, totalCount } = await searchUsersByLocation(query, target));
  } catch (err) {
    showStatus(`GitHub search failed: ${err.message}`, "error");
    render();
    return;
  }

  const existingUsernames = new Set(state.entries.map((e) => e.username.toLowerCase()));
  const newEntries = items
    .filter((item) => !existingUsernames.has(item.login.toLowerCase()))
    .map((item) => ({ username: item.login, country: query }));

  if (newEntries.length === 0) {
    showStatus(`No new developers found for "${query}" (or they're already on the board).`, null);
    render();
    return;
  }

  state.entries.push(...newEntries);
  el.subtitle.textContent = `Found ${totalCount.toLocaleString()} public profiles matching "${query}" — fetching stats for ${newEntries.length}…`;
  render();

  let renderQueued = false;
  const scheduleRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  };

  await fetchAllStats(newEntries, (dev) => {
    if (dev) {
      state.results.push(dev);
      scheduleRender();
    }
  });

  render();
}

function bindDiscovery() {
  const run = () => {
    const query = el.discoverInput.value.trim();
    const count = Number(el.countSelect.value) || 25;
    if (query) discoverByLocation(query, count);
  };
  el.discoverForm.addEventListener("submit", (e) => {
    e.preventDefault();
    run();
  });
  el.quickLocations.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    el.discoverInput.value = chip.dataset.location;
    document.querySelectorAll("#quick-locations .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    run();
  });
}

async function fetchAllStats(entries, onEach) {
  const results = new Array(entries.length);
  let cursor = 0;

  async function worker() {
    while (cursor < entries.length) {
      const i = cursor++;
      results[i] = await fetchDeveloperStats(entries[i]);
      el.subtitle.textContent = `Fetched ${i + 1} of ${entries.length} developers…`;
      if (onEach) onEach(results[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT_REQUESTS, entries.length) },
    worker
  );
  await Promise.all(workers);
  return results;
}

// ---------- Filters ----------

function bindFilterEvents() {
  el.searchInput.addEventListener("input", () => {
    state.filters.search = el.searchInput.value.trim().toLowerCase();
    render();
  });

  el.sortSelect.addEventListener("change", () => {
    state.sort = el.sortSelect.value;
    render();
  });
}

function bindTokenDialog() {
  el.tokenInput.value = getToken();
  el.tokenBtn.addEventListener("click", () => el.tokenDialog.showModal());
  el.tokenClear.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    el.tokenInput.value = "";
  });
  el.tokenForm.addEventListener("submit", () => {
    const value = el.tokenInput.value.trim();
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  });
}

// ---------- Rendering ----------

function getFiltered() {
  const { search } = state.filters;
  if (!search) return state.results;
  return state.results.filter((dev) => `${dev.name} ${dev.username}`.toLowerCase().includes(search));
}

function sortValue(dev) {
  switch (state.sort) {
    case "stars":
      return dev.stars ?? -1;
    case "repos":
      return dev.publicRepos ?? -1;
    case "followers":
      return dev.followers ?? -1;
    case "commits":
    default:
      return dev.commits ?? -1;
  }
}

function sortLabel() {
  switch (state.sort) {
    case "stars":
      return "stars";
    case "repos":
      return "repos";
    case "followers":
      return "followers";
    default:
      return "commits";
  }
}

function render() {
  const filtered = getFiltered().slice().sort((a, b) => sortValue(b) - sortValue(a));

  el.subtitle.textContent =
    state.entries.length === 0
      ? "Search a location to see ranked developers."
      : `${filtered.length} of ${state.entries.length} developers loaded · ranked by ${sortLabel()}`;

  const showPodium = filtered.length >= 3;
  renderPodium(showPodium ? filtered.slice(0, 3) : []);
  renderList(showPodium ? filtered.slice(3) : filtered, filtered.length);
}

function renderPodium(top3) {
  if (top3.length < 3) {
    el.podium.hidden = true;
    el.podium.innerHTML = "";
    return;
  }
  el.podium.hidden = false;
  const order = [1, 0, 2]; // 2nd, 1st, 3rd visually
  el.podium.innerHTML = order
    .map((i) => {
      const dev = top3[i];
      const place = i + 1;
      return `
        <div class="podium-slot" data-place="${place}">
          <img class="podium-avatar" src="${dev.avatarUrl}" alt="" loading="lazy" />
          <div class="podium-name">${escapeHtml(dev.name)}</div>
          <div class="podium-value">${formatValue(dev)}</div>
          <div class="podium-bar">${place}</div>
        </div>
      `;
    })
    .join("");
}

function renderList(rest, totalCount) {
  if (state.entries.length === 0) {
    el.list.innerHTML = `<li class="empty-state">Search a location above (try a quick pick like 🇷🇼 Rwanda) to pull real, ranked GitHub developers.</li>`;
    return;
  }
  if (totalCount === 0) {
    el.list.innerHTML = `<li class="empty-state">No developers match "${escapeHtml(state.filters.search)}".</li>`;
    return;
  }
  if (state.results.length === 0) {
    el.list.innerHTML = `<li class="loading-row">Loading…</li>`;
    return;
  }

  const startRank = totalCount - rest.length + 1;
  el.list.innerHTML = rest
    .map((dev, idx) => {
      const rank = startRank + idx;
      const langs = dev.languages
        .slice(0, 3)
        .map((l) => `<span class="dev-lang">${escapeHtml(l)}</span>`)
        .join("");
      return `
        <li class="dev-row">
          <div class="dev-rank">#${rank}</div>
          <img class="dev-avatar" src="${dev.avatarUrl}" alt="" loading="lazy" />
          <div class="dev-info">
            <a class="dev-name" href="${dev.htmlUrl}" target="_blank" rel="noopener">${escapeHtml(dev.name)}</a>
            <div class="dev-meta">
              <span>${escapeHtml(dev.country)}</span>
              ${langs}
            </div>
          </div>
          <div class="dev-value">
            <strong>${formatValue(dev)}</strong>
            <span>${sortLabel()}</span>
          </div>
        </li>
      `;
    })
    .join("");
}

function formatValue(dev) {
  const v = sortValue(dev);
  if (v < 0) return "—";
  return v.toLocaleString();
}

function showStatus(message, type) {
  el.statusBanner.textContent = message;
  el.statusBanner.hidden = false;
  el.statusBanner.className = `status-banner${type === "error" ? " error" : ""}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
