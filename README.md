# Github ranks

A simple, static leaderboard for GitHub developers — filterable by country, region,
city, and programming language. No backend, no build step: it's a community-maintained
JSON directory plus live stats pulled straight from the public GitHub API in your
browser.

**This project is open source and built to be contributed to.** Adding yourself takes
about 30 seconds and no code — see [Add yourself](#add-yourself) below.

## Features

- 🌍 Filter by country → region/state → city
- 🧑‍💻 Filter by programming language (derived from each developer's public repos)
- 🔎 Search by name or username
- 📊 Sort by estimated commits, stars, public repos, or followers
- 🥇 Podium view for the top 3
- 🔑 Optional personal access token (stored only in your browser) to raise the
  GitHub API rate limit from 60/hour to 5,000/hour

## Try it

Open [`index.html`](index.html) via a local server (see below) or through GitHub
Pages once it's enabled for this repo.

```
npx serve .
# or
python -m http.server 8000
```

## Add yourself

Everyone is welcome to add themselves to the leaderboard. Open
[`data/developers.json`](data/developers.json), add:

```json
{ "username": "your-github-username", "country": "Your Country" }
```

and open a pull request. Full details in [CONTRIBUTING.md](CONTRIBUTING.md#add-yourself-to-the-leaderboard).

## How it works

- `data/developers.json` is the community-maintained directory (username + location).
- `app.js` fetches each developer's public profile and repos from the GitHub REST
  API directly from your browser (nothing goes through a server), aggregates
  languages and stars, and estimates a commit count via GitHub's commit search API.
- Results are cached in `localStorage` for 30 minutes to keep well within GitHub's
  rate limits.
- Everything renders client-side with vanilla HTML/CSS/JS — no framework, no build
  step, easy to fork and deploy on GitHub Pages.

## Contributing

Pull requests are very welcome, whether that's adding yourself to the directory or
improving the app itself. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get
set up — it takes no tooling beyond a text editor and (optionally) a local static
file server.

## License

[MIT](LICENSE)
