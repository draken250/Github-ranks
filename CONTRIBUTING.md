# Contributing to Github Ranks

Thanks for wanting to contribute! This project is a static, no-build web page — you
don't need Node, npm, or any tooling to work on it. There are two easy ways to help:

1. [Add yourself to the leaderboard](#add-yourself-to-the-leaderboard) (30 seconds, no code).
2. [Improve the app](#improving-the-app) (HTML/CSS/JS, no build step).

## Add yourself to the leaderboard

1. Fork this repository and open [`data/developers.json`](data/developers.json).
2. Add an entry for yourself at the end of the array:

   ```json
   {
     "username": "your-github-username",
     "country": "Your Country",
     "region": "Your State/Province (optional)",
     "city": "Your City (optional)"
   }
   ```

   Only `username` and `country` are required. Everything else about you (name,
   avatar, repos, stars, commit count, languages) is pulled live from the public
   GitHub API — you don't need to type any of that in.

3. Run the validator locally to make sure the file is still well-formed:

   ```
   node scripts/validate-data.js
   ```

4. Open a pull request. A GitHub Actions check runs the same validation
   automatically, so you'll get quick feedback if anything needs fixing.

That's it — once merged, you'll show up on the leaderboard the next time someone
loads the page.

### Guidelines for the directory

- One entry per person, keyed by your real GitHub username.
- Please don't add other people's accounts without their consent.
- Keep `country` a real country name (this is what filtering is grouped by first).
- `region` and `city` are free text — use whatever you'd naturally call the place
  you're in.

## Improving the app

The whole app is three files, no build step required:

- [`index.html`](index.html) — structure and the filter controls.
- [`style.css`](style.css) — the dark, podium-style leaderboard theme.
- [`app.js`](app.js) — loads `data/developers.json`, fetches live stats from the
  GitHub REST API in the browser, and handles filtering/sorting/rendering.

To work on it locally, just serve the folder and open it — for example:

```
npx serve .
# or
python -m http.server 8000
```

(Opening `index.html` directly with `file://` also mostly works, but some browsers
block `fetch()` of local JSON over `file://`, so a local server is more reliable.)

Ideas that are especially welcome:

- More accurate ways to estimate contributions (the commit count is an estimate
  from GitHub's search API, which has its own limits).
- Better handling of GitHub API rate limits for large directories.
- Accessibility and mobile layout improvements.
- Additional filters (e.g. by organization, by contribution recency).

For anything bigger than a small fix, please open an issue first to discuss the
approach before investing a lot of time.

## Reporting bugs / ideas

Open a GitHub issue with steps to reproduce (for bugs) or a short description of
the use case (for feature ideas). Screenshots are very welcome.
