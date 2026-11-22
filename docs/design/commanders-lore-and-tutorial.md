# Commanders, the tutorial and the lore

What Zach's earlier design docs say about a new Commander, gathered on
2026-11-22 so the web app can be built toward it. Sources:

- "Cohort: Lore & Progression Framework" (Zach's Google Drive, compiled
  2026-07-20).
- `archive/docs/Context/Old Context/commander_implementation.md` (how a new
  Commander is made; written for the Discord bot).
- "Updated Task List from Resolved Issues", task CMD-003 (the Commander on
  the field, and his capture).

Names follow the ruling of November 21: the **Commander** is the player; the
men who carry his orders are **officers**.

## Ruled by Zach, 2026-11-22

1. **A new player comes in through the tutorial, and the tutorial is the
   lore.** Play is taught by the story, not by a help page.
2. **When your Commander dies you lose everything and start again.**
3. **One Commander at a time.** Relaxed the same day: a player may have
   more than one game going, "but that army can only fight one battle at a
   time".
4. **A new Commander has one veteran officer, for his unique elite unit.**
   "You meet during the tutorial and win over that officer, the rest you
   earn throughout the game."

## What the docs say

**The line every Commander's story follows.** A recruit earns command of a
small elite unit; grows attached to named officers through shared battles;
risks losing them for good; and, for the few who go all the way, challenges
history's greatest commanders for a throne. There is no single plot across
players: each Commander's story is his own.

**The tutorial, five missions.** "Players must care about their officers
before they understand they can lose them."

| Mission | What happens | Risk to officers |
|---|---|---|
| 0. The Proving Ground | A training exercise with plain troops. Teaches orders, formations, movement. Ends with promotion: the elite unit is granted. | None |
| 1. First Blood | An easy fight (about 3 to 1). The player meets his named officers, each with a voice of his own. | None: the enemy runs first |
| 2. The Ambush | Harder. Brings in veterans and captured equipment. Officers speak of Mission 1. | About 5% |
| 3. Earned Respect | Harder still. Officers' ties to each other begin to show. One death is likely: "the first real loss". | The standing 8 to 12% |
| 4. The origin story | A short crisis (4 to 9 rounds), different for each culture, telling how this unit came to be an elite one. Won by leading through the crisis, never by single combat. | Standing |

Origin stories are written or revised for Berber, Han, Carthage, Kush,
Maurya, Silla, Axum and Macedon; the rest are still to write.

**Making a Commander** (the Discord design). Two questions and no typing:
which of ten kinds of commander you are (the Engineer, the Mountain, the
Ghost, the Mirage, the Hero, the Wall, the Wind, the Threshold, the Serpent,
the Storm), and whether you fight for glory or for survival. The game then
gives a name no other Commander has; a name is freed when its Commander is
retired. Titles follow battles fought (1, 3, 10, 30).

**The Commander on the field** (CMD-003). He fights with no unit of his own:
he rides with his elite unit and goes where it goes. He can be taken when
that unit is under a quarter of its strength with the enemy beside it; the
player then chooses to yield or to hold out for rescue.

**The end of the road.** At veteran level 30, the Trials (ten promised, two
more hidden); then the Ten Thrones. In both, defeat is total loss: rebuild
from nothing.

## Where the web app stands against this

| | Now | To match |
|---|---|---|
| Several Commanders, one battle each | Built. A browser keeps its Commanders' private links; the muster asks which one leads, and refuses one whose army is in the field. A cleared browser loses them. | A way to carry a Commander's link to another device. |
| The Commander dies | He is not on the field, so he cannot. | Put him with a unit; decide what kills him (open, below); then end the company and start anew. |
| His officers | One to each unit, from the November design (`officers-memory-delegation.md`). The lore doc has 8 to 12 named officers inside the one elite unit. Taken here as: the November design holds. | |
| A new Commander's officers | Built to the ruling of November 22: one veteran, with the elite unit (the best unit, where a battle has no elite), the rest green. | The veteran is met and won over in the tutorial, not handed over at the first muster. |
| The tutorial | None. Any battle can be mustered at once. | Missions 0 to 4 as scenarios, in order, before the open muster. Needs a risk to officers that a scenario can set (none, 5%, standing). |
| Making a Commander | Nothing is asked. He is given a plain name to tell him from the others. | The two questions and a name from his kind. |

## Open

- What kills a Commander in an ordinary battle, and what capture means for
  him (the same total loss, or something he can come back from).
- Whether the ten kinds of commander and glory or survival still stand for
  the web app, and what they change beyond the name.
