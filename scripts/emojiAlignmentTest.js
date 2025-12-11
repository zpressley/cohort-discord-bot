// scripts/emojiAlignmentTest.js
// Visual test harness to understand how long runs of emojis affect
// right-border alignment under the current Variant A spacing rules.
//
// Run with:
//   node scripts/emojiAlignmentTest.js
//
// Then copy each box into Discord and note how many "columns" the
// right border appears shifted vs the header (negative = left, positive = right).

const EMOJI_FRIEND = '🔵';
const PLAIN = '.';

// Variant A cell rendering: emoji as-is, ASCII with trailing space
function makeVariantARow(runLength, width = 15) {
  const isEmoji = (ch) => {
    if (!ch) return false;
    const cp = ch.codePointAt(0);
    return cp >= 0x1F300 && cp <= 0x1FAFF;
  };
  const cellStr = (ch) => (isEmoji(ch) ? ch : ch + ' ');

  const cells = new Array(width).fill(PLAIN);
  const start = 3; // start the emoji run a few cells in for realism
  for (let i = 0; i < runLength && start + i < width; i++) {
    cells[start + i] = EMOJI_FRIEND;
  }

  return cells.map(cellStr).join('');
}

function printBox(label, rowBuilder) {
  const w = 15;
  console.log(`\n=== ${label} ===`);

  // top header
  const letters = 'ABCDEFGHIJKLMNO'.split('');
  console.log('   ' + letters.slice(0, w).join(' '));

  const topBorder = '  ┌' + '─'.repeat(w * 2) + '┐';
  console.log(topBorder);

  const rowNum = 10; // arbitrary
  const rowLabel = String(rowNum).padStart(2, ' ');
  console.log(`${rowLabel}│` + rowBuilder() + '│');

  const bottomBorder = '  └' + '─'.repeat(w * 2) + '┘';
  console.log(bottomBorder);
}

// Sweep different run lengths of emojis so we can empirically calibrate
// how much the border drifts for N emojis in a row under Variant A.
[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((run) => {
  printBox(`Variant A, emoji run length = ${run}`, () => makeVariantARow(run));
});

console.log('\nFor each run length above, paste the box into Discord and record how');
console.log('many columns the right border appears offset from true (negative =');
console.log('too far left, positive = too far right). With that table we can');
console.log('derive a compensation function f(runLength) to adjust row width.');
