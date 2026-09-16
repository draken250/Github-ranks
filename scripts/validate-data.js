#!/usr/bin/env node
// Validates data/developers.json against the schema rules.
// No dependencies on purpose, so CI and local runs need only Node.js.

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "developers.json");
const USERNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const ALLOWED_KEYS = new Set(["username", "country", "region", "city"]);

function fail(message) {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
}

let raw;
try {
  raw = fs.readFileSync(DATA_PATH, "utf8");
} catch (err) {
  fail(`Could not read ${DATA_PATH}: ${err.message}`);
  process.exit(1);
}

let entries;
try {
  entries = JSON.parse(raw);
} catch (err) {
  fail(`data/developers.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(entries)) {
  fail("data/developers.json must be a JSON array.");
  process.exit(1);
}

const seen = new Set();

entries.forEach((entry, i) => {
  const where = `entry #${i + 1}`;

  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    fail(`${where}: must be an object.`);
    return;
  }

  for (const key of Object.keys(entry)) {
    if (!ALLOWED_KEYS.has(key)) {
      fail(`${where}: unknown field "${key}". Allowed fields: ${[...ALLOWED_KEYS].join(", ")}.`);
    }
  }

  if (typeof entry.username !== "string" || !USERNAME_RE.test(entry.username)) {
    fail(`${where}: "username" must be a valid GitHub username.`);
  } else {
    const key = entry.username.toLowerCase();
    if (seen.has(key)) {
      fail(`${where}: duplicate username "${entry.username}".`);
    }
    seen.add(key);
  }

  if (typeof entry.country !== "string" || entry.country.trim().length === 0) {
    fail(`${where}: "country" is required and must be a non-empty string.`);
  }

  for (const optional of ["region", "city"]) {
    if (optional in entry && typeof entry[optional] !== "string") {
      fail(`${where}: "${optional}" must be a string if present.`);
    }
  }
});

if (process.exitCode === 1) {
  console.error(`\n${entries.length} entries checked, errors found above.`);
} else {
  console.log(`✔ data/developers.json looks good (${entries.length} entries).`);
}
