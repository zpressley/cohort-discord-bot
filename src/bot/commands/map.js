const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('map')
    .setDescription('Set or view your tactical map viewport'),

  async execute(interaction) {
    try {
      const select = new StringSelectMenuBuilder()
        .setCustomId('map-view-select')
        .setPlaceholder('Choose your map view & scale')
        .addOptions(
          { label: 'Tactical – Default (follow commander)', value: 'tac:default' },
          { label: 'Tactical – Center', value: 'tac:center' },
          { label: 'Tactical – Northwest', value: 'tac:nw' },
          { label: 'Tactical – Northeast', value: 'tac:ne' },
          { label: 'Tactical – Southwest', value: 'tac:sw' },
          { label: 'Tactical – Southeast', value: 'tac:se' },
          { label: 'Operational – Default (follow commander)', value: 'op:default' },
          { label: 'Operational – Center', value: 'op:center' },
          { label: 'Operational – Northwest', value: 'op:nw' },
          { label: 'Operational – Northeast', value: 'op:ne' },
          { label: 'Operational – Southwest', value: 'op:sw' },
          { label: 'Operational – Southeast', value: 'op:se' }
        );

      await interaction.reply({
        content: 'Select your preferred map viewport (persisted for briefings):',
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('map command error:', error);
      await interaction.reply({ content: '❌ Error generating map.', flags: MessageFlags.Ephemeral });
    }
  },

  async handleSelect(interaction) {
    try {
      const raw = interaction.values?.[0] || 'tac:default';
      const [mode, view] = raw.split(':'); // mode: 'tac' | 'op'
      const { models } = require('../../database/setup');
      const commander = await models.Commander.findByPk(interaction.user.id);
      if (commander) {
        const prefs = commander.preferences || {};
        prefs.mapView = view;
        prefs.mapMode = mode;
        commander.preferences = prefs;
        await commander.save();
      }

      const battle = await models.Battle.findOne({
        where: {
          status: 'in_progress',
          [Op.or]: [ { player1Id: interaction.user.id }, { player2Id: interaction.user.id } ]
        }
      });

      if (!battle) {
        await interaction.update({ content: `Map view set to ${view}. No active battle.`, components: [] });
        return;
      }

      const playerSide = battle.player1Id === interaction.user.id ? 'player1' : 'player2';
      const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';

      const battleState = battle.battleState || {};
      const { RIVER_CROSSING_MAP } = require('../../game/maps/riverCrossing');
      const { getUnitEmoji, getStackedEmoji, buildOperationalUnitTiles, getOperationalTerrainLabel } = require('../../game/maps/mapUtils');
      // Prefer the battle's stored map (with terrain), fall back to static map
      const map = battleState.map || RIVER_CROSSING_MAP;

      const playerData = battleState[playerSide] || {};
      const opponentData = battleState[opponentSide] || {};

      const friendlyUnits = Array.isArray(playerData.unitPositions)
        ? playerData.unitPositions
        : (playerData.unitPositions ? Object.values(playerData.unitPositions) : []);

      const enemyAllUnits = Array.isArray(opponentData.unitPositions)
        ? opponentData.unitPositions
        : (opponentData.unitPositions ? Object.values(opponentData.unitPositions) : []);

      const visibleEnemyPositions = new Set(playerData.visibleEnemyPositions || []);
      const visibleEnemies = enemyAllUnits.filter(u => u && visibleEnemyPositions.has(u.position));

      // Always keep real sides in mapData; generateEmojiGrid will color
      // friend/enemy based on viewingSide.
      const mapData = {
        terrain: map.terrain,
        player1Units: playerSide === 'player1' ? friendlyUnits : visibleEnemies,
        player2Units: playerSide === 'player2' ? friendlyUnits : visibleEnemies
      };

      // Compute viewport on 40x40 grid
      const { parseCoord, coordToString, calculateViewport, generateEmojiMapViewport, generateOperationalMap } = require('../../game/maps/mapUtils');
      const GRID = 40, H = 15, W = 15; let top=0,left=0;
      function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi,v)); }
      if (view === 'center') { top = Math.floor((GRID-H)/2); left = Math.floor((GRID-W)/2); }
      else if (view === 'nw') { top=0; left=0; }
      else if (view === 'ne') { top=0; left=GRID-W; }
      else if (view === 'sw') { top=GRID-H; left=0; }
      else if (view === 'se') { top=GRID-H; left=GRID-W; }
      else {
        const commanderPos = battle.battleState[playerSide]?.commander?.position || friendly[0]?.position || 'T20';
        const p = parseCoord(commanderPos) || { row: 19, col: 19 };
        top = clamp(p.row - Math.floor(H/2), 0, GRID - H);
        left = clamp(p.col - Math.floor(W/2), 0, GRID - W);
      }

      // Derive center coordinate from top/left for use in operational map
      const centerRow = top + Math.floor(H / 2);
      const centerCol = left + Math.floor(W / 2);
      const centerCoord = coordToString({ row: centerRow, col: centerCol });

      // Overlays from intel memory
      const intelMem = (battle.battleState?.[playerSide]?.intelMemory) || [];
      const overlays = intelMem.filter(e => (battle.currentTurn - (e.lastSeenTurn || 0)) >= 2).map(e => e.position);

      let preview;
      let scaleLabel;
      let opTiles = null;
      let opMap = null;
      let opViewport = null;

      if (mode === 'op') {
        // Operational 15x15 ASCII map (zoomed-out view, 50m tiles)
        const { createMap } = require('../../game/maps/baseMapRS');
        opMap = createMap();
        const gridSize20 = opMap.gridSize || 20;
        const viewSize20 = 15;

        // Mirror generateOperationalMap's center/viewport logic so text summaries
        // line up exactly with what the player sees.
        let opCenterCoord = 'K10';
        try {
          const tac = parseCoord(centerCoord || 'T20');
          const opRow = Math.floor(tac.row / 2);
          const opCol = Math.floor(tac.col / 2);
          opCenterCoord = coordToString({ row: opRow, col: opCol });
        } catch (_) {
          opCenterCoord = 'K10';
        }

        opViewport = calculateViewport(opCenterCoord, gridSize20, viewSize20);
        opTiles = buildOperationalUnitTiles(battle.battleState, playerSide);

        preview = generateOperationalMap(battle.battleState, centerCoord, playerSide);
        scaleLabel = 'Tiles are 50×50m (operational scale; operational view abstracted from tactical terrain).';
      } else {
        // Tactical 15x15 emoji viewport (25m tiles)
        preview = generateEmojiMapViewport(
          mapData,
          { top, left, width: W, height: H },
          overlays,
          playerSide
        );
        scaleLabel = 'Tiles are 25×25m (tactical scale).';
      }

      // Mini briefing: summarize your forces and visible intel
      const describeOperationalCell = (units, side, opRow, opCol, forIntel = false) => {
        if (!units || !units.length) return null;
        const emoji = getStackedEmoji(units, side === 'friendly' ? 'friendly' : 'enemy');
        const opCoord = coordToString({ row: opRow, col: opCol });
        const terrainLabel = opMap ? getOperationalTerrainLabel(opMap, opCoord) : 'Plains';

        let total = 0;
        let cav = 0;
        let inf = 0;
        let elite = false;
        let deployedCount = 0;
        let movingCount = 0;

        units.forEach(u => {
          const s = u.currentStrength ?? u.maxStrength ?? 0;
          total += s;
          const typeStr = (u.unitType || '').toLowerCase();
          const isCav = u.mounted || typeStr.includes('cavalry') || typeStr.includes('horse');
          if (isCav) cav += s; else inf += s;
          if (u.isCommander || u.isElite) elite = true;
          const fs = (u.formationStatus || '').toLowerCase();
          if (fs.includes('deploy') || fs === 'line' || fs === 'column' || fs === 'square') deployedCount++;
          else if (fs) movingCount++;
        });

        // Type labels: primary (dominant), optional secondary
        let primaryType = 'Infantry';
        let secondaryType = '';
        if (cav > inf) {
          primaryType = 'Cavalry';
          if (inf > 0) secondaryType = 'Infantry';
        } else {
          primaryType = 'Infantry';
          if (cav > 0) secondaryType = 'Cavalry';
        }

        let labelCore = primaryType;
        if (secondaryType) labelCore = `${primaryType}, ${secondaryType}`;

        if (elite) {
          labelCore = `Elite ${labelCore}`;
        }

        if (forIntel) {
          labelCore = `Enemy ${labelCore}`;
        }

        const statusLabel = deployedCount >= units.length / 2 ? 'Deployed' : 'Moving';
        const strengthStr = total || '?';

        const strengthDisplay = forIntel ? `~${strengthStr}` : `${strengthStr}`;
        return `  ${emoji} [${opCoord}] ${labelCore}  ${strengthDisplay} (${terrainLabel}, ${statusLabel})`;
      };

      const summarizeForces = () => {
        const max = 8;
        if (mode === 'op') {
          if (!opTiles || !opTiles.size) return '  (no units tracked)';
          const lines = [];
          opTiles.forEach((cell, key) => {
            const [opRow, opCol] = key.split(',').map(Number);
            if (opViewport && (opRow < opViewport.startRow || opRow > opViewport.endRow ||
                opCol < opViewport.startCol || opCol > opViewport.endCol)) return;
            if (!cell.friendly || !cell.friendly.length) return;
            const line = describeOperationalCell(cell.friendly, 'friendly', opRow, opCol, false);
            if (line) lines.push(line);
          });
          if (!lines.length) return '  (no units tracked in this view)';
          return lines.slice(0, max).join('\n');
        }

        if (!friendlyUnits.length) return '  (no units tracked)';
        return friendlyUnits.slice(0, max).map(u => {
          const icon = getUnitEmoji(u, 'friendly');
          const pos = u.position || '?';
          const type = (u.unitType || (u.mounted ? 'Cavalry' : 'Infantry') || '').toString();
          const size = u.currentStrength ?? u.maxStrength ?? '?';
          return `  ${icon} [${pos}] ${type || 'Unit'}  ${size}`;
        }).join('\n');
      };

      const summarizeIntel = () => {
        const max = 8;
        if (mode === 'op') {
          if (!opTiles || !opTiles.size) return '  No enemy forces spotted.';
          const lines = [];
          opTiles.forEach((cell, key) => {
            const [opRow, opCol] = key.split(',').map(Number);
            if (opViewport && (opRow < opViewport.startRow || opRow > opViewport.endRow ||
                opCol < opViewport.startCol || opCol > opViewport.endCol)) return;
            if (!cell.enemy || !cell.enemy.length) return;
            const line = describeOperationalCell(cell.enemy, 'enemy', opRow, opCol, true);
            if (line) lines.push(line);
          });
          if (!lines.length) return '  No enemy forces spotted.';
          return lines.slice(0, max).join('\n');
        }

        if (!visibleEnemies.length) return '  No enemy forces spotted.';
        return visibleEnemies.slice(0, max).map(u => {
          const icon = getUnitEmoji(u, 'enemy');
          const pos = u.position || '?';
          const type = (u.unitType || (u.mounted ? 'Cavalry' : 'Infantry') || '').toString();
          const size = u.currentStrength ?? u.maxStrength ?? '?';
          return `  ${icon} [${pos}] ${type || 'Enemy unit'}  ~${size}`;
        }).join('\n');
      };

      const miniBrief = `Your forces (approximate):\n${summarizeForces()}\n\nIntel (visible enemy):\n${summarizeIntel()}`;

      await interaction.update({
        content: `Map view set to ${mode === 'op' ? 'operational' : 'tactical'} / ${view}.\n${scaleLabel}\n\n\`\`\`\n${preview}\n\`\`\`\n${miniBrief}`,
        components: []
      });
    } catch (e) {
      console.error('map view select error:', e);
      try { await interaction.update({ content: 'Error setting map view.', components: [] }); } catch {}
    }
  }
};
