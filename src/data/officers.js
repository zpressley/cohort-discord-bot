// src/data/officers.js
//
// Names for the officers who carry the Commander's orders, by culture: one
// list for each of the twenty factions' cultures (src/data/factions.js).
// Given names only, as the culture would have used them; no two alike in a
// list. A culture not listed draws from the plain list.

const NAMES = {
  'Roman Republic': ['Marcus', 'Quintus', 'Titus', 'Gaius', 'Lucius', 'Decimus', 'Publius', 'Aulus', 'Sextus', 'Servius', 'Gnaeus', 'Manius'],
  'Celtic Tribes': ['Brennus', 'Cadeyrn', 'Drustan', 'Vercas', 'Tasgetios', 'Ambiorix', 'Eporedos', 'Catuvol', 'Luernios', 'Segovax', 'Bellovesos', 'Orgetos'],
  'Germanic Tribes': ['Arminius', 'Segimer', 'Gundahar', 'Wulfhere', 'Hrodgar', 'Ansgar', 'Baldric', 'Ermanar', 'Theudric', 'Hariwald', 'Sigiwin', 'Adalwulf'],
  'Macedonian Kingdoms': ['Perdiccas', 'Krateros', 'Nikanor', 'Amyntas', 'Leonnatos', 'Polyperchon', 'Attalos', 'Meleagros', 'Philotas', 'Koinos', 'Seleukos', 'Antigenes'],
  'Spartan City-State': ['Leonidas', 'Brasidas', 'Agis', 'Pausanias', 'Kleomenes', 'Lysandros', 'Archidamos', 'Eurybiades', 'Dienekes', 'Gylippos', 'Anaxandros', 'Polydoros'],
  'Parthian Empire': ['Surena', 'Pakoros', 'Vardanes', 'Mithradat', 'Artabanos', 'Phraates', 'Orodes', 'Gotarzes', 'Sinatrukes', 'Tiridat', 'Vologases', 'Arsakes'],
  'Achaemenid Persian': ['Artabazos', 'Hydarnes', 'Mardonios', 'Datis', 'Megabyzos', 'Otanes', 'Bagaios', 'Artaphernes', 'Tigranes', 'Masistes', 'Pharnakes', 'Ariomardos'],
  'Carthaginian Empire': ['Hanno', 'Bomilcar', 'Himilco', 'Mago', 'Adherbal', 'Bodashtart', 'Hasdrubal', 'Gisco', 'Carthalo', 'Maharbal', 'Abdmelqart', 'Hamilcar'],
  'Kingdom of Kush': ['Arkamani', 'Tanyidamani', 'Nastasen', 'Harsiotef', 'Akinidad', 'Teritekas', 'Adikhalamani', 'Arnekhamani', 'Aspelta', 'Senkamanisken', 'Natakamani', 'Amanikhabale'],
  'Berber Confederations': ['Gaia', 'Gulussa', 'Mastanabal', 'Oxyntas', 'Hiempsal', 'Tacfarinas', 'Ezalces', 'Capussa', 'Lacumazes', 'Mazaetullus', 'Naravas', 'Bogud'],
  'Sarmatian Confederations': ['Banadaspus', 'Zanticus', 'Gatalus', 'Spadines', 'Tasius', 'Medosakkos', 'Rasparaganus', 'Inismeus', 'Aspurgos', 'Phorgabakos', 'Sauromates', 'Arsakos'],
  'Han Dynasty': ['Guang', 'Qing', 'Chao', 'Bao', 'Wen', 'Jun', 'Heng', 'Kuan', 'Liang', 'Shun', 'Yan', 'Zhong'],
  'Mauryan Empire': ['Devadatta', 'Bhadrasena', 'Somadatta', 'Jayasena', 'Ugrasena', 'Dhanapala', 'Rudradatta', 'Haridatta', 'Viradeva', 'Mahasena', 'Sudatta', 'Satyadeva'],
  'Silla Kingdom': ['Isabu', 'Sadaham', 'Geochilbu', 'Gwanchang', 'Pumil', 'Yeolgi', 'Munno', 'Gwisan', 'Chwihang', 'Bidam', 'Jukji', 'Heumsun'],
  'Thracian Odrysians': ['Seuthes', 'Kotys', 'Teres', 'Sitalkes', 'Rhoemetalkes', 'Medokos', 'Amadokos', 'Kersebleptes', 'Berisades', 'Sparadokos', 'Mostis', 'Rheskuporis'],
  'Samnite Federation': ['Herius', 'Statius', 'Ovius', 'Pacius', 'Trebius', 'Minatus', 'Papius', 'Salavius', 'Stenius', 'Vibius', 'Novius', 'Gellius'],
  'Tibetan Kingdoms': ['Gyaltsen', 'Tsering', 'Namgyal', 'Sonam', 'Lhundrup', 'Wangdu', 'Norbu', 'Dawa', 'Jampa', 'Tashi', 'Dorje', 'Phuntsok'],
  'Pre-Genghis Mongolia': ['Bodonchar', 'Khaidu', 'Tumbinai', 'Ambaghai', 'Bartan', 'Mengetu', 'Nekun', 'Daritai', 'Khachiun', 'Altan', 'Sorkhan', 'Charaka'],
  'Bactrian Greeks': ['Diodotos', 'Euthydemos', 'Demetrios', 'Agathokles', 'Pantaleon', 'Antimachos', 'Eukratides', 'Menandros', 'Apollodotos', 'Straton', 'Hermaios', 'Lysias'],
  'Yayoi Period Japan': ['Nashime', 'Ekiyaku', 'Takehiko', 'Ohiko', 'Mimaki', 'Hikoyasu', 'Tamaru', 'Kurahiko', 'Hayato', 'Asuki', 'Tsunuga', 'Isaseri']
}

const PLAIN = ['Aldric', 'Bram', 'Corin', 'Davin', 'Edric', 'Faron', 'Garrick', 'Hale', 'Ivor', 'Joren', 'Kellan', 'Loric', 'Maddox', 'Niall', 'Osric', 'Perrin']

module.exports = { NAMES, PLAIN }
