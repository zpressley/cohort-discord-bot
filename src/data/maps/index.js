// src/data/maps/index.js
// Every authored map, by name. A battle spec names its map here, or carries a
// map definition of its own.

const crownhill = require('./crownhill')
const ashford = require('./ashford')
const thornwood = require('./thornwood')
const ravenridge = require('./ravenridge')

const MAPS = { crownhill, ashford, thornwood, ravenridge }

module.exports = { MAPS }
