# Logic Circuit Simulator

A logic circuit simulator useful for educational use.

This is a fork followed by an almost complete rewrite of [drendog's Logic-Circuit-Simuator](https://github.com/drendog/Logic-Circuit-Simulator).


## Demo

See <https://jp.pellet.name/hep/logiga/>


## Development

 * Checkout with git
 * `npm install`
 * Open VS Code and open folder
 * `npm run compile-watch` to run the TypeScript compiler (without output) to check for errors
 * `npm run lint-watch` to run `eslint` to check for linting errors
 * `npm run bundle-watch` to build the bundle with `esbuild` (can be done on every save because `esbuild` is so fast)
 * `npm run server` to serve locally for testing on port 8088


## Differences with Original Version

 * This fork is completely written in TypeScript
 * Based on web components so that it can easily be embedded by pulling in a single JS file
 * Dependency on p5 was removed
 * Interface is drawn differently, all with canvas calls and no external images
 * Screen is only refreshed when needed and not 60 times per second no matter what
 * Clocks can be paused
 * Components have been added: bit display, segment display, nibble display, half adder, muxes, register, RAM, counter, various decoders, etc.
 * Size of components (in terms of number of bits) can be changed
 * RAM/ROM contents can be loaded from files
 * Mouseover tooltips have been added
 * Components can be edited to be faulty, for educational exercises
 * Editor can be in several modes with different capabilities
 * Editor can zoom and pan with standard controls (touch, trackpad, mouse wheel, etc.)
 * Component buttons can be hidden or shown for educational purposes with URL parameters
 * Loading and saving using JSON is much cleaner and does not include unnecessary properties
 * Demo circuits are predefined and can be loaded from the JavaScript console
 * Circuits can be loaded from a JSON export by drag-n-drop
 * An animated propagation delay can be set
 * Custom components can be created, loaded, saved from library files
 * Tests for a given circuit can be defined (or automatically generated) and run
 * UI can be in English or French (easy to add more translations)
 * Much more


## License

[MIT License](https://choosealicense.com/licenses/mit/)

## Remaster accounts and projects

Use Node.js 24 LTS or newer (built-in SQLite). Run `npm ci`, `npm run compile`, `npm run bundle`, then `npm run server`. Open http://localhost:8088. No separate DB installation is required. `npm run test:server` runs the API integration tests. The old static server (`npm run server:static`) works in guest mode only. The database defaults to `data/logic.sqlite`; back it up securely, including WAL state (use SQLite backup or stop the server first). Set `LOGIC_DB` to override its location. For deployment behind an HTTPS reverse proxy, set `NODE_ENV=production`, `APP_ORIGIN=https://your-domain`, `HOST=127.0.0.1` (or your private interface), and `PORT` as needed. Only public assets are served; keep the database private. Sessions last 30 days. Account registration is open; email verification and password reset are not implemented yet.

The account button opens the project manager. On first explicit sign-in, if the account has no projects, the current guest circuit becomes its first project. Otherwise choose an existing project or save the guest circuit as a new project. While a project is active, snapshots go to SQLite, not to the guest storage. On sign-out the guest circuit is restored. Saves are debounced and revision-checked; a conflict can be resolved by creating a copy or explicitly reloading. Keep a JSON export of important work until the feature has been tested on your browser. Unsaved changes after a failed request remain in memory, not in a persistent offline queue.
