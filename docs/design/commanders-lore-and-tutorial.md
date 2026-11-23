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
5. **A Commander can fall only when his unit is attacked and under a
   threshold of its strength, and then at low odds.** He is killed or taken.
6. **A taken Commander negotiates:** he can bargain units and leave the
   field, or wait, and his units may yet win and force his release. With
   no troops left he has little to bargain with.
7. **New units are completely green,** worse than a green officer, and an
   officer is made after a few battles. Settled further on November 23: a
   unit has no officer at all until it has 3 to 4 battles of veterancy.
8. **The ten kinds and glory or survival** introduce the lore and make the
   name. Every name is unique and lives on in the record books.

9. **The elite unit is the faction's unique unit, and it is free**
   (November 23).
10. **No tutorial until the game is solid** (November 23).

The words of each ruling, and how each was built, are in
`docs/DECISIONS.md` (November 22 and 23).

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
| The Commander dies | Built. He rides with his best unit and can fall when it is cut to half and still struck: taken in about 1 battle in 30, killed in about 1 in 150. Killed, or lost in the enemy's hands with nothing to bargain with, he and his company are ended. | A way to choose the unit he rides with. |
| The Commander taken | Built: no orders while held; freed by a victory or when his captors break; or he gives up a unit and leaves the field; held at a defeat, his best unit left is the price. | Haggling between two players. A Commander for the friend who joins by link. |
| His officers | One to each unit, from the November design (`officers-memory-delegation.md`). The lore doc has 8 to 12 named officers inside the one elite unit. Taken here as: the November design holds. | |
| A new Commander's officers | Built: one veteran, with the elite unit (the best unit, where a battle has no elite). No other unit has an officer until it has come through 3 or 4 battles; a unit that loses its officer must earn another. | The elite unit itself: the faction's unique unit, free with the army. The muster has no factions yet. |
| The tutorial | None, and not to be started until the game is solid (ruled November 23). | Missions 0 to 4 as scenarios, in order, before the open muster. Needs a risk to officers that a scenario can set (none, 5%, standing). |
| Making a Commander | Nothing is asked. He is given a plain name no other Commander on the server has or had. Fallen Commanders are kept. | The two questions and a name from his kind; the record books. |

## Open

- What two players may bargain over when one holds the other's Commander:
  more than one unit, a refusal, anything besides units.
- Whether the Commander may choose the unit he rides with.
- Settled November 23: an officer comes after 3 to 4 battles.
