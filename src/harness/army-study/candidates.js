// src/harness/army-study/candidates.js
//
// Candidate usual armies for the re-pick (usual.js repick): a few lists
// per faction, each true to its people (docs/Context/final_20_cultures_complete.txt)
// and to the restrictions the usual armies keep (docs/DECISIONS.md, the
// twenty factions). Each kit is { quality, weapon, armor, shield, mounted }.

const k = (quality, weapon, armor = 'no_armor', shield = 'no_shield', mounted = false) => ({ quality, weapon, armor, shield, mounted })

const L = 'light_armor', M = 'medium_armor', H = 'heavy_armor'
const ls = 'light_shield', ms = 'medium_shield', hs = 'heavy_shield'

module.exports = {
  han: [
    { label: 'crossbows, 2 swords', kits: [k('professional', 'han_chinese_crossbow', L), k('militia', 'chinese_dao', L, ls), k('militia', 'chinese_dao', L, ls)] },
    { label: 'crossbows, swords, spears', kits: [k('professional', 'han_chinese_crossbow', L), k('militia', 'chinese_dao', L, ls), k('militia', 'spear_professional', L, ls)] },
    { label: 'crossbows (medium), swords, spears', kits: [k('professional', 'han_chinese_crossbow', M), k('militia', 'chinese_dao', L, ls), k('militia', 'spear_professional', L, ls)] },
    { label: 'crossbows, swords, halberds', kits: [k('professional', 'han_chinese_crossbow', L), k('militia', 'chinese_dao', L, ls), k('professional', 'chinese_chang_dao', M)] },
    { label: '2 crossbows, swords', kits: [k('professional', 'han_chinese_crossbow', L), k('professional', 'han_chinese_crossbow', L), k('militia', 'chinese_dao', L, ls)] },
    { label: 'crossbows, 2 swords (medium)', kits: [k('professional', 'han_chinese_crossbow', L), k('militia', 'chinese_dao', M, ls), k('militia', 'chinese_dao', M, ls)] }
  ],
  kush: [
    { label: '2 spearmen (light), riders', kits: [k('professional', 'spear_professional', L, ms), k('professional', 'spear_professional', L, ms), k('militia', 'sword_standard', L, ls, true)] },
    { label: '2 spearmen, militia spears (medium shield)', kits: [k('professional', 'spear_professional', M, ms), k('professional', 'spear_professional', M, ms), k('militia', 'spear_basic', L, ms)] },
    { label: '2 spearmen (heavy shield), slingers', kits: [k('professional', 'spear_professional', M, hs), k('professional', 'spear_professional', M, hs), k('levy', 'sling')] },
    { label: '2 spearmen, levy riders', kits: [k('professional', 'spear_professional', M, ms), k('professional', 'spear_professional', M, ms), k('levy', 'sword_standard', L, ls, true)] },
    { label: 'spearmen, 3 militia spears', kits: [k('professional', 'spear_professional', M, ms), k('militia', 'spear_basic', L, ls), k('militia', 'spear_basic', L, ls), k('militia', 'spear_basic', L, ls)] },
    { label: '3 militia spears (war spear), levy archers', kits: [k('militia', 'spear_professional', L, ms), k('militia', 'spear_professional', L, ms), k('militia', 'spear_professional', L, ms), k('levy', 'self_bow_basic', L)] },
    { label: 'spearmen, 2 militia spears, levy archers', kits: [k('professional', 'spear_professional', M, ms), k('militia', 'spear_professional', L, ls), k('militia', 'spear_professional', L, ls), k('levy', 'self_bow_basic', L)] },
    { label: '2 spearmen, archers', kits: [k('professional', 'spear_professional', M, ms), k('professional', 'spear_professional', M, ms), k('militia', 'self_bow_basic', L)] },
    { label: '2 spearmen, militia spears', kits: [k('professional', 'spear_professional', M, ms), k('professional', 'spear_professional', M, ms), k('militia', 'spear_professional', L, ls)] },
    { label: '2 spearmen (light), slingers, levy spears', kits: [k('professional', 'spear_professional', L, ms), k('professional', 'spear_professional', L, ms), k('levy', 'sling'), k('levy', 'spear_basic', L, ls)] },
    { label: '3 spearmen (light)', kits: [k('professional', 'spear_professional', L, ls), k('professional', 'spear_professional', L, ls), k('professional', 'spear_professional', L, ls)] },
    { label: '2 spearmen, archers, levy spears', kits: [k('professional', 'spear_professional', L, ms), k('professional', 'spear_professional', L, ms), k('militia', 'self_bow_basic', L), k('levy', 'spear_basic', L, ls)] }
  ],
  mongolia: [
    { label: '2 horse archers, 2 riders (light)', kits: [k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true), k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true), k('tribal_warriors', 'sword_standard', L, ls, true), k('tribal_warriors', 'sword_standard', L, ls, true)] },
    { label: '2 horse archers, armoured rider, levy rider', kits: [k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true), k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true), k('tribal_warriors', 'sword_standard', M, ls, true), k('levy', 'sword_standard', L, ls, true)] },
    { label: 'horse archers, 2 armoured mace riders', kits: [k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true), k('tribal_warriors', 'mace', M, ls, true), k('tribal_warriors', 'mace', M, ls, true)] },
    { label: 'horse archers, 3 riders (light)', kits: [k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true), k('tribal_warriors', 'sword_standard', L, ls, true), k('tribal_warriors', 'sword_standard', L, ls, true), k('tribal_warriors', 'sword_standard', L, ls, true)] }
  ],
  sarmatia: [
    { label: '2 horse archers, light rider', kits: [k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true), k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true), k('tribal_warriors', 'sword_standard', L, ls, true)] },
    { label: '3 horse archers', kits: [k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true), k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true), k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true)] },
    { label: 'horse archers, light rider', kits: [k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true), k('tribal_warriors', 'sword_standard', L, ls, true)] },
    { label: 'horse archers, 2 levy riders', kits: [k('tribal_warriors', 'self_bow_basic', L, 'no_shield', true), k('levy', 'sword_standard', L, ls, true), k('levy', 'sword_standard', L, ls, true)] }
  ],
  bactria: [
    { label: 'cataphracts, levy spears, archers', kits: [k('professional', 'persian_kontos', H, 'no_shield', true), k('levy', 'spear_basic', L, ls), k('militia', 'self_bow_basic', L)] },
    { label: 'cataphracts, slingers, levy spears', kits: [k('professional', 'persian_kontos', H, 'no_shield', true), k('levy', 'sling', L, ls), k('levy', 'spear_basic', L, ls)] },
    { label: 'cataphracts, 2 levy spears', kits: [k('professional', 'persian_kontos', H, 'no_shield', true), k('levy', 'spear_basic', L, ls), k('levy', 'spear_basic', L, ls)] },
    { label: 'militia cataphracts, slingers, archers', kits: [k('militia', 'persian_kontos', H, 'no_shield', true), k('levy', 'sling', L, ls), k('militia', 'self_bow_basic', L)] }
  ],
  sparta: [
    { label: 'hoplites, archers', kits: [k('professional', 'spear_professional', M, hs), k('levy', 'self_bow_basic', L)] },
    { label: 'hoplites (medium shield), helots, archers', kits: [k('professional', 'spear_professional', M, ms), k('levy', 'spear_basic', L, ls), k('levy', 'self_bow_basic', L)] },
    { label: 'hoplites (light armour), helots, archers', kits: [k('professional', 'spear_professional', L, hs), k('levy', 'spear_basic', L, ls), k('levy', 'self_bow_basic', L)] },
    { label: 'hoplites, archers, helots', kits: [k('professional', 'spear_professional', M, hs), k('levy', 'self_bow_basic', L), k('levy', 'spear_basic', L, ls)] },
    { label: 'hoplites, 2 helots', kits: [k('professional', 'spear_professional', M, hs), k('levy', 'spear_basic', L, ls), k('levy', 'spear_basic', L, ls)] },
    { label: 'hoplites (light shield), slingers, helots', kits: [k('professional', 'spear_professional', M, ls), k('levy', 'sling'), k('levy', 'spear_basic', L, ls)] },
    { label: 'hoplites, helots', kits: [k('professional', 'spear_professional', M, hs), k('levy', 'spear_basic', L, ls)] }
  ]
}
