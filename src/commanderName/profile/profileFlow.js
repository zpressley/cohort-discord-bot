// src/commanderName/profile/profileFlow.js
// High-level profile creation flow, abstracted away from Discord specifics.
// This module defines the steps and pure logic; the actual Discord wiring
// (slash commands, DM channels, buttons) should use these helpers.

const nameGenerator = require('../nameGeneration/nameGenerator');

const ARCHETYPE_DATA = {
  engineer: { emoji: '🔨', name: 'THE ENGINEER', description: 'Victory through preparation' },
  mountain: { emoji: '⛰️', name: 'THE MOUNTAIN', description: 'High ground dominance' },
  ghost: { emoji: '👻', name: 'THE GHOST', description: 'Were you even there?' },
  mirage: { emoji: '🌊', name: 'THE MIRAGE', description: 'Strike from the sands' },
  hero: { emoji: '⚔️', name: 'THE HERO', description: 'Lead from the front' },
  wall: { emoji: '🏰', name: 'THE WALL', description: 'Unbreakable defense' },
  wind: { emoji: '💨', name: 'THE WIND', description: 'Swift cavalry mastery' },
  gate: { emoji: '🛡️', name: 'THE GATE', description: 'None shall pass' },
  serpent: { emoji: '🐍', name: 'THE SERPENT', description: 'Guerrilla warfare' },
  storm: { emoji: '⚡', name: 'THE STORM', description: 'Combined arms perfection' }
};

/**
 * This flow is intentionally UI-agnostic. A Discord layer should:
 * - Call beginProfileFlow() to get prompt text + options
 * - Call continueProfileFlow() with user selections
 * - Persist the returned commander profile when complete
 */

function beginProfileFlow() {
  return {
    step: 'choose_archetype',
    archetypes: ARCHETYPE_DATA
  };
}

async function continueProfileFlow(state, input) {
  // state: { step, archetype?, philosophy?, generatedName? }
  switch (state.step) {
    case 'choose_archetype': {
      if (!ARCHETYPE_DATA[input]) {
        throw new Error('Invalid archetype selection');
      }
      return { step: 'choose_philosophy', archetype: input };
    }
    case 'choose_philosophy': {
      if (input !== 'glory' && input !== 'survival') {
        throw new Error('Invalid philosophy selection');
      }
      return { step: 'generate_name', archetype: state.archetype, philosophy: input };
    }
    case 'generate_name': {
      const generatedName = await nameGenerator.generateName(state.archetype, state.philosophy, state.userId || 'unknown');
      return { ...state, step: 'confirm_name', generatedName };
    }
    case 'confirm_name_accept': {
      // Finalize profile
      return {
        complete: true,
        commanderName: state.generatedName,
        archetype: state.archetype,
        philosophy: state.philosophy
      };
    }
    case 'confirm_name_regenerate': {
      // Regenerate name in same archetype/philosophy
      const regenerated = await nameGenerator.generateName(state.archetype, state.philosophy, state.userId || 'unknown');
      return { ...state, step: 'confirm_name', generatedName: regenerated };
    }
    default:
      throw new Error(`Unsupported flow step: ${state.step}`);
  }
}

module.exports = {
  ARCHETYPE_DATA,
  beginProfileFlow,
  continueProfileFlow
};
