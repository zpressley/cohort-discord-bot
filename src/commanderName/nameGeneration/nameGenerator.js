// src/commanderName/nameGeneration/nameGenerator.js
// src/commanderName/nameGeneration/nameGenerator.js
// Thin wrapper around the procedural generators in name_generators.js.
// This is the stable API used by the rest of the app (profile flow,
// future commander onboarding). Internally it delegates to the
// archetype-aware, DB-backed generator.

const proceduralGenerators = require('./name_generators');

class NameGenerator {
  /**
   * Generate a unique commander name for the given archetype + philosophy.
   * This uses the procedural patterns in name_generators.js and enforces
   * global uniqueness via the UsedNames table.
   *
   * @param {string} archetype
   * @param {string} philosophy - 'glory' | 'survival'
   * @param {string} userId - Discord user id (or future Commander id)
   */
  async generateName(archetype, philosophy, userId) {
    return proceduralGenerators.generateUniqueName(archetype, philosophy, userId);
  }
}

module.exports = new NameGenerator();
