// src/commanderName/titles/titleDefinitions.js
// Title tier definitions for commander archetypes, based on the implementation guide.

const TITLE_TIERS = {
  tier1: {
    requirement: 1, // battles
    titles: {
      glory: {
        engineer: 'the Builder',
        mountain: 'the Climber',
        ghost: 'the Silent',
        mirage: 'the Swift',
        hero: 'the Brave',
        wall: 'the Defender',
        wind: 'the Rider',
        threshold: 'the Guardian',
        serpent: 'the Guerrilla',
        storm: 'the Commander'
      },
      survival: {
        engineer: 'the Trapper',
        mountain: 'the Lurker',
        ghost: 'the Shadow',
        mirage: 'the Harrier',
        hero: 'the Relentless',
        wall: 'the Patient',
        wind: 'the Endless',
        threshold: 'the Grinder',
        serpent: 'the Drowner',
        storm: 'the Ruthless'
      }
    }
  }
  // Additional tiers (3, 10, 30 battles) can be added here following the same pattern.
};

module.exports = { TITLE_TIERS };
