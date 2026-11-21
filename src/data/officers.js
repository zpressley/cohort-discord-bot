// src/data/officers.js
//
// Names for the officers who carry the Commander's orders, by culture.
// Placeholders until each faction has its own roll of names; a culture not
// listed draws from the plain list.

const NAMES = {
  'Roman Republic': ['Marcus', 'Quintus', 'Titus', 'Gaius', 'Lucius', 'Decimus', 'Publius', 'Aulus', 'Sextus', 'Servius', 'Gnaeus', 'Manius'],
  'Celtic Tribes': ['Brennus', 'Cadeyrn', 'Drustan', 'Vercas', 'Tasgetios', 'Ambiorix', 'Eporedos', 'Catuvol', 'Luernios', 'Segovax', 'Bellovesos', 'Orgetos'],
  'Germanic Tribes': ['Arminius', 'Segimer', 'Gundahar', 'Wulfhere', 'Hrodgar', 'Ansgar', 'Baldric', 'Ermanar', 'Theudric', 'Hariwald', 'Sigiwin', 'Adalwulf'],
  'Macedonian Kingdoms': ['Perdiccas', 'Krateros', 'Nikanor', 'Amyntas', 'Leonnatos', 'Polyperchon', 'Attalos', 'Meleagros', 'Philotas', 'Koinos', 'Seleukos', 'Antigenes'],
  'Spartan City-State': ['Leonidas', 'Brasidas', 'Agis', 'Pausanias', 'Kleomenes', 'Lysandros', 'Archidamos', 'Eurybiades', 'Dienekes', 'Gylippos', 'Anaxandros', 'Polydoros'],
  'Parthian Empire': ['Surena', 'Pakoros', 'Vardanes', 'Mithradat', 'Artabanos', 'Phraates', 'Orodes', 'Gotarzes', 'Sinatrukes', 'Tiridat', 'Vologases', 'Arsakes'],
  'Achaemenid Persian': ['Artabazos', 'Hydarnes', 'Mardonios', 'Datis', 'Megabyzos', 'Otanes', 'Bagaios', 'Artaphernes', 'Tigranes', 'Masistes', 'Pharnakes', 'Ariomardos']
}

const PLAIN = ['Aldric', 'Bram', 'Corin', 'Davin', 'Edric', 'Faron', 'Garrick', 'Hale', 'Ivor', 'Joren', 'Kellan', 'Loric', 'Maddox', 'Niall', 'Osric', 'Perrin']

module.exports = { NAMES, PLAIN }
