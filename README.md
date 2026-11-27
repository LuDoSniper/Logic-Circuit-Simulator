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

### Component exchange

The Library toolbar button exports selected components with their transitive custom dependencies to a JSON file or to an account-owned SQLite library. Import adds copies to the current project; conflicting definitions are rejected rather than overwritten. Library snapshots do not track later changes to a project. Guest users can exchange files. The library database table is created automatically on startup. Development test games use `logic-remaster-tests` v1 JSON with port names, widths, input and expected output maps. Import maps ports, adds new cases and ignores any exported execution results. Export includes available results for the current circuit.

### Multi-bit buses

Drag between two multi-bit pin groups of equal width to connect corresponding bits as a single visual bus. Hold Shift for the original single-bit wiring. Existing scalar wires are unchanged. A bus uses normal per-bit wire records with an optional `bus` flag, so simulation and export retain each lane. Right-click a bus to split it back into individual wires. The Bus n → m converter (Layout) supports 1–32 bits, bit offset, zero extension and sign extension.

Bus Merger and Bus Splitter (Layout, 1–32 bits) expose a single compact bus terminal and individually accessible D0…Dn−1 pins. D0 is the least-significant bit. Compact terminals require matching-width bus connections; use a splitter to access individual bits. The width converter remains available separately.

In a custom component’s Appearance editor, each multi-bit port can independently be displayed as individual Bits or a single compact Bus terminal. The choice travels with the existing pin layout in exports; logical node IDs and widths are unchanged. Legacy layouts default to individual pins. Existing full, matching-width connections are drawn as buses when either endpoint becomes compact; partial or irregular connections are preserved, and can be edited by returning the pin to Bits mode.

### Internal outputs

Right-click any output (including multi-bit outputs) and enable Internal output. The live signal remains visible in the internal circuit, but the output is not exposed as a custom component port, is not listed in the Appearance editor or the component development tests, and needs no external port name. The optional `isInternal` flag is persisted in circuit and library exports; older outputs remain external by default. Disabling the option exposes the output again when the component definition is saved.

Independent gate operands are not bus ports. Dragging between expanded pin groups of different widths connects the selected individual bits. Matching free bus groups still connect together by default; Shift forces a single bit on expanded pins. Compact bus terminals require a complete width-matched connection.

Custom component Appearance supports independent integer-grid width and height, draggable edge/corner handles, and automatic sizing. Pin spacing sets the minimum. Manual dimensions persist in definitions and editing drafts, and long captions shrink or truncate visually without changing their stored name.

Custom component Appearance includes a default color with palette and custom color picker. Right-click an instance to inherit its definition color, disable the tint, or override it locally. Colors persist in exports and drafts; local overrides survive cloning and definition updates, without changing the circuit logic or test signature.

The Probe (Input/Output palette) is a configurable 1–32 bit pass-through display. It accepts a signal at its input and forwards the same bits at its output. For multi-bit values both terminals are compact buses; the display places bit 0 at the top when vertical and at the right when horizontal, regardless of rotation and has a live binary tooltip. It does not create an external pin when used inside a custom component.

The Lock This Value context-menu option is available for every input width, and shows the complete binary word. Locking retains the current value and disables push-button behavior. Constant inputs are not exposed as custom component ports and are excluded from external input names and test selection; their stored values remain part of the circuit.
