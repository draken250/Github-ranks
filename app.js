"use strict";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CONCURRENT_REQUESTS = 4;
const TOKEN_KEY = "ghranks_token";

let rateLimited = false;

const state = {
  entries: [],
  results: [], // enriched developer stats, successfully fetched
  filters: {
    search: "",
    country: "",
    region: "",
    city: "",
    languages: new Set(),
  },
  sort: "commits",
};

const el = {
  countrySelect: document.getElementById("country-select"),
  regionSelect: document.getElementById("region-select"),
  citySelect: document.getElementById("city-select"),
  languageList: document.getElementById("language-list"),
  searchInput: document.getElementById("search-input"),
  sortSelect: document.getElementById("sort-select"),
  resetBtn: document.getElementById("reset-filters"),
  podium: document.getElementById("podium"),
  list: document.getElementById("leaderboard-list"),
  resultCount: document.getElementById("result-count"),
  subtitle: document.getElementById("board-subtitle"),
  statusBanner: document.getElementById("status-banner"),
  rateLimitLabel: document.getElementById("rate-limit-label"),
  tokenBtn: document.getElementById("token-btn"),
  tokenDialog: document.getElementById("token-dialog"),
  tokenForm: document.getElementById("token-form"),
  tokenInput: document.getElementById("token-input"),
  tokenClear: document.getElementById("token-clear"),
  discoverInput: document.getElementById("discover-input"),
  discoverBtn: document.getElementById("discover-btn"),
  quickLocations: document.getElementById("quick-locations"),
};

init();

function init() {
  bindFilterEvents();
  bindTokenDialog();
  bindDiscovery();
  render();
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
  if (cached) return Object.assign({}, cached, locationFields(entry));

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
    return Object.assign({}, data, locationFields(entry));
  } catch (err) {
    if (err.status === 403 || err.status === 429) {
      rateLimited = true;
      showStatus(
        "GitHub API rate limit reached. Add a personal access token (top right) to raise the limit, or wait a bit and reload.",
        "error"
      );
    } else if (err.status === 404) {
      // username in the directory no longer exists on GitHub — skip quietly
    }
    return null;
  }
}

async function discoverByLocation(query) {
  if (rateLimited) {
    showStatus(
      "GitHub API rate limit already reached — add a personal access token (top right) before discovering more.",
      "error"
    );
    return;
  }

  el.statusBanner.hidden = true;
  el.subtitle.textContent = `Searching GitHub for developers located in "${query}"…`;

  let searchResult;
  try {
    searchResult = await githubFetch(
      `https://api.github.com/search/users?q=${encodeURIComponent("location:" + query)}&per_page=100&sort=followers&order=desc`,
      { trackRateLimit: false }
    );
  } catch (err) {
    if (err.status === 403 || err.status === 429) rateLimited = true;
    showStatus(`GitHub search failed: ${err.message}`, "error");
    render();
    return;
  }

  const existingUsernames = new Set(state.entries.map((e) => e.username.toLowerCase()));
  const newEntries = searchResult.items
    .filter((item) => !existingUsernames.has(item.login.toLowerCase()))
    .map((item) => ({ username: item.login, country: query, region: "", city: "" }));

  if (newEntries.length === 0) {
    showStatus(`No new developers found for "${query}" (or they're already on the board).`, null);
    render();
    return;
  }

  state.entries.push(...newEntries);
  el.subtitle.textContent = `Found ${searchResult.total_count.toLocaleString()} public profiles matching "${query}" — fetching stats for ${newEntries.length}…`;

  // Jump the filter to this location immediately so results appear as they stream in,
  // instead of making the user wait for all ~100 profiles to finish fetching.
  state.filters.country = query;
  state.filters.region = "";
  state.filters.city = "";
  populateLocationOptions();
  el.countrySelect.value = query;
  updateRegionOptions();
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

  populateLanguageChips();
  render();
}

function bindDiscovery() {
  const run = () => {
    const query = el.discoverInput.value.trim();
    if (query) discoverByLocation(query);
  };
  el.discoverBtn.addEventListener("click", run);
  el.discoverInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });
  el.quickLocations.addEventListener("click", (e) => {
    const chip = e.target.closest(".quick-chip");
    if (!chip) return;
    el.discoverInput.value = chip.dataset.location;
    discoverByLocation(chip.dataset.location);
  });
}

function locationFields(entry) {
  return { country: entry.country, region: entry.region || "", city: entry.city || "" };
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

function populateLocationOptions() {
  const countries = uniqueSorted(state.entries.map((e) => e.country));
  fillSelect(el.countrySelect, countries, "All countries");
  updateRegionOptions();
}

function updateRegionOptions() {
  const country = state.filters.country;
  const pool = country ? state.entries.filter((e) => e.country === country) : state.entries;
  const regions = uniqueSorted(pool.map((e) => e.region).filter(Boolean));
  fillSelect(el.regionSelect, regions, "All regions");
  el.regionSelect.disabled = regions.length === 0;
  updateCityOptions();
}

function updateCityOptions() {
  const { country, region } = state.filters;
  let pool = state.entries;
  if (country) pool = pool.filter((e) => e.country === country);
  if (region) pool = pool.filter((e) => e.region === region);
  const cities = uniqueSorted(pool.map((e) => e.city).filter(Boolean));
  fillSelect(el.citySelect, cities, "All cities");
  el.citySelect.disabled = cities.length === 0;
}

function fillSelect(selectEl, values, placeholder) {
  const current = selectEl.value;
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  selectEl.appendChild(opt0);
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }
  if (values.includes(current)) selectEl.value = current;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function populateLanguageChips() {
  const counts = new Map();
  for (const dev of state.results) {
    for (const lang of dev.languages.slice(0, 5)) {
      counts.set(lang, (counts.get(lang) || 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);

  el.languageList.innerHTML = "";
  for (const [lang] of top) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = lang;
    chip.addEventListener("click", () => {
      if (state.filters.languages.has(lang)) {
        state.filters.languages.delete(lang);
        chip.classList.remove("active");
      } else {
        state.filters.languages.add(lang);
        chip.classList.add("active");
      }
      render();
    });
    el.languageList.appendChild(chip);
  }
}

function bindFilterEvents() {
  el.searchInput.addEventListener("input", () => {
    state.filters.search = el.searchInput.value.trim().toLowerCase();
    render();
  });

  el.countrySelect.addEventListener("change", () => {
    state.filters.country = el.countrySelect.value;
    state.filters.region = "";
    state.filters.city = "";
    updateRegionOptions();
    render();
  });

  el.regionSelect.addEventListener("change", () => {
    state.filters.region = el.regionSelect.value;
    state.filters.city = "";
    updateCityOptions();
    render();
  });

  el.citySelect.addEventListener("change", () => {
    state.filters.city = el.citySelect.value;
    render();
  });

  el.sortSelect.addEventListener("change", () => {
    state.sort = el.sortSelect.value;
    render();
  });

  el.resetBtn.addEventListener("click", () => {
    state.filters = { search: "", country: "", region: "", city: "", languages: new Set() };
    state.sort = "commits";
    el.searchInput.value = "";
    el.sortSelect.value = "commits";
    populateLocationOptions();
    document.querySelectorAll(".chip.active").forEach((c) => c.classList.remove("active"));
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
  const { search, country, region, city, languages } = state.filters;
  return state.results.filter((dev) => {
    if (country && dev.country !== country) return false;
    if (region && dev.region !== region) return false;
    if (city && dev.city !== city) return false;
    if (languages.size > 0 && !dev.languages.some((l) => languages.has(l))) return false;
    if (search) {
      const haystack = `${dev.name} ${dev.username}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
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

  el.resultCount.textContent = filtered.length;
  el.subtitle.textContent =
    state.entries.length === 0
      ? "Search a location to see ranked developers."
      : `${state.results.length} of ${state.entries.length} developers loaded · ranked by ${sortLabel()}`;

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
    el.list.innerHTML = `<li class="empty-state">Search a location above (try the 🇷🇼 Rwanda button) to pull real, ranked GitHub developers.</li>`;
    return;
  }
  if (totalCount === 0) {
    el.list.innerHTML = `<li class="empty-state">No developers match these filters.</li>`;
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
      const location = [dev.city, dev.region, dev.country].filter(Boolean).join(", ");
      return `
        <li class="dev-row">
          <div class="dev-rank">#${rank}</div>
          <img class="dev-avatar" src="${dev.avatarUrl}" alt="" loading="lazy" />
          <div class="dev-info">
            <a class="dev-name" href="${dev.htmlUrl}" target="_blank" rel="noopener">${escapeHtml(dev.name)}</a>
            <div class="dev-meta">
              <span>${escapeHtml(location)}</span>
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
