// src/harness/army-study/candidates.js
//
// Candidate usual armies for the re-pick (usual.js repick): a few lists
// per faction, each true to its people (docs/Context/final_20_cultures_complete.txt)
// and to the restrictions the usual armies keep (docs/DECISIONS.md, the
// twenty factions). Each kit is { quality, weapon, armor, shield, mounted }.
//
// This is the last round's set (docs/design/army-balance.md, part 5: after
// armour was priced by weight and given its wind); the first round's (after
// Recommendation A) is in the history of this file.

const k = (quality, weapon, armor = 'no_armor', shield = 'no_shield', mounted = false) => ({ quality, weapon, armor, shield, mounted })
const L = 'light_armor', M = 'medium_armor', H = 'heavy_armor'
const ls = 'light_shield', ms = 'medium_shield', hs = 'heavy_shield'
const tribe = 'tribal_warriors'

module.exports = {
  germania: [
    { label: 'warriors, axemen, spearmen', kits: [k(tribe, 'spear_basic', L, ms), k(tribe, 'battle_axe', L, ls), k(tribe, 'germanic_framea', L)] },
    { label: 'warriors, axemen, spearmen, levy slingers', kits: [k(tribe, 'spear_basic', L, ms), k(tribe, 'battle_axe', L, ls), k(tribe, 'germanic_framea', L), k('levy', 'sling')] },
    { label: '2 warriors, axemen, levy slingers', kits: [k(tribe, 'spear_basic', L, ms), k(tribe, 'spear_basic', L, ms), k(tribe, 'battle_axe', L, ls), k('levy', 'sling')] }
  ],
  parthia: [
    { label: 'horse archers, light horse, levy spears', kits: [k('professional', 'parthian_horse_bow', L, 'no_shield', true), k('militia', 'self_bow_basic', L, 'no_shield', true), k('levy', 'spear_basic', L, ms)] },
    { label: 'horse archers, levy horse archers, 2 levy spears', kits: [k('professional', 'parthian_horse_bow', L, 'no_shield', true), k('levy', 'self_bow_basic', L, 'no_shield', true), k('levy', 'spear_basic', L, ms), k('levy', 'spear_basic', L, ms)] },
    { label: 'horse archers, light horse, 2 levy spears (light shield)', kits: [k('professional', 'parthian_horse_bow', L, 'no_shield', true), k('militia', 'self_bow_basic', L, 'no_shield', true), k('levy', 'spear_basic', L, ls), k('levy', 'spear_basic', L, ls)] }
  ],
  yayoi: [
    { label: 'spearmen, archers, clansmen (light)', kits: [k('militia', 'spear_professional', L, ms), k('militia', 'self_bow_basic', L, ls), k('professional', 'spear_professional', L, ms)] },
    { label: 'spearmen (basic), archers, clansmen', kits: [k('militia', 'spear_basic', L, ms), k('militia', 'self_bow_basic', L, ls), k('professional', 'spear_professional', M, ms)] },
    { label: 'spearmen, levy archers, clansmen', kits: [k('militia', 'spear_professional', L, ms), k('levy', 'self_bow_basic', L), k('professional', 'spear_professional', M, ms)] }
  ],
  kush: [
    { label: '2 spearmen (medium), slingers', kits: [k('professional', 'spear_professional', M, ms), k('professional', 'spear_professional', M, ms), k('levy', 'sling')] },
    { label: 'spearmen (medium), 2 militia spears', kits: [k('professional', 'spear_professional', M, ms), k('militia', 'spear_professional', L, ms), k('militia', 'spear_professional', L, ms)] },
    { label: '2 spearmen, riders', kits: [k('professional', 'spear_professional', L, ms), k('professional', 'spear_professional', L, ms), k('militia', 'sword_standard', L, ls, true)] },
    { label: '3 spearmen (light shield)', kits: [k('professional', 'spear_professional', L, ls), k('professional', 'spear_professional', L, ls), k('professional', 'spear_professional', L, ls)] },
    { label: '2 spearmen (medium), militia spears', kits: [k('professional', 'spear_professional', M, ms), k('professional', 'spear_professional', M, ms), k('militia', 'spear_basic', L, ls)] }
  ],
  samnium: [
    { label: 'veterans (medium), swordsmen, levy archers', kits: [k('professional', 'roman_gladius', M, hs), k('militia', 'roman_gladius', L, hs), k('levy', 'self_bow_basic', L)] },
    { label: '2 veterans, levy archers', kits: [k('professional', 'roman_gladius', L, hs), k('professional', 'roman_gladius', L, hs), k('levy', 'self_bow_basic', L)] },
    { label: 'veterans (medium), swordsmen', kits: [k('professional', 'roman_gladius', M, hs), k('militia', 'roman_gladius', L, hs)] },
    { label: 'veterans, swordsmen (medium shield), slingers', kits: [k('professional', 'roman_gladius', L, hs), k('militia', 'roman_gladius', L, ms), k('levy', 'sling')] }
  ],
  bactria: [
    { label: 'cataphracts (medium), slingers, archers, levy spears', kits: [k('militia', 'persian_kontos', M, 'no_shield', true), k('levy', 'sling', L, ls), k('militia', 'self_bow_basic', L), k('levy', 'spear_basic', L, ls)] },
    { label: 'professional cataphracts, slingers, levy spears', kits: [k('professional', 'persian_kontos', H, 'no_shield', true), k('levy', 'sling', L, ls), k('levy', 'spear_basic', L, ls)] },
    { label: 'cataphracts, 2 levy spears, archers', kits: [k('militia', 'persian_kontos', H, 'no_shield', true), k('levy', 'spear_basic', L, ls), k('levy', 'spear_basic', L, ls), k('militia', 'self_bow_basic', L)] }
  ],
  carthage: [
    { label: 'numidians, gauls, slingers, iberians (professional)', kits: [k('militia', 'sword_standard', L, ls, true), k('militia', 'sword_standard', L, ms), k('levy', 'sling'), k('professional', 'sword_standard', L, ls)] },
    { label: 'numidians, gauls (medium), slingers, iberians', kits: [k('militia', 'sword_standard', L, ls, true), k('militia', 'sword_standard', M, ms), k('levy', 'sling'), k('militia', 'sword_standard', L, ls)] },
    { label: 'numidians, gauls, iberians, libyan spears', kits: [k('militia', 'sword_standard', L, ls, true), k('militia', 'sword_standard', L, ms), k('militia', 'sword_standard', L, ls), k('militia', 'spear_basic', L, ms)] }
  ],
  maurya: [
    { label: 'bowmen, horsemen, levies, militia spears', kits: [k('professional', 'self_bow_professional', L), k('militia', 'sword_standard', L, ls, true), k('levy', 'spear_basic', L, ms), k('militia', 'spear_basic', L, ms)] },
    { label: 'militia bowmen, horsemen, 2 levies, levy', kits: [k('militia', 'self_bow_basic', L), k('militia', 'sword_standard', L, ls, true), k('levy', 'spear_basic', L, ms), k('levy', 'spear_basic', L, ms), k('levy', 'spear_basic', L, ls)] },
    { label: 'bowmen, 2 militia spears, levies', kits: [k('professional', 'self_bow_professional', L), k('militia', 'spear_basic', L, ms), k('militia', 'spear_basic', L, ms), k('levy', 'spear_basic', L, ms)] }
  ]
}
