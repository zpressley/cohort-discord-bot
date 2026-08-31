// src/phase3-movement/unitResolver.js
//
// Multi-unit addressing: turn "the archers", "everyone", "cavalry to the ford"
// into the units an order applies to.
//
// The roadmap (Phase 3): "Intent parser extended: multi-unit addressing ('the
// archers', 'everyone', unit aliases already exist in unitState)."
//
// The split follows the core pipeline: the AI edge (phase 1's Groq parser)
// turns prose into intent, and the ENGINE resolves which units intent means —
// deterministically, so the harness can test it and a battle can be replayed.
// This is the engine half. Extending the AI prompt to emit a `unitRef` field
// is deliberately left for the Discord/AI hardening phase (roadmap Phase 7),
// because prompt work cannot be regression-tested headless. The contract is:
// whatever the AI emits ends up as a string this resolver can handle.
//
// Resolution order (first hit wins):
//   1. everyone/all      -> every living unit on the side
//   2. exact unit id
//   3. exact alias        (word-for-word, case-insensitive)
//   4. role match         ("archers" matches role 'archers'; plural/singular)
//   5. role-word match    (any word of the reference matches a role word)
//
// A reference matching several units of the same role returns them ALL — "the
// archers, to the ridge" addressing two archer units is an order to both.
// A reference matching nothing, or matching units only on the enemy side,
// returns an empty match with a reason: the caller decides whether that is a
// clarifying question (interactive) or a skipped order (headless).

function normalize(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9\s_]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Strip a leading article so "the archers" and "archers" resolve alike.
function stripArticle(text) {
  return text.replace(/^(the|my|our)\s+/, '')
}

const EVERYONE = new Set(['everyone', 'all', 'all units', 'everybody', 'the army', 'army'])

// Words that count as a role match. Singularized crudely — enough for the
// vocabulary the game actually uses; this is not NLP, the AI edge is.
function roleWords(role) {
  const words = normalize(role).split(/[\s_]+/)
  const out = new Set()
  for (const word of words) {
    out.add(word)
    if (word.endsWith('s')) out.add(word.slice(0, -1))
    else out.add(word + 's')
  }
  return out
}

/**
 * @param {string} reference  what the order called the unit(s)
 * @param {Array}  units      living units on the ORDERING side only — the
 *                            caller filters, because "everyone" must never
 *                            address the enemy
 * @returns {{ units: Array, matchedBy: string|null, reason: string|null }}
 */
function resolveUnitReference(reference, units) {
  const ref = stripArticle(normalize(reference))
  if (!ref) return { units: [], matchedBy: null, reason: 'empty reference' }

  if (EVERYONE.has(ref)) {
    return { units: [...units], matchedBy: 'everyone', reason: null }
  }

  const byId = units.filter(u => normalize(u.id) === ref)
  if (byId.length > 0) return { units: byId, matchedBy: 'id', reason: null }

  const byAlias = units.filter(u =>
    (u.aliases ?? []).some(alias => stripArticle(normalize(alias)) === ref))
  if (byAlias.length > 0) return { units: byAlias, matchedBy: 'alias', reason: null }

  const byRole = units.filter(u => {
    const words = roleWords(u.role ?? '')
    return words.has(ref) || ref.split(' ').some(w => words.has(w))
  })
  if (byRole.length > 0) return { units: byRole, matchedBy: 'role', reason: null }

  return { units: [], matchedBy: null, reason: `nothing answers to "${reference}"` }
}

/**
 * Expand side-addressed orders into per-unit orders for the movement resolver.
 *
 * @param {Array} sideOrders  [{ unitRef, target }] as the interpreter emits
 * @param {Array} sideUnits   living units on that side
 * @returns {{ orders: Array, unresolved: Array }}
 *   orders: [{ unitId, target }], one per matched unit, deduplicated — when
 *   two references match the same unit, the LAST order wins (a later order
 *   countermands an earlier one, which is how orders work).
 */
function expandOrders(sideOrders, sideUnits) {
  const byUnit = new Map()
  const unresolved = []

  for (const order of sideOrders) {
    const match = resolveUnitReference(order.unitRef ?? order.unitId, sideUnits)
    if (match.units.length === 0) {
      unresolved.push({ ...order, reason: match.reason })
      continue
    }
    for (const unit of match.units) {
      byUnit.set(unit.id, { unitId: unit.id, target: order.target })
    }
  }

  return {
    orders: [...byUnit.values()].sort((a, b) => a.unitId.localeCompare(b.unitId)),
    unresolved
  }
}

module.exports = { resolveUnitReference, expandOrders }
