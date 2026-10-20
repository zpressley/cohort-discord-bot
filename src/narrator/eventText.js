// src/narrator/eventText.js
//
// Plain wording for the engine's combat events. The engine returns data;
// this turns it into the terse lines the harness reports and the hotseat CLI
// print. The AI narrator will read the same events and write prose instead.
//
// The exchange line keeps the exact format the resolver used to write itself,
// so saved reports diff cleanly across the change:
//   r2 red_infantry -4 / blue_infantry -3; blue_infantry shoves (+1.2); chaos 3.1/2.4 [charge]

function describeExchange(event) {
  const { a, b, push } = event
  const shove = push.winnerId
    ? `${push.winnerId} shoves (+${push.differential.toFixed(1)})`
    : 'the shove is even'
  const charge = a.chargeImpact || b.chargeImpact ? ' [charge]' : ''

  return (
    `r${event.roundInContact} ${a.unitId} -${a.killed} / ${b.unitId} -${b.killed}; ` +
    `${shove}; chaos ${a.chaos.toFixed(1)}/${b.chaos.toFixed(1)}${charge}`
  )
}

// Any event the combat resolver returns.
function describeCombatEvent(event) {
  switch (event.type) {
    case 'exchange': return describeExchange(event)
    case 'standoff':
      return `${event.aId} and ${event.bId} are both at breaking point — neither breaks, ` +
        'there is nobody to run from'
    case 'rout': return `${event.unitId} breaks and routs from ${event.by}`
    default: return JSON.stringify(event)
  }
}

module.exports = { describeExchange, describeCombatEvent }
