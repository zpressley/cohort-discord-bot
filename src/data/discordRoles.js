// src/data/discordRoles.js
//
// The Discord server role for each kind of Commander, by server id. Moved
// from the old bot (archive/src/commanderName/roles/kingdomsRoles), with
// the kind it called `gate` under its name now, `threshold`. Ids are not
// secrets: anyone in the server can see them.
//
// A signed-in player who makes a Commander is given his kind's role in the
// server named by DISCORD_GUILD_ID, if it is listed here and the bot may
// (src/discord/notices.js, giveRole).

module.exports = {
  '1420824208270823476': {
    engineer: '1442241620480098454',
    mountain: '1442242460897251502',
    ghost: '1442242591264473118',
    mirage: '1442242830310576239',
    hero: '1442243151312978002',
    wall: '1442245046400192625',
    wind: '1442245195042259056',
    threshold: '1442245311094325322',
    serpent: '1442245442845806863',
    storm: '1442245597431074888'
  }
}
