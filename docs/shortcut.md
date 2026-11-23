# Building the Shortcut

This guide builds an Apple Shortcut that shows the timetable for today. Run it on a
weekend or during a break and it shows the next school day instead.

The Shortcut does all the work itself: it downloads `data/timetable.json` and picks out
the classes for one student. Nothing else has to run on GitHub for it to work.

Data URL:

```
https://igarinpiano.github.io/pre-tokuhen/data/timetable.json
```

GitHub Pages may serve a copy up to about 10 minutes old after the file changes.

## How the data works

Only these parts of the JSON matter to the Shortcut:

```jsonc
{
  "subjects": {
    "en":       { "ja": "英語", "en": "English" },
    "soc-bckl": { "ja": "社会BCKL", "en": "Social Studies BCKL" },
    "pol":      { "ja": "政経", "en": "Politics & Economics" }
  },
  "events": {
    "kpack": { "ja": "河合塾 Kパック模試", "note": { "ja": "..." } }
  },
  "days": {
    "2026-11-30": {
      "slots": [
        { "periods": [1], "by": "division",
          "cells": { "a": "sci-ab", "b": "sci-ab", "c": "geo", "k": "chem", "l": "chem", "m": "phys", "n": "chem", "o": "phys" } },
        { "periods": [2, 3], "by": "class",
          "cells": { "1": "ja", "2": "ja", "3": "en", "4": "en", "5": "en", "6": "m1", "7": "m1", "8": "m1" } }
      ]
    },
    "2027-01-05": { "event": "kpack" }
  }
}
```

- `days` is keyed by date (`YYYY-MM-DD`). A date that is missing has no school.
- A day has either `slots` (classes) or `event` (an all-day event such as a mock exam).
- Each slot covers one or more `periods`. `[2, 3]` is one double lesson.
- `by` says which column to read: `"class"` → use the class number (`"1"`–`"8"`),
  `"division"` → use the division letter (`"a"`, `"b"`, `"c"`, `"k"`–`"o"`, lowercase).
- The cell value is a subject id. Look it up in `subjects` to get the name.
- Some subjects are electives (`soc-abn`, `soc-bckl`, `geo-pol`, `sci-ab`, `sci-bc`).
  The student's choice (for example `pol`) is also a subject id.

The keys used by the web app's link are the same ones the Shortcut uses:
`class`, `division`, and one key per elective (`soc-abn`, `soc-bckl`, `geo-pol`,
`sci-ab`, `sci-bc`). The Shortcut button on the site lists the values for the
current settings.

## The algorithm

1. Download the JSON.
2. Starting from today, check up to 21 days ahead and take the first date that
   exists in `days`.
3. If that day has `event`, show the event name and note.
4. Otherwise, for each slot:
   1. Read `cells[class]` if `by` is `"class"`, else `cells[division]`.
   2. Look up the subject name.
   3. If the student set a choice for that subject id, add the choice's name.
   4. Write one line: periods, then the name.
5. Show the lines.

## Step by step in the Shortcuts app

Variable names are suggestions. "Get Dictionary Value" accepts key paths with dots,
such as `subjects.en.ja`; if your version does not, chain one "Get Dictionary Value"
per key.

### Settings

1. **Dictionary** with Text values, for example:
   - `class` → `3`
   - `division` → `l`
   - `soc-bckl` → `pol` (only the electives your division has)
2. **Set Variable** `Settings` to the Dictionary.

### Download

3. **Get Contents of URL** → the data URL above.
4. **Get Dictionary from** the contents. **Set Variable** `Data`.
5. **Get Dictionary Value** `days` in `Data`. **Set Variable** `Days`.

### Find the day to show

6. **Repeat** 21 times:
   1. **Calculate** `Repeat Index − 1`.
   2. **Adjust Date**: Add (Calculation Result) days to **Current Date**.
   3. **Format Date**: format **ISO 8601**, *Include ISO 8601 Time* off.
      This always gives `2026-12-01`, even when the device uses the Japanese calendar.
      (Avoid a custom `yyyy-MM-dd` format: with the Japanese calendar `yyyy` is the era year.)
   4. **Get Dictionary Value** for key (Formatted Date) in `Days`.
   5. **If** Dictionary Value *has any value*: **Add to Variable** `Found` ← Formatted Date.
7. **Get Item from List**: First Item of `Found`. **Set Variable** `DateKey`.
8. **Get Dictionary Value** for key `DateKey` in `Days`. **Set Variable** `Day`.

### Event days

9. **Get Dictionary Value** `event` in `Day`.
10. **If** it *has any value*:
    1. **Get Dictionary Value** `events.(Dictionary Value).ja` in `Data` → title.
    2. **Get Dictionary Value** `events.(Dictionary Value).note.ja` in `Data` → note.
    3. **Show Result** with `DateKey`, title and note.
    4. **Stop This Shortcut**.

### Class days

11. **Get Dictionary Value** `slots` in `Day`.
12. **Repeat with Each** item:
    1. **Get Dictionary Value** `periods` in Repeat Item → **Combine Text** with
       separator `-` → `Periods` (gives `1` or `2-3`).
    2. **Get Dictionary Value** `by` in Repeat Item.
    3. **If** it *is* `class`: **Get Dictionary Value** `class` in `Settings`;
       **Otherwise**: **Get Dictionary Value** `division` in `Settings`.
       **Set Variable** `Column` (the If result).
    4. **Get Dictionary Value** `cells.(Column)` in Repeat Item → **Set Variable** `SubjectId`.
    5. **Get Dictionary Value** `subjects.(SubjectId).ja` in `Data` → **Set Variable** `Name`.
    6. **Get Dictionary Value** `(SubjectId)` in `Settings` → the student's choice, if any.
    7. **If** it *has any value*: **Get Dictionary Value** `subjects.(choice).ja` in `Data`,
       then **Text** `Name（choice name）` → **Set Variable** `Name`.
    8. **Text** `Periods  Name` → **Add to Variable** `Lines`.
13. **Combine Text** `Lines` with New Lines.
14. **Show Result** (or **Show Notification**) with `DateKey` and the combined text.

Use `.en` instead of `.ja` for English names.

### Optional: times

When bell times are published they appear under `bells` (`bells.normal`, `bells.a`,
`bells.p`), keyed by period number with `["HH:MM", "HH:MM"]` values. A day's `type`
(`"a"` or `"p"`) picks the table; days without `type` use `normal`. A double lesson
runs from the start of its first period to the end of its last.

## Sharing the Shortcut

Share it from the Shortcuts app with **Copy iCloud Link**, then put the link in
`js/config.js` as `shortcutUrl`. The site's Shortcut button will offer it.
