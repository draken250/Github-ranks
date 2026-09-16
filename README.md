# Github ranks

**🔗 [Live demo](https://draken250.github.io/Github-ranks/)** — try the "Discover
developers by location" search in the sidebar (there's a Rwanda 🇷🇼 quick button) to
see it pull real, live-ranked GitHub developers for any country.

A simple, static leaderboard for GitHub developers — filterable by country, region,
city, and programming language, all the way down to city level. No backend, no build
step: it combines a community-maintained JSON directory with live, on-demand discovery
of real developers by location, both powered by the public GitHub API straight from
your browser.

![Leaderboard screenshot, showing the top developers found for Rwanda](docs/screenshot.png)

**This project is open source and built to be contributed to.** Adding yourself takes
about 30 seconds and no code — see [Add yourself](#add-yourself) below.

## Features

- 🌍 Filter by country → region/state → city
- 🔭 **Discover by location** — search GitHub live for up to 100 real developers in any
  country, region, or city (e.g. type "Rwanda") without needing anyone to be added to
  the directory first
- 🧑‍💻 Filter by programming language (derived from each developer's public repos)
- 🔎 Search by name or username
- 📊 Sort by estimated commits, stars, public repos, or followers
- 🥇 Podium view for the top 3
- 🔑 Optional personal access token (stored only in your browser) to raise the
  GitHub API rate limit from 60/hour to 5,000/hour — recommended if you want to pull
  a full "top 100" for a country, since that means ~100-200 API calls

## Try it

**[draken250.github.io/Github-ranks](https://draken250.github.io/Github-ranks/)** is
the live version, or run it locally via a local server (see below).

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
- The "Discover by location" search calls GitHub's `search/users?q=location:<query>`
  endpoint to find up to 100 real public profiles matching a location, live — no
  curation needed to see rankings for a given country.
- For every developer (directory or discovered), `app.js` fetches their public profile
  and repos from the GitHub REST API directly from your browser (nothing goes through
  a server), aggregates languages and stars, and estimates a commit count via GitHub's
  commit search API.
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
