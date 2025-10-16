# Cohort Discord Bot - Complete File Reference

## Project Overview

A Discord bot for managing tactical naval warfare games with AI-powered narrative elements, turn-based combat, and strategic army management.

**Repository:** https://github.com/zpressley/cohort-discord-bot

---

## AI Systems (`src/ai/`)

**aiManager.js** - Main AI coordination layer
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/ai/aiManager.js

**aiNarrativeEngine.js** - Generates battle narratives and atmospheric descriptions
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/ai/aiNarrativeEngine.js

**officerQA.js** - Officer question-answering system
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/ai/officerQA.js

**orderInterpreter.js** - Natural language order processing
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/ai/orderInterpreter.js

---

## Discord Bot Core (`src/bot/`)

**index.js** - Bot entry point
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/index.js

**commandLoader.js** - Dynamic command loading
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/commandLoader.js

**interactionHandler.js** - Main interaction router
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/interactionHandler.js

**dmHandler.js** - Direct message handling
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/dmHandler.js

**armyInteractionHandler.js** - Army building interactions
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/armyInteractionHandler.js

**gameInteractionHandler.js** - In-game interactions
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/gameInteractionHandler.js

**lobbyInteractionHandler.js** - Pre-game lobby interactions
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/lobbyInteractionHandler.js

---

## Commands (`src/bot/commands/`)

**abandon-battle.js** - Leave an active battle
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/commands/abandon-battle.js

**build-army.js** - Create army composition
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/commands/build-army.js

**create-game.js** - Initialize new game
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/commands/create-game.js

**join-battle.js** - Join existing battle
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/commands/join-battle.js

**lobby.js** - View game lobby
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/commands/lobby.js

**ping.js** - Bot health check
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/commands/ping.js

**stats.js** - Player statistics
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/commands/stats.js

**test-emoji.js** - Emoji testing
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/commands/test-emoji.js

**test-join.js** - Join testing
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/commands/test-join.js

**test-submit-both.js** - Submission testing
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/bot/commands/test-submit-both.js

---

## Database (`src/database/`)

**setup.js** - Database initialization and configuration
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/database/setup.js

### Models (`src/database/models/`)

**Battle.js** - Battle state and metadata
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/database/models/Battle.js

**BattleTurn.js** - Turn-by-turn records
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/database/models/BattleTurn.js

**Commander.js** - Player commander profiles
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/database/models/Commander.js

**EliteUnit.js** - Special unit definitions
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/database/models/EliteUnit.js

**VeteranOfficer.js** - Experienced officer records
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/database/models/VeteranOfficer.js

---

## Game Logic (`src/game/`)

**battleEngine.js** - Main combat resolution
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/game/battleEngine.js

**turnManager.js** - Turn sequencing and validation
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/game/turnManager.js

**turnOrchestrator.js** - High-level turn coordination
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/game/turnOrchestrator.js

**orderParser.js** - Command parsing logic
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/game/orderParser.js

**movementSystem.js** - Unit movement mechanics
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/game/movementSystem.js

**positionBasedCombat.js** - Position-dependent combat resolution
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/game/positionBasedCombat.js

**fogOfWar.js** - Information visibility system
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/game/fogOfWar.js

**armyData.js** - Army composition data
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/game/armyData.js

**briefingGenerator.js** - Battle briefing creation
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/game/briefingGenerator.js

### Maps (`src/game/maps/`)

**mapUtils.js** - Map utility functions
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/game/maps/mapUtils.js

**riverCrossing.js** - River crossing map definition
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/game/maps/riverCrossing.js

---

## Documentation - Architecture (`docs/architecture/`)

**cohort_architecture.md** - System architecture overview
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/architecture/cohort_architecture.md

**cohort_data_maps.md** - Data structure mappings
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/architecture/cohort_data_maps.md

**cohort_function_ref.md** - Function reference guide
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/architecture/cohort_function_ref.md

**cohort_variable_index.md** - Variable naming index
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/architecture/cohort_variable_index.md

---

## Documentation - AI Systems (`docs/ai-systems/`)

**cohort_ai_systems.md** - AI integration details
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/ai-systems/cohort_ai_systems.md

---

## Documentation - Discord Bot (`docs/discord-bot/`)

**cohort_discord_layer.md** - Discord integration layer
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/discord-bot/cohort_discord_layer.md

**cohort_commands_detail.md** - Command specifications
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/discord-bot/cohort_commands_detail.md

---

## Documentation - Game Logic (`docs/game-logic/`)

**cohort_game_logic.md** - Core game mechanics
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/game-logic/cohort_game_logic.md

**cohort_tactical_systems.md** - Tactical combat systems
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/game-logic/cohort_tactical_systems.md

**cohort_workflows.md** - Game flow diagrams
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/game-logic/cohort_workflows.md

---

## Documentation - Guides (`docs/guides/`)

**cohort_implementation_guide.md** - Setup and deployment
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/guides/cohort_implementation_guide.md

**cohort_system_map.md** - System relationship map
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/guides/cohort_system_map.md

---

## Documentation - Master Files (`docs/`)

**README.md** - Documentation overview
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/README.md

**cohort_master_index.md** - Complete documentation index
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/cohort_master_index.md

**cohort_db_docs.md** - Database schema documentation
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/docs/cohort_db_docs.md

---

## Utility Scripts

**deploy-commands.js** - Register slash commands with Discord API
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/deploy-commands.js

**checkBattles.js** - Battle state diagnostic tool
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/checkBattles.js

**checkDB.js** - Database inspection utility
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/src/checkDB.js

**commit.sh** - Git commit automation script
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/commit.sh

---

## Configuration Files

**package.json** - Node.js dependencies and scripts
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/package.json

**.gitignore** - Git exclusion patterns
https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/.gitignore

---

## Total Files: 60+

All URLs follow the pattern:
`https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/[filepath]`

---

## Regenerating This List

To regenerate the complete file list with GitHub URLs, run this command from the project root:

```bash
find . -type f \
  ! -path "*/node_modules/*" \
  ! -path "*/.git/*" \
  ! -path "*/data/*" \
  ! -name "*.db" \
  ! -name ".env" \
  ! -name "package-lock.json" \
  ! -name ".DS_Store" \
  \( -name "*.js" -o -name "*.json" -o -name "*.md" -o -name ".gitignore" -o -name "*.sh" \) \
  | sed 's|^\./||' \
  | while read file; do 
      echo "$file: https://raw.githubusercontent.com/zpressley/cohort-discord-bot/main/$file"
    done | sort
```

This command:
- Finds all `.js`, `.json`, `.md`, `.gitignore`, and `.sh` files
- Excludes `node_modules`, `.git`, `data` directories
- Excludes `.db`, `.env`, `package-lock.json`, and `.DS_Store` files
- Formats output as `filename: GitHub-raw-URL`
- Sorts alphabetically