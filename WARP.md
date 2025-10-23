# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- Runtime: Node.js (CI uses Node 20)
- App type: Discord bot + game engine (no build step)
- Key dirs: src/bot (Discord), src/game (engine), src/ai (AI helpers), src/database (Sequelize + SQLite dev), src/tests (scripted tests)
- Entry point: src/index.js

Setup and running locally
- Prereqs: Node 20+, a Discord bot token in DISCORD_TOKEN, optional DB_PATH to override SQLite location.
- Install deps:
  ```bash path=null start=null
  npm ci
  ```
- Start the bot (prod/dev):
  ```bash path=null start=null
  DISCORD_TOKEN={{DISCORD_TOKEN}} npm start
  DISCORD_TOKEN={{DISCORD_TOKEN}} npm run dev
  ```
- Database: SQLite file at data/cohort.db (created on first run). To use a custom path:
  ```bash path=null start=null
  DB_PATH=./data/custom.db DISCORD_TOKEN={{DISCORD_TOKEN}} npm run dev
  ```

Testing
- Test commands (scripted, no framework):
  ```bash path=null start=null
  npm test                    # runs schemas + core tests
  npm run test:schemas        # node src/tests/schemas/validator.test.js
  npm run test:core           # node src/tests/core/coreEngine.test.js
  ```
- Run a single test file (examples):
  ```bash path=null start=null
  node src/tests/commander/commanderTest.js
  node src/tests/balance/quickImprovedTest.js
  node src/game/combat/tests/simpleCombatTest.js
  ```
- Replay an existing battle from DB:
  ```bash path=null start=null
  node scripts/replayBattle.js <battleId>
  ```

Linting and formatting
- ESLint is a dev dependency, but no config or npm script is present. If needed, you can try:
  ```bash path=null start=null
  npx eslint .
  ```
  Note: This may require adding an eslint.config.js before it succeeds.

CI pipeline (GitHub Actions)
- Node 20; steps: npm ci → npm run test:schemas → npm run test:core.

High-level architecture (big picture)
- Discord interface (src/bot, src/index.js)
  - index.js boots DB (src/database/setup.js), initializes AI, loads slash commands (src/bot/commandLoader.js), routes interactions via src/bot/interactionRouter.js.
  - DM flow handled in src/bot/dmHandler.js; supports “simulate:” dry-runs and routes to turn resolution when both players submit.
- Game engine (src/game)
  - turnOrchestrator.js is the master pipeline per turn: interpret orders → mission auto-continue (Phase 1.5) → movement (positionBasedCombat) → visibility (fogOfWar) → combat (battleEngine) → casualties → victory checks → narrative summary.
  - battleEngine.js implements the Chaos/Preparation-based combat v2.0, aggregating unit attack/defense, chaos level, preparation divisors, and damage accumulation.
  - schemas/ with JSON Schemas + Ajv validation gates actions before deterministic phases; engine/adapters/schemaAdapter normalizes actions; culturalRules adjusts actions by culture.
- AI helpers (src/ai)
  - orderInterpreter parses natural language orders into structured actions; aiNarrativeEngine and officerQA produce briefings/answers when wired.
- Persistence (src/database)
  - Sequelize with SQLite in dev; models for Battle, Commander, EliteUnit, VeteranOfficer, BattleTurn, BattleCommander. setup.js authenticates, ensures minimal schema, seeds initial data if empty.

Data and control flows to know
- Battle lifecycle: /create-game and lobby interactions create a Battle record → both players DM orders → dmHandler stores orders in BattleTurn → when both present, processTurn() runs full pipeline and updates Battle.battleState/currentTurn and BattleTurn details.
- Mission continuation: Units with partial movement set an activeMission; if a subsequent order omits that unit or is “hold”, Phase 1.5 continues toward the stored target until completion.
- Scenario maps: src/game/maps/* provide terrain, objectives; interactionRouter and dmHandler select map by battle.scenario.

Environment variables (used in code)
- DISCORD_TOKEN: required for client.login()
- DB_PATH: optional SQLite file path (defaults to data/cohort.db)
- NODE_ENV: controls Sequelize logging
- SCHEMA_STRICT: enable/disable strict schema gating (defaults true)

Docs worth skimming first
- docs/README.md for the documentation map.
- docs/architecture/cohort_architecture.md for layered design and flows.
- docs/discord-bot/cohort_discord_layer.md for the Discord surface area and command lifecycles.

Repo-specific rules for agents (from docs/Context/warp_context_doc.md)
- When helping with code: check file version headers; ask before major changes; provide complete functions; include file names; when replacing code, show old vs new.
- Bug fixing approach: trace logs first; respect existing patterns; test incrementally.
- Preferred dev loop: analyze → confirm approach → propose precise file/function changes → implement after approval → run the targeted test file(s).

From Claude Project - 
Project scope & domain
The user is developing "Cohort," a sophisticated Discord-based ancient warfare strategy game spanning 3000 BC to 500 AD. The project features 20+ historically authentic civilizations with unique elite units, zone-based tactical combat on 20x20 grids (50m tiles = 1km battlefields), named officers who develop personalities and experience, and a multi-provider AI narrative system using GPT-4o-mini, Groq, and Claude. The technical stack includes Discord.js, Sequelize ORM with SQLite/PostgreSQL, and GitHub integration. The game emphasizes emotional investment through permanent veteran death mechanics where individual officers accumulate institutional memory through an 8-slot system - when officers die, their specific tactical knowledge is permanently lost. The project prioritizes historical authenticity over gamified mechanics, with extensive research backing each civilization's military characteristics, cultural restrictions, and tactical specializations.
Active workstreams & initiatives
Combat System Overhaul: Recently completed transition from ratio-based to chaos-modified attack/defense numerical system where base damage equals attacker's attack rating minus defender's defense rating, with chaos modifiers varying by battlefield conditions. The system creates asymmetric effects based on unit preparation levels - well-prepared forces negate chaos while unprepared forces suffer full penalties. Successfully implemented balance testing framework, though initial 80% competitive balance threshold proved too strict for historically asymmetric warfare.
Natural Language Command System: Ongoing development of sophisticated order parsing that converts player commands like "advance infantry to ford, form testudo" into structured tactical orders with cultural validation. Current focus on fixing mission persistence, position-based targeting, direction parsing inversions, and unit type detection failures. Multi-turn mission system (MISS-001) allows units to pursue distant objectives across multiple turns with automatic continuation logic.
AI Narrative Integration: Developing layered context architecture for rich battle storytelling that transforms mathematical combat outcomes into immersive historical narratives with authentic cultural personalities. System uses progressive narrative building with cultural speech patterns, environmental detail injection, and character development tracking.
Historical Research & Cultural Authentication: Comprehensive documentation of 20 ancient civilizations covering military innovations, tactical strengths/weaknesses, cultural values, and elite unit characteristics. Recent focus on environmental warfare effects, weapon effectiveness matrices, and veteran progression systems based on historical authenticity rather than arbitrary game balance.
Project methods & patterns
Uses JIRA-style task organization with epic codes (CMB-001, CMD-001, MISS-001, etc.) and detailed acceptance criteria. Development follows systematic issue resolution approach - recently documented and resolved 26 critical game mechanics problems spanning commander capture mechanics, victory conditions, morale systems, and formation changes. Emphasizes complete function replacements over code snippets, preferring to apply all fixes together then debug rather than incremental testing. Maintains public GitHub repository with verification through raw URLs for code review. Prioritizes building foundational systems completely rather than patching later, recognizing army building and combat mechanics as core to entire game experience. Consistently chooses historically-grounded solutions over complex systems, such as implementing weather as dynamic but predictable changes that force tactical adaptation.
Tools & resources
Development Stack: Discord.js for bot framework, Sequelize ORM for database operations, GitHub for version control with raw URL verification workflows. Uses PM2 for process management and Docker for containerization.
AI Services: Multi-provider system with OpenAI GPT-4o-mini, Anthropic Claude, and Groq for cost-optimized battle resolution and narrative generation. Implements smart cost management with provider fallback systems.
Historical Research: Extensive web search capabilities for primary source material, archaeological evidence, and scholarly analysis. Maintains detailed documentation of ancient military systems, environmental warfare effects, and cultural authenticity requirements.
Geographic Systems: Sophisticated coordinate tracking with natural language geographic reference system allowing commands like "advance to northern woods" while maintaining precise tactical positioning internally.

Use Task List here: /Users/zpressley/cohort-discord-bot/docs/Context/cohort_task_list.md
Task list is the development roadmap. 