# CMB-007: Chaos Display in Combat Results (BACKLOG)

**Status**: Moved to Backlog  
**Priority**: Low  
**Complexity**: Medium

## Overview
Originally planned to add chaos and preparation data to the current combat result displays, but moved to backlog based on user feedback that it would be too much information for current UI.

## Future Implementation Plan

### When to Implement
- After public battle logs are implemented
- When separate channel for detailed battle information is available
- Low priority until players request more detailed combat information

### Proposed Approach
1. **Public Battle Logs Channel**
   - Create dedicated channel for detailed battle analysis
   - Show chaos levels and how preparation impacted outcomes  
   - Plain text format for readability
   - Include turn-by-turn chaos progression

2. **Integration Points**
   - Connect with battle engine combat resolution
   - Extract chaos calculations from chaosCalculator.js
   - Extract preparation data from preparationCalculator.js
   - Format for public consumption

### Example Output Format
```
=== Battle Analysis: Roman Legion vs Celtic Warriors ===
Turn 1: Chaos Level 3 (Dense terrain +1, Weather +0, Formation disruption +2)
- Roman preparation: 5 (Professional training +4, Line formation +1)
- Celtic preparation: 2 (Tribal training +1, Loose formation +1)
- Effective chaos: Romans 0, Celts 1

Turn 2: Chaos Level 2 (Improved coordination)
...
```

## Dependencies
- Public battle logs system
- Separate combat information channel
- Player demand for detailed combat analysis

## Notes
- User specifically requested this be deprioritized
- Focus should remain on core balance and functionality
- Consider player feedback before implementing