// src/engine/map/index.js
// Public surface of the map: build or look up a battlefield, translate labels,
// find its features, and resolve landmark names.

const { createMap, resolveMap, DEFAULT_MAP } = require('./map')
const labels = require('./labels')
const { MOVEMENT_COSTS, IMPASSABLE } = require('./terrain')
const landmarks = require('./landmarkResolver')
const { detectFeatures, featuresAt, KINDS: FEATURE_KINDS } = require('./features')
const { parsePlace, findPlace } = require('./places')

module.exports = {
  createMap,
  resolveMap,
  DEFAULT_MAP,
  ...labels,
  MOVEMENT_COSTS,
  IMPASSABLE,
  resolveLandmark: landmarks.resolve,
  buildLocalContext: landmarks.buildLocalContext,
  listLandmarks: landmarks.listLandmarks,
  detectFeatures,
  featuresAt,
  FEATURE_KINDS,
  parsePlace,
  findPlace
}
