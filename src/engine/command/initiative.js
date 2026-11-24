// src/engine/command/initiative.js
//
// An officer who acts on his Commander's intent when no word can reach him
// (docs/design/point-of-view-and-messengers.md, "What comes after":
// "Officers who act on their Commander's intent when out of contact
// (veterans and above)"). The design he works from, in Zach's words
// (docs/design/officers-memory-delegation.md): a veteran "fills gaps the
// way you would"; "Personality sets the default (an aggressive officer
// attacks, a cautious one fortifies), loyalty decides how hard he honors
// your intent, and experience decides how well he reads it"; and "once a
// long march starts, the officer is the one who reacts to what he finds".
// Ruled out: an officer near whom orders arrive at once (2026-11-23: "The
// second perk is too powerful").
//
// Who: an officer of veteran grade or above (INITIATIVE.FROM), not
// disaffected, of a side whose Commander is on the field and free, whose
// unit no rider can get through to and has not for INITIATIVE.WAIT ten
// minutes. Below veteran, and anyone in touch, does as before: carries on
// with his order, or loses the thread as officers.js has it. The computer's
// side has no Commander on the field and no initiative.
//
// When: things have plainly changed, as his own unit sees them and set
// against what he was last told (battle.js gathers it):
//   groundLost    the enemy has taken ground to fight for since he last
//                 had word, and he can see them on it
//   friendsBroke  men of his own side in his sight have broken since he
//                 last had word, half or more of those he can see
//   quarryGone    the enemy he was sent at is beaten or gone
//   attacked      he is fought or shot at
//   done          his order is done (or he had none) and an enemy is in
//                 his sight
//
// What: one of four things, each an order that already exists (battle.js
// makes it): 'advance' (press the enemy), 'ground' (attack toward the
// ground), 'hold' (stand where he is), 'fall back' (withdraw toward where
// his Commander was when he last had word). Or nothing: he carries on.
// His nature leans it, as when he loses the thread:
//   bold      goes for the ground being lost; else at the enemy he can see
//   cautious  holds good ground (INITIATIVE.GOOD_GROUND); else falls back
//             toward his Commander
//   steady    finishes what he was sent to do; when it is done or cannot
//             be done, holds
// What he holds dear may tip it: one who looks to his men (survival) falls
// back to save them when half are lost (INITIATIVE.BLED) or the men about
// him have broken. A loyal officer reads his Commander's intent as a
// steady one does (as with losing the thread: they "follow orders without
// question"). An order to stand (hold, defend, hide, ambush) is his intent
// too: being attacked, or seeing the enemy, does not move him off it.
//
// Pure, and with no roll: the same battle state gives the same choice, so a
// saved battle replays it. battle.js logs it ('initiative'), and his
// Commander hears of it when a rider gets through, in the officer's report.

const { INITIATIVE, LOYALTY } = require('../combat/tables')
const { GRADES, gradeOf, loyaltyOf } = require('./officers')

const STANDING = ['hold', 'defend', 'hide', 'ambush']
// Which of several changes he answers first.
const WHY = ['groundLost', 'friendsBroke', 'quarryGone', 'attacked', 'done']

/** Can this officer act on his own when cut off? Veterans and above, not disaffected. */
function actsAlone(officer) {
  if (!officer || officer.headless || !officer.personality) return false
  const rank = (name) => GRADES.findIndex(g => g.name === name)
  if (rank(gradeOf(officer)) < rank(INITIATIVE.FROM)) return false
  return loyaltyOf(officer) > LOYALTY.DISLOYAL
}

/**
 * What a veteran officer cut off from his Commander does.
 *
 * @param {Object} officer
 * @param {Object} s  what he knows: { changed: [why...] (WHY), enemyInSight,
 *   goodGround, bled (he has lost INITIATIVE.BLED of his men or more),
 *   intent (the action of the last order he was given, or null),
 *   running (his order is still to be done, and can be) }
 * @returns {{ why, did }|null}  null: he carries on
 */
function initiative(officer, s) {
  if (!actsAlone(officer)) return null
  const why = WHY.find(w => s.changed?.includes(w))
  if (!why) return null
  // One who looks to his men saves them.
  if (officer.values === 'survival' && (s.bled || why === 'friendsBroke')) return { why: s.bled ? 'bled' : why, did: 'fall back' }
  // His Commander told him to stand: he stands, unless the ground or the
  // men about him are being lost.
  if (STANDING.includes(s.intent) && (why === 'attacked' || why === 'done')) return null
  const nature = loyaltyOf(officer) >= LOYALTY.LOYAL ? 'steady' : officer.personality
  if (nature === 'bold') {
    if (why === 'groundLost') return { why, did: 'ground' }
    return { why, did: s.enemyInSight ? 'advance' : 'hold' }
  }
  if (nature === 'cautious') return { why, did: s.goodGround ? 'hold' : 'fall back' }
  // Steady: he finishes what he was sent to do, then holds.
  if (s.running && why !== 'quarryGone') return null
  return { why, did: 'hold' }
}

module.exports = { actsAlone, initiative, WHY }
