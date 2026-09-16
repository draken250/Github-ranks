# Contributing to Github Ranks

Thanks for wanting to contribute! This project is a static, no-build web page — you
don't need Node, npm, or any tooling to work on it.

The whole app is three files, no build step required:

- [`index.html`](index.html) — structure and the filter/discover controls.
- [`style.css`](style.css) — the dark, podium-style leaderboard theme.
- [`app.js`](app.js) — searches GitHub live for developers by location and fetches
  their public stats from the GitHub REST API, then handles filtering/sorting/rendering.

There's no curated list of developers to maintain — everything shown on the board
comes from GitHub's own search API at [`location:`](https://docs.github.com/en/search-github/searching-on-github/searching-users)
query time, run live in the visitor's browser.

## Working on it locally

Serve the folder and open it — for example:

```
npx serve .
# or
python -m http.server 8000
```

(Opening `index.html` directly with `file://` mostly works too, but a local server
is more reliable across browsers.)

## Ideas that are especially welcome

- More accurate ways to estimate contributions (the commit count is an estimate
  from GitHub's search API, which has its own limits).
- Better handling of GitHub API rate limits for larger searches (e.g. smarter
  batching, clearer guidance around personal access tokens).
- Accessibility and mobile layout improvements.
- Additional filters (e.g. by organization, by contribution recency).
- Ways to let a search go beyond GitHub's 100-results-per-query cap for very
  large locations.

For anything bigger than a small fix, please open an issue first to discuss the
approach before investing a lot of time.

## Reporting bugs / ideas

Open a GitHub issue with steps to reproduce (for bugs) or a short description of
the use case (for feature ideas). Screenshots are very welcome.
