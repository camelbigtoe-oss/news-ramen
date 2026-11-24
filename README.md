# News Ramen

A personal news app for your phone. It pulls from vetted outlets across the political spectrum, merges the same story from different sources into one card ("full coverage"), shows who's covering it from the left, centre and right, and learns what you like from what you open, save, like, hide and skip. Everything it learns stays on your phone.

## Sections

- **For You**: your ranked feed with a "Hot right now" rail, plus sections (NZ, Christchurch, World, Views, Sport, League, Strength, Mysteries & Weird, Tech, Gaming, Science & Space, Entertainment, Business), **Blindspot**, and any sections you make yourself.
- **Briefing**: a roundup with Christchurch weather, what's on in the next 48 hours, your top 10 stories, and a button to have it read aloud.
- **Up Next**: upcoming events with countdowns, where-to-watch links and add-to-calendar. You can add your own events.
- **Saved**: saved stories, sorted into folders automatically, plus your own folders. Readable offline.

## Perspective

- Each outlet carries a rough political lean label (Left, Centre-left, Centre, Centre-right, Right) based on public media-bias ratings. You can turn the labels off.
- Opening a story shows a perspective bar for everyone covering it, and links a story from the other side when there is one.
- **Balance my feed** (on by default) slots in a story from the other side whenever your feed has leaned one way for a while.
- **Blindspot** lists news stories covered by only one side.
- Fringe and fun sources are marked **Speculative**; independent blogs are marked **Blog**.

## Teaching it

- 👍 / 👎 on any story, or **swipe right to save** and **swipe left to hide**. Pull down to refresh.
- **⋯** menu: why am I seeing this, less of this section, block an outlet, mute a word, follow a topic.
- **+ Section**: make your own section from keywords (e.g. Fishing: fishing, snapper, kingfish).
- Profile icon (top right): follows, your sections, perspective options, muted words, outlets on/off, theme, picture size, text size, backup and restore.

## How it updates

`.github/workflows/update.yml` runs `scripts/build-feed.mjs` every 30 minutes on GitHub Actions. That script writes `data/feed.json` and `data/events.json`, then the workflow publishes the site to GitHub Pages.

- Add or remove outlets: edit `FEEDS`, `SEARCHES`, `LEAN` and the domain allow-lists at the top of `scripts/build-feed.mjs`.
- Add hand-picked events: edit `data/events-curated.json`. Space launches and NRL fixtures are added automatically.

Run locally: `node scripts/build-feed.mjs`, then serve this folder (for example `python -m http.server`).

The OKASA font (`fonts/okasa.otf`) is free for personal use only; see `fonts/OKASA-LICENSE.txt`.
