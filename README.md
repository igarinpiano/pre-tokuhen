# Tokuhen Timetable

Timetable for the third-year special program (前期特編), November 30, 2026 to January 15, 2027,
including the winter break, the K-pack mock exam, the Common Test and self-scoring day.

**Site:** https://igarinpiano.github.io/pre-tokuhen/

- Three views: a timeline of your subjects (scroll sideways), a week and a day.
- The strip of ticks above the views covers the whole term. Hover or drag to move through it.
- Japanese UI by default; English when the browser's language isn't Japanese.
  Dates follow the device's calendar setting (e.g. 令和8年).
- Follows light and dark mode.
- Works offline and can be added to the Home Screen. When the timetable data changes,
  open copies show an **Update** button.

## Links with your settings

Choosing your class, division and electives updates the address. Bookmark it, or add it to
your Home Screen, to open the site with the same settings.

```
https://igarinpiano.github.io/pre-tokuhen/?class=3&division=l&soc-bckl=pol
```

| Key | Values |
| --- | --- |
| `class` | `1`–`8` |
| `division` | `a`, `b`, `c`, `k`, `l`, `m`, `n`, `o` |
| `soc-abn`, `soc-bckl` | `geo`, `jh`, `wh`, `pol` |
| `geo-pol` | `geo`, `pol` |
| `sci-ab` | `chem-b`, `bio-b`, `earth-b` |
| `sci-bc` | `bio-b`, `earth-b` |
| `lang` | `ja` or `en` (optional; overrides the browser language) |

Without settings, the week and day views list every class and division.

## Reporting mistakes and class swaps

Use **Report what's missing or incorrect** on the site, or open an issue with the
[report form](https://github.com/igarinpiano/pre-tokuhen/issues/new?template=report.yml). Pull requests that edit
`data/timetable.json` directly are welcome too.

## The data

Everything the site shows comes from [`data/timetable.json`](data/timetable.json):

- `days` — one entry per date. A day has `slots` or an all-day `event`.
  - `periods` — `[1]` for a single lesson, `[2, 3]` for a double lesson.
  - `by` — `"class"` (cells `"1"`–`"8"`) or `"division"` (cells `"a"`…`"o"`).
  - `cells` — subject id for each class or division.
  - `changed` — cells that differ from the usual timetable (shown with a mark).
  - `type` — `"a"` for 午前特 (AM-toku) days, `"p"` for 午後特 (PM-toku) days.
- `subjects` — names (`ja`, `en`), optional shorter names for tight spaces (`abbr`, e.g. the timeline's row labels), one- or two-letter labels for timeline cells (`short`), and color group.
- `electives` — the choices for each elective subject.
- `events` — all-day events with a note.
- `bells` — period times. `null` until published; then, for example:

  ```json
  "bells": {
    "normal": { "1": ["08:40", "09:35"], "2": ["09:45", "10:40"] },
    "a": null,
    "p": null
  }
  ```

  Times appear in the day view (with a "now" mark) as soon as they are filled in.

Check the file before committing:

```
node scripts/validate.mjs
```

The same check runs on GitHub for every push and pull request that touches the data.

## Where the text lives

| What | File |
| --- | --- |
| Subject and event names (Japanese and English) | `data/timetable.json` → `subjects` (`ja`, `en`, `abbr`, `short`), `events`, `dayTypes` |
| Interface text (Japanese and English) | `js/i18n.js` |
| Repository, data and Shortcut links | `js/config.js` |

## Shortcut

[docs/shortcut.md](docs/shortcut.md) explains how to build an Apple Shortcut that reads the
JSON and shows today's classes. The Shortcut button on the site is shown on Apple devices only.

## Running locally

Any static file server works, for example:

```
python3 -m http.server 8000
```

Then open http://localhost:8000/. There is no build step.

## Publishing

In the repository settings, open **Pages** and choose **Deploy from a branch**,
branch `main`, folder `/ (root)`.
