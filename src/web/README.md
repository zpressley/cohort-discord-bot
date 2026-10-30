# The web app

Cohort in the browser: the Command Tent. Plain Node, no framework, no build
step.

```
npm run web                    http://localhost:3000
PORT=8080 npm run web
COHORT_DATA_DIR=/some/dir      where battles are saved (default data/web)
GROQ_API_KEY=...               orders read and turns narrated by the AI
                               (without it: the fixed grammar, plain reports)
npm run test:browser           a full battle in Chromium (needs Playwright)
```

```
battles.js     the battles: muster, seats by link, each side's view (fog of
               war held here), read-back, orders, dispatches, saving and
               rebuilding from the order log, the replay
server.js      the HTTP server: the JSON API (listed at the top of the file)
               and the app's files
public/        the browser app: index.html, app.js (screens), map.js (the
               map and its gestures), app.css (layout)
themes/        one folder per theme; parchment is the only one so far. A
               theme is its theme.css variables and its assets (ASSETS.md)
browser/       the Playwright test
tests/         the API tests (part of npm test)
```

A seat's link is the only key to it: whoever holds the link plays that
side. Battles are JSON files; delete one and that battle is gone.
