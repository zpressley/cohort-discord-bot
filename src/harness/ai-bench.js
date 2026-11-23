// src/harness/ai-bench.js
//
// How well does a model read orders, how fast, and what does it cost? Runs a
// fixed set of commander's orders, written the way people type, through the
// real order reader against the live Groq API, and checks each result
// against what the engine should receive.
//
//   GROQ_API_KEY=... npm run ai:bench                       the default model
//   GROQ_API_KEY=... npm run ai:bench -- openai/gpt-oss-120b qwen/qwen3.8-27b
//   ... npm run ai:bench -- --verbose                       show every miss
//   ... npm run ai:bench -- --only "bridge|ambush"          only orders with these words
//
// Behind a proxy, also set NODE_USE_ENV_PROXY=1. Costs a fraction of a cent
// per run. Not part of npm test: CI never calls the network.

const { createAiClient } = require('../llm/client')
const { groqTransport, DEFAULT_MODEL } = require('../llm/groq')
const { interpretText } = require('../interpreter/orders')
const { narrateTurn, report } = require('../narrator/turnNarrator')
const { resolveMap } = require('../engine/map/map')
const { createWorld } = require('../engine/world')
const { gridLabel } = require('../engine/map/grid')
const { fromLabel } = require('../engine/map/labels')

const map = resolveMap('crownhill')
const world = createWorld({
  units: [
    { id: 'red_spears', side: 'red', role: 'spearmen', position: 'E7', strength: 100, aliases: ['spears'] },
    { id: 'red_swords', side: 'red', role: 'heavy_infantry', position: 'E8', strength: 100, aliases: ['swords'] },
    { id: 'red_archers', side: 'red', role: 'archers', position: 'D8', strength: 100, aliases: ['archers'], primaryWeapon: 'greek_composite_bow' },
    { id: 'red_horse', side: 'red', role: 'cavalry', mounted: true, position: 'E9', strength: 100, aliases: ['horse'] }
  ]
})
const context = {
  map,
  units: world.units,
  enemies: [
    { id: 'blue_archers', name: 'enemy archers', position: fromLabel('O8'), status: 'visible', seenOnTurn: 2 },
    { id: 'blue_swords', name: 'enemy swords', position: fromLabel('N7'), status: 'visible', seenOnTurn: 2 }
  ]
}

const ALL = ['red_archers', 'red_horse', 'red_spears', 'red_swords']
const sq = (target) => (target ? gridLabel(target, { quarter: false }) : null)
const terrain = (target) => (target ? map.terrainAt(target) : null)

// Each case: what the commander says, and the orders the engine should get.
// An expected order: units, action, and optionally where (a grid square, or
// a test on the target), then, careful, against, letPass, regardless.
// ask: true means a question is the right answer.
const CASES = [
  // Plain orders the grammar reads by itself (no AI call expected).
  { say: 'everyone advance', expect: [{ units: ALL, action: 'advance' }], grammar: true },
  { say: 'Archers to D7-NE', expect: [{ units: ['red_archers'], action: 'move', where: 'D7' }], grammar: true },
  { say: 'spears and swords hold', expect: [{ units: ['red_spears', 'red_swords'], action: 'hold' }], grammar: true },
  { say: 'horse go north', expect: [{ units: ['red_horse'], action: 'move', test: t => t.y < 8 && t.x === 4 }], grammar: true },
  { say: 'swords defend Harrow Bridge', expect: [{ units: ['red_swords'], action: 'defend', test: t => terrain(t) === 'bridge' }], grammar: true },

  // Loose wording.
  { say: 'the spears should hold their ground', expect: [{ units: ['red_spears'], action: 'hold' }] },
  { say: 'have the cavalry scout the woods to the west', expect: [{ units: ['red_horse'], action: 'check', test: t => terrain(t) === 'forest' && t.x < 4 }] },
  { say: 'I want my archers hidden in the trees', expect: [{ units: ['red_archers'], action: 'hide', test: t => terrain(t) === 'forest' }] },
  { say: 'Get the swordsmen onto the bridge and make them hold it', expect: [{ units: ['red_swords'], action: 'defend', test: t => terrain(t) === 'bridge' }] },
  { say: 'pull everybody back', expect: [{ units: ALL, action: 'withdraw' }] },
  { say: 'cavalry, ride for the north ford', expect: [{ units: ['red_horse'], action: 'move', test: t => terrain(t) === 'ford' && t.y < 10 }] },
  { say: 'Spears take the crownhill', expect: [{ units: ['red_spears'], action: ['attack', 'move', 'defend'], test: t => terrain(t) === 'hill' && t.y < 6 }] },
  { say: 'march the infantry up to C2 nice and slow', expect: [{ units: ['red_spears', 'red_swords'], action: 'move', where: 'C2', careful: true }], either: [{ units: ['red_swords'], action: 'move', where: 'C2', careful: true }] },
  { say: 'everyone forward!', expect: [{ units: ALL, action: 'advance' }] },
  { say: 'archers stay where you are', expect: [{ units: ['red_archers'], action: 'hold' }] },
  { say: 'the horse will wait behind in reserve', expect: [{ units: ['red_horse'], action: 'hold' }] },

  { say: 'the heavy infantry advance', expect: [{ units: ['red_swords'], action: 'advance' }] },
  { say: 'Have the swords march carefully up the road toward Harrow Bridge and hold there', expect: [{ units: ['red_swords'], action: ['defend', 'move'], test: t => terrain(t) === 'bridge', careful: true }] },
  { say: 'archers go and stand with the horse', expect: [{ units: ['red_archers'], action: 'move', where: 'B3' }] },
  // Orders with depth: a chain, and one condition.
  { say: 'spears to C4, then on to the bridge', expect: [{ units: ['red_spears'], action: 'move', where: 'C4', steps: 1 }], grammar: true },
  { say: 'spears to North Ford, if their horse is there, hold', expect: [{ units: ['red_spears'], action: 'move', test: t => terrain(t) === 'ford', when: 'sees' }], grammar: true },
  { say: 'First get the swords over to C4 and after that have them push on to the bridge and dig in there', expect: [{ units: ['red_swords'], action: 'move', where: 'C4', steps: 1 }] },
  { say: 'I want the horse to stay put, but if the spears break, pull the horse back', expect: [{ units: ['red_horse'], action: 'hold', when: 'breaks' }] },
  { say: 'Archers, hold your ground. If anyone attacks you, get back to the bridge.', expect: [{ units: ['red_archers'], action: 'hold', when: 'attacked' }] },
  { say: 'Send the spears up to the north ford unless enemy cavalry is sitting on it, in which case they should stop and hold', expect: [{ units: ['red_spears'], action: 'move', test: t => terrain(t) === 'ford', when: 'sees' }] },

  // Several orders in one breath.
  {
    say: 'Send the spears to the bridge, hide the archers in the woods, and keep the horse back.',
    expect: [
      { units: ['red_spears'], action: ['move', 'defend'], test: t => terrain(t) === 'bridge' },
      { units: ['red_archers'], action: 'hide', test: t => terrain(t) === 'forest' },
      { units: ['red_horse'], action: 'hold' }
    ]
  },
  {
    say: 'spears and swords advance carefully while the archers hold',
    expect: [
      { units: ['red_spears', 'red_swords'], action: 'advance', careful: true },
      { units: ['red_archers'], action: 'hold' }
    ]
  },
  {
    say: 'Swords to C3, spears to C4. Everyone else stays put.',
    expect: [
      { units: ['red_swords'], action: 'move', where: 'C3' },
      { units: ['red_spears'], action: 'move', where: 'C4' },
      { units: ['red_archers', 'red_horse'], action: 'hold' }
    ]
  },

  // Ambushes, with their terms.
  // Missile troops.
  { say: 'archers shoot the horse', expect: [{ units: ['red_archers'], action: 'hold', against: 'cavalry' }], grammar: true },
  { say: 'archers hold fire', expect: [{ units: ['red_archers'], action: 'hold' }], grammar: true },
  { say: 'Have the archers loose at their cavalry while the spears stand fast', expect: [{ units: ['red_archers'], action: 'hold', against: 'cavalry' }, { units: ['red_spears'], action: 'hold' }] },
  { say: 'spears, lie in wait in the woods and hit their cavalry when it comes past', expect: [{ units: ['red_spears'], action: 'ambush', test: t => terrain(t) === 'forest', against: 'cavalry', regardless: false, letPass: 0 }] },
  { say: 'Swords set an ambush in the trees. Let the first two go by, then strike no matter what.', expect: [{ units: ['red_swords'], action: 'ambush', test: t => terrain(t) === 'forest', letPass: 2, regardless: true }] },
  { say: 'archers hide in the woods and jump any bowmen that pass', expect: [{ units: ['red_archers'], action: 'ambush', test: t => terrain(t) === 'forest', against: 'archers' }] },
  { say: 'spring the trap!', expect: [{ units: ALL, action: 'advance' }], grammar: true },

  // Enemies as targets, directions, distances.
  { say: 'horse, charge the enemy archers', expect: [{ units: ['red_horse'], action: ['attack', 'advance'], where: [null, 'D2'] }] },
  { say: 'swords attack their swordsmen', expect: [{ units: ['red_swords'], action: ['attack', 'advance'], where: [null, 'D2'] }] },
  { say: 'archers fall back 100 metres to the west', expect: [{ units: ['red_archers'], action: ['withdraw', 'move'], test: t => t.x < 3 }] },
  { say: 'move the spears a little to the south', expect: [{ units: ['red_spears'], action: 'move', test: t => t.y > 6 && t.y <= 12 && Math.abs(t.x - 4) <= 1 }] },
  { say: 'horse go east about 300m', expect: [{ units: ['red_horse'], action: 'move', test: t => t.x >= 14 && t.x <= 18 }] },

  // Typos and shorthand.
  { say: 'archrs hide in teh woods', expect: [{ units: ['red_archers'], action: 'hide', test: t => terrain(t) === 'forest' }] },
  { say: 'all hold', expect: [{ units: ALL, action: 'hold' }] },
  { say: 'cav to harrow brdge', expect: [{ units: ['red_horse'], action: 'move', test: t => terrain(t) === 'bridge' }] },

  // Things to ask about, not guess.
  { say: 'send them over there', ask: true },
  { say: 'the elephants charge', ask: true },
  { say: 'archers shoot at the enemy swords', expect: [{ units: ['red_archers'], action: 'hold', against: 'swords' }], grammar: true },
  { say: 'spears to the ridge', ask: true },
  { say: 'what should I do?', ask: true },

  // Surrender.
  { say: 'It is over. We yield.', surrender: true },

  // Must not be read as an order to everyone.
  { say: 'tell the spears good luck', ask: true, orAllowEmpty: true }
]

function matches(order, want) {
  const actions = Array.isArray(want.action) ? want.action : [want.action]
  // To the engine, "go there, then hold" is defend.
  const did = order.action === 'move' && order.then === 'hold' ? 'defend' : order.action
  if (!actions.includes(order.action) && !actions.includes(did)) return false
  if (want.where !== undefined) {
    const squares = Array.isArray(want.where) ? want.where : [want.where]
    if (!squares.includes(sq(order.target))) return false
  }
  if (want.test && !(order.target && want.test(order.target))) return false
  if (want.careful !== undefined && Boolean(order.careful) !== want.careful) return false
  if (want.against !== undefined && (order.against ?? null) !== want.against) return false
  if (want.letPass !== undefined && (order.letPass ?? 0) !== want.letPass) return false
  if (want.regardless !== undefined && Boolean(order.regardless) !== want.regardless) return false
  if (want.steps !== undefined && (order.steps?.length ?? 0) !== want.steps) return false
  if (want.when !== undefined && order.when?.type !== want.when) return false
  return true
}

function judge(testCase, read) {
  if (testCase.surrender) return read.surrender ? null : 'did not surrender'
  if (testCase.ask) {
    if (read.orders.length > 0) return `gave orders (${read.orders.map(o => `${o.unitRef}:${o.action}`).join(', ')}) where a question was right`
    if (read.questions.length === 0 && !testCase.orAllowEmpty) return 'neither orders nor a question'
    return null
  }
  if (read.surrender) return 'surrendered'
  const check = (expected) => {
    const wanted = expected.flatMap(w => w.units.map(unit => ({ unit, want: w })))
    if (testCase.note && read.notes.length === 0) return 'no note about the part left out'
    if (read.questions.length > 0) return `asked a question that would stop the orders: ${read.questions[0]}`
    if (read.orders.length !== wanted.length) return `${read.orders.length} orders, expected ${wanted.length}` + (read.questions.length ? ` (asked: ${read.questions[0]})` : '')
    for (const { unit, want } of wanted) {
      const order = read.orders.find(o => o.unitRef === unit)
      if (!order) return `no order for ${unit}`
      if (!matches(order, want)) return `${unit}: got ${order.action}${order.target ? ' ' + gridLabel(order.target, { quarter: true }) : ''}${order.careful ? ' careful' : ''}${order.against ? ' vs ' + order.against : ''}${order.letPass ? ' pass ' + order.letPass : ''}${order.regardless ? ' regardless' : ''}`
    }
    return null
  }
  const miss = check(testCase.expect)
  if (miss && testCase.either) return check(testCase.either)
  return miss
}

// A turn to narrate: the facts are fixed, the check is that nothing is
// invented and nothing hidden is named.
const NARRATION = {
  map, side: 'red', culture: 'Roman Republic',
  nameOf: (text) => text.replace(/red_(\w+)/g, (_, n) => n.charAt(0).toUpperCase() + n.slice(1)).replace(/blue_(\w+)/g, 'enemy $1'),
  ownIds: new Set(['red_spears', 'red_swords', 'red_archers', 'red_horse']),
  seenEnemyIds: new Set(['blue_swords']),
  plain: '(plain)',
  events: [
    { type: 'move', turn: 3, unitId: 'red_spears', from: fromLabel('E7'), to: fromLabel('H7'), reachedTarget: false, blockedBy: null },
    { type: 'move', turn: 3, unitId: 'blue_scouts', from: fromLabel('AE5'), to: fromLabel('AE8'), reachedTarget: false, blockedBy: null },
    { type: 'contact', turn: 3, aId: 'blue_swords', bId: 'red_spears' },
    { type: 'surprise', turn: 3, unitId: 'red_swords', by: 'blue_lurkers', posture: 'marching' },
    { type: 'rout', turn: 3, unitId: 'red_archers', by: 'blue_swords' },
    { type: 'hidden', turn: 3, unitId: 'red_horse', at: fromLabel('B4'), cover: 'woods' }
  ]
}
function judgeNarration(text) {
  const problems = []
  if (/blue_|red_|lurkers|scouts/i.test(text)) problems.push('named a unit the side never saw, or used a raw id')
  // Grid squares and numbers are welcome, but only the ones in the facts.
  const facts = report(NARRATION).join(' ')
  for (const square of text.match(/\b[A-J]\d{1,2}-(?:NW|NE|SW|SE)\b/g) ?? []) if (!facts.includes(square)) problems.push(`invented the square ${square}`)
  for (const n of text.replace(/\b[A-J]\d{1,2}-(?:NW|NE|SW|SE)\b/g, '').match(/\b\d+\b/g) ?? []) if (!new RegExp(`\\b${n}\\b`).test(facts)) problems.push(`a number not in the facts: ${n}`)
  if (!/^[^.]*(archers|caught|unseen)/i.test(text)) problems.push('did not open with the rout or the surprise')
  if (!/archers/i.test(text)) problems.push('left out the rout of the archers')
  const sentences = text.split(/[.!?]+\s/).filter(s => s.trim()).length
  if (sentences > 7) problems.push(`${sentences} sentences`)
  if (/\b(should|recommend|advise|suggest)\b/i.test(text)) problems.push('gave advice')
  return problems
}

async function benchModel(model, verbose) {
  const log = []
  // Patient with rate limits (the free tier allows a few thousand tokens a
  // minute): a benchmark may wait where a game would fall back.
  const ai = createAiClient({ transport: groqTransport({ model }), costSink: r => log.push(r), retries: 1, maxRateWaitMs: 70000, timeoutMs: 30000 })
  let passed = 0
  let grammarOnly = 0
  const misses = []
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].toLowerCase() : null
  const cases = only ? CASES.filter(c => only.split('|').some(part => c.say.toLowerCase().includes(part))) : CASES
  for (const testCase of cases) {
    const before = log.length
    const read = await interpretText(testCase.say, context, { ai })
    const usedAi = log.length > before
    if (!usedAi) grammarOnly++
    const miss = judge(testCase, read) ?? (testCase.grammar && usedAi ? 'used the AI for a line the grammar should read' : null)
    if (miss) misses.push(`  ✗ "${testCase.say}": ${miss}`)
    else passed++
  }
  const told = await narrateTurn(ai, NARRATION)
  const narrationProblems = told.source === 'ai' ? judgeNarration(told.text) : ['the narrator did not answer']

  const calls = log.filter(r => r.ok)
  const reads = calls.filter(r => r.purpose === 'read-orders')
  const sum = (rows, key) => rows.reduce((n, r) => n + (r[key] ?? 0), 0)
  const sorted = reads.map(r => r.ms).sort((a, b) => a - b)
  const perRead = sum(reads, 'estimatedUsd') / Math.max(1, reads.length)
  console.log(`\n${model}`)
  const failed = log.filter(r => !r.ok)
  console.log(`  orders read right: ${passed} of ${cases.length}  (${grammarOnly} by the grammar alone, ${reads.length} AI calls, ` +
    `${failed.filter(r => /^429/.test(r.error)).length} rate-limit waits, ${failed.filter(r => !/^429/.test(r.error)).length} failed calls)`)
  console.log(`  per AI read: ${Math.round(sum(reads, 'inputTokens') / Math.max(1, reads.length))} tokens in, ${Math.round(sum(reads, 'outputTokens') / Math.max(1, reads.length))} out, ` +
    `median ${sorted[Math.floor(sorted.length / 2)] ?? '-'} ms, slowest ${sorted.at(-1) ?? '-'} ms, about $${perRead.toFixed(6)} each ($${(perRead * 1000).toFixed(2)} per 1,000)`)
  const narr = calls.find(r => r.purpose === 'narrate-turn')
  console.log(`  narration: ${narrationProblems.length ? narrationProblems.join('; ') : 'clean'}` + (narr ? ` (${narr.ms} ms, about $${(narr.estimatedUsd ?? 0).toFixed(6)})` : ''))
  if (verbose || narrationProblems.length) console.log(`    "${told.text}"`)
  if (verbose) for (const miss of misses) console.log(miss)
  return { model, passed, total: CASES.length }
}

async function main() {
  const args = process.argv.slice(2)
  const verbose = args.includes('--verbose')
  const skip = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
  const models = args.filter(a => !a.startsWith('--') && a !== skip)
  if (!process.env.GROQ_API_KEY) {
    console.log('Set GROQ_API_KEY to run the benchmark (and NODE_USE_ENV_PROXY=1 behind a proxy).')
    process.exitCode = 1
    return
  }
  for (const model of models.length ? models : [DEFAULT_MODEL]) await benchModel(model, verbose)
}

if (require.main === module) main()

module.exports = { CASES, judge, judgeNarration, context }
