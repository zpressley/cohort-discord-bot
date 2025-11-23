/**
 * COHORT: Procedural Name Generators - Expanded Version
 * 
 * Each archetype has multiple generation patterns with large component pools
 * Creates thousands of unique, pronounceable, culturally authentic names
 */

// NOTE: in the live game this is wired to the Sequelize UsedNames model via
// src/database/setup.js. Here we import the initialized model collection and
// use models.UsedNames at runtime.
const { models } = require('../../database/setup');

class NameGenerators {
  
  // ============================================================================
  // ENGINEER (Roman Names)
  // ============================================================================
  
  /**
   * Roman Glory Names
   * Patterns: CVC+us, CVC+ius, CV+consonant+o, CVCC+us
   */
  generateEngineerGlory() {
    const patterns = [
      () => this.romanPattern1Glory(),  // Marcctus style
      () => this.romanPattern2Glory(),  // Gaivius style
      () => this.romanPattern3Glory(),  // Cato style
      () => this.romanPattern4Glory()   // Quintilus style
    ];
    
    return this.random(patterns)();
  }
  
  romanPattern1Glory() {
    // Pattern: [Start][vowel][double-consonant][us]
    const starts = ['M', 'L', 'G', 'T', 'Q', 'D', 'F', 'S', 'C', 'V', 'P', 'N', 'A', 'R', 'H'];
    const vowels1 = ['a', 'e', 'i', 'o', 'u'];
    const doubles = ['rc', 'ct', 'rt', 'nt', 'lt', 'pt', 'st', 'xt', 'nc', 'lv'];
    
    return this.random(starts) + this.random(vowels1) + this.random(doubles) + 'us';
  }
  
  romanPattern2Glory() {
    // Pattern: [Start][vowel][consonant][ius]
    const starts = ['G', 'L', 'M', 'T', 'C', 'V', 'P', 'S', 'F', 'D', 'A', 'N', 'R'];
    const vowels1 = ['a', 'e', 'i', 'o', 'u'];
    const consonants = ['v', 'r', 'l', 'n', 't', 'x', 'm', 'c'];
    
    return this.random(starts) + this.random(vowels1) + this.random(consonants) + 'ius';
  }
  
  romanPattern3Glory() {
    // Pattern: [Start][vowel][consonant][o]
    const starts = ['C', 'V', 'M', 'S', 'T', 'L', 'N', 'P', 'R', 'D'];
    const vowels1 = ['a', 'e', 'i', 'u', 'o'];
    const consonants = ['t', 'v', 'r', 'c', 'n', 'l'];
    
    return this.random(starts) + this.random(vowels1) + this.random(consonants) + 'o';
  }
  
  romanPattern4Glory() {
    // Pattern: [Start][vowel][consonant][vowel][consonant][us]
    const starts = ['M', 'L', 'G', 'T', 'Q', 'F', 'S', 'C', 'V', 'P', 'A', 'D', 'N', 'R'];
    const vowels1 = ['a', 'e', 'i', 'o', 'u'];
    const consonants1 = ['x', 'r', 'l', 'v', 'n', 'm', 't', 'c'];
    const vowels2 = ['i', 'u', 'a', 'e'];
    const consonants2 = ['l', 'n', 'r', 't'];
    
    return this.random(starts) + this.random(vowels1) + this.random(consonants1) + 
           this.random(vowels2) + this.random(consonants2) + 'us';
  }
  
  /**
   * Roman Survival Names
   */
  generateEngineerSurvival() {
    const patterns = [
      () => this.romanPattern1Survival(),
      () => this.romanPattern2Survival(),
      () => this.romanPattern3Survival()
    ];
    
    return this.random(patterns)();
  }
  
  romanPattern1Survival() {
    // Pattern: [Dark start][vowel][harsh double][us/o/ax]
    const starts = ['Cr', 'Br', 'Dr', 'V', 'N', 'S', 'M', 'F'];
    const vowels = ['o', 'u', 'a', 'e'];
    const harshDoubles = ['rv', 'rr', 'ss', 'tt', 'cc', 'vv', 'xx'];
    const suffixes = ['us', 'o', 'ax', 'ex', 'or'];
    
    return this.random(starts) + this.random(vowels) + this.random(harshDoubles) + this.random(suffixes);
  }
  
  romanPattern2Survival() {
    // Pattern: [Start][vowel][x/c][vowel][s/x/r]
    const starts = ['D', 'V', 'N', 'C', 'M', 'F', 'S', 'L', 'T'];
    const vowels1 = ['a', 'o', 'u', 'e'];
    const middles = ['x', 'c', 'r', 'l'];
    const vowels2 = ['u', 'a', 'i'];
    const endings = ['s', 'x', 'r', 'n'];
    
    return this.random(starts) + this.random(vowels1) + this.random(middles) + 
           this.random(vowels2) + this.random(endings);
  }
  
  romanPattern3Survival() {
    // Pattern: [Dark prefix][vowel][consonant][o/us]
    const darkPrefixes = ['Ferr', 'Morb', 'Nox', 'Necr', 'Vex', 'Torv', 'Atr', 'Crud'];
    const vowels = ['o', 'u', 'a'];
    const consonants = ['r', 'x', 'c', 'n', 's'];
    const suffixes = ['o', 'us', 'ax'];
    
    return this.random(darkPrefixes) + this.random(vowels) + this.random(consonants) + this.random(suffixes);
  }
  
  /**
   * Roman Surname Generator (when simple names depleted)
   */
  generateEngineerSurname(philosophy) {
    const praenomen = philosophy === 'glory' 
      ? this.generateEngineerGlory() 
      : this.generateEngineerSurvival();
    
    // Generate nomen (family name)
    const nomenStems = philosophy === 'glory'
      ? ['Aemil', 'Cornel', 'Fab', 'Claud', 'Jul', 'Valer', 'Aurel', 'Flav', 
         'Anton', 'Domit', 'Caecil', 'Manl', 'Liv', 'Tull', 'Pompe', 'Horat',
         'Jun', 'Serg', 'Sulpic', 'Terent', 'Marc', 'Papir', 'Quinct', 'Sempron',
         'Vergil', 'Acil', 'Aquil', 'Atil', 'Calpurn', 'Decim', 'Fur', 'Genuc',
         'Licin', 'Lucret', 'Maec', 'Minuc', 'Muc', 'Naut', 'Octav', 'Opp',
         'Ovid', 'Plaut', 'Postum', 'Ruf', 'Sext', 'Tit', 'Ulp', 'Vib']
      : ['Cruent', 'Feroc', 'Sever', 'Dur', 'Mortif', 'Tenebr', 'Sanguin',
         'Noct', 'Glacial', 'Acerb', 'Atroc', 'Crud', 'Exitial', 'Funest',
         'Grav', 'Horrid', 'Imman', 'Lugubr', 'Maest', 'Nefar', 'Omin',
         'Pernicios', 'Saev', 'Terribil', 'Violent', 'Asper', 'Barbar',
         'Cruenta', 'Dir', 'Fer', 'Implacabil', 'Luctuos', 'Miser', 'Noxi',
         'Pestif', 'Rigid', 'Torv', 'Auster', 'Frigid', 'Immit', 'Mord',
         'Odios', 'Saevi', 'Trist', 'Vehemen', 'Acid', 'Amar', 'Calamitos'];
    
    const nomen = this.random(nomenStems) + 'ius';
    return `${praenomen} ${nomen}`;
  }
  
  // ============================================================================
  // MOUNTAIN (Carthaginian/Punic Names)
  // ============================================================================
  
  generateMountainGlory() {
    const patterns = [
      () => this.punicPattern1Glory(),
      () => this.punicPattern2Glory(),
      () => this.punicPattern3Glory()
    ];
    
    return this.random(patterns)();
  }
  
  punicPattern1Glory() {
    // Pattern: Ha/Bo/Ma + [middle] + bal/car/dru
    const starts = ['Ha', 'Bo', 'Ma', 'Ad', 'Gi', 'Hi', 'Es', 'Ca', 'Sa', 'Bi', 'Da', 'Gu'];
    const middles = ['mil', 'nn', 'g', 'dru', 'sco', 'ml', 'sta', 'rth', 'lc', 'mb', 'th', 'str'];
    const suffixes = ['car', 'bal', 'dru', 'lco', 'bar', 'nar', 'tan', 'mon', 'gar', 'mel'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  punicPattern2Glory() {
    // Pattern: [Start] + vowel + consonant + vowel + l/n
    const starts = ['H', 'B', 'M', 'G', 'S', 'D', 'C', 'A', 'E'];
    const vowels1 = ['a', 'i', 'o', 'u'];
    const consonants = ['m', 'n', 's', 'd', 'r', 'l', 'b', 'g'];
    const vowels2 = ['a', 'o', 'i'];
    const endings = ['l', 'n', 'r', 'bal', 'mon'];
    
    return this.random(starts) + this.random(vowels1) + this.random(consonants) + 
           this.random(vowels2) + this.random(endings);
  }
  
  punicPattern3Glory() {
    // Pattern: Double consonant emphasis
    const starts = ['Ha', 'Ma', 'Bo', 'Sa', 'Gi'];
    const doubles = ['nn', 'mm', 'ss', 'll', 'rr'];
    const vowels = ['a', 'o', 'i'];
    const suffixes = ['o', 'al', 'ar', 'on', 'il'];
    
    return this.random(starts) + this.random(doubles) + this.random(vowels) + this.random(suffixes);
  }
  
  generateMountainSurvival() {
    const patterns = [
      () => this.punicPattern1Survival(),
      () => this.punicPattern2Survival()
    ];
    
    return this.random(patterns)();
  }
  
  punicPattern1Survival() {
    // Pattern: Ba/Mo/Zy + [harsh middle] + ox/ax/eth
    const starts = ['Ba', 'Mo', 'Zy', 'Mel', 'Sy', 'Ta', 'As', 'Ma', 'Za', 'Py', 'Dy'];
    const middles = ['al', 'lo', 'lq', 'ph', 'lm', 'xy', 'dr', 'kh', 'th', 'gm'];
    const suffixes = ['ox', 'ax', 'or', 'ar', 'eth', 'us', 'on'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  punicPattern2Survival() {
    // Pattern: Dark god names
    const godPrefixes = ['Baal', 'Mol', 'Melq', 'Tanit', 'Eshm', 'Astar'];
    const suffixes = ['or', 'ax', 'ek', 'eth', 'an', 'oth'];
    
    return this.random(godPrefixes) + this.random(suffixes);
  }
  
  // ============================================================================
  // GHOST (Germanic Names)
  // ============================================================================
  
  generateGhostGlory() {
    const patterns = [
      () => this.germanicPattern1Glory(),
      () => this.germanicPattern2Glory(),
      () => this.germanicPattern3Glory(),
      () => this.germanicPattern4Glory()
    ];
    
    return this.random(patterns)();
  }
  
  germanicPattern1Glory() {
    // Pattern: [Compound word] - Waldmann, Sturmwald style
    const firstParts = ['Wald', 'Sturm', 'Stein', 'Grün', 'Frei', 'Wild', 'Eis', 'Brun', 
                       'Adel', 'Edel', 'Gold', 'Silber', 'Kraft', 'Mut', 'Treu', 'Stark',
                       'Hoch', 'Berg', 'Feld', 'Strom'];
    const secondParts = ['mann', 'wald', 'helm', 'brand', 'hart', 'fried', 'win', 'bold',
                        'gar', 'mer', 'ric', 'bert', 'bald', 'wolf', 'bern', 'rad'];
    
    return this.random(firstParts) + this.random(secondParts);
  }
  
  germanicPattern2Glory() {
    // Pattern: [Strong start][vowel][consonant][ric/ulf]
    const starts = ['Ala', 'Theo', 'Sieg', 'Diet', 'Bere', 'God', 'Ald', 'Leof', 'Raed', 
                   'Wulf', 'Ead', 'Eal', 'Cyn', 'Ced', 'Coen', 'Hild', 'Wil'];
    const suffixes = ['ric', 'ulf', 'wald', 'helm', 'bert', 'brand', 'mar', 'gar'];
    
    return this.random(starts) + this.random(suffixes);
  }
  
  germanicPattern3Glory() {
    // Pattern: [Nature word][free word]
    const nature = ['Grün', 'Eichen', 'Tannen', 'Buchen', 'Espen', 'Ulmen', 'Linden'];
    const free = ['frei', 'hart', 'mann', 'herz', 'geist', 'kraft'];
    
    return this.random(nature) + this.random(free);
  }
  
  germanicPattern4Glory() {
    // Pattern: Strong consonant clusters
    const starts = ['Br', 'Dr', 'Fr', 'Gr', 'Kr', 'Thr', 'Schl', 'Schw', 'Str'];
    const middles = ['un', 'ein', 'ald', 'old', 'olf', 'elm', 'orm'];
    const suffixes = ['ric', 'helm', 'brand', 'wald', 'hart', 'win'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  generateGhostSurvival() {
    const patterns = [
      () => this.germanicPattern1Survival(),
      () => this.germanicPattern2Survival(),
      () => this.germanicPattern3Survival()
    ];
    
    return this.random(patterns)();
  }
  
  germanicPattern1Survival() {
    // Pattern: [Dark compound]
    const darkFirst = ['Grimm', 'Schreck', 'Nacht', 'Tod', 'Blut', 'Nebel', 'Finster', 'Dunkel',
                      'Schatten', 'Geist', 'Mord', 'Grab', 'Leichen', 'Totenkopf', 'Schwarz',
                      'Düster', 'Grau', 'Qual', 'Schmerz', 'Angst'];
    const darkSecond = ['wald', 'tod', 'geist', 'schreck', 'wolf', 'jäger', 'mord', 'rabe',
                       'krieger', 'reiter', 'schatten', 'mann', 'grau', 'nacht'];
    
    return this.random(darkFirst) + this.random(darkSecond);
  }
  
  germanicPattern2Survival() {
    // Pattern: [Harsh start][middle][us/ax/or]
    const starts = ['Fen', 'Varg', 'Sköl', 'Garm', 'Hel', 'Nid', 'Drau', 'Wyrm'];
    const middles = ['ris', 'r', 'g', 'n', 'k'];
    const suffixes = ['is', 'us', 'ax', 'or', 'ix'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  germanicPattern3Survival() {
    // Pattern: Fear/death words
    const parts = ['Schreck', 'Nebel', 'Schatt', 'Dunkel', 'Finster', 'Graus'];
    const suffixes = ['en', 'wald', 'mann', 'wolf', 'geist'];
    
    return this.random(parts) + this.random(suffixes);
  }
  
  // ============================================================================
  // MIRAGE (Berber/Numidian Names)
  // ============================================================================
  
  generateMirageGlory() {
    const patterns = [
      () => this.berberPattern1Glory(),
      () => this.berberPattern2Glory(),
      () => this.berberPattern3Glory()
    ];
    
    return this.random(patterns)();
  }
  
  berberPattern1Glory() {
    // Pattern: [M/J/B/S][vowel][ss/gur/cip][tha/ssa]
    const starts = ['Ju', 'Ma', 'Mi', 'Bo', 'Si', 'Hi', 'Ga', 'Na', 'Ad', 'Gu', 'Za', 'Ya'];
    const middles = ['gur', 'ssi', 'cip', 'ss', 'em', 'dal', 'fen', 'kel', 'tan'];
    const suffixes = ['tha', 'ssa', 'bal', 'nix', 'tan', 'psa', 'fsa'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  berberPattern2Glory() {
    // Pattern: Double 's' emphasis
    const starts = ['Ma', 'Bo', 'Si', 'Ga', 'Hi', 'Ta'];
    const doubles = ['ss', 'ff', 'll', 'nn'];
    const vowels = ['i', 'a', 'u'];
    const suffixes = ['tha', 'ssa', 'bal', 'tan'];
    
    return this.random(starts) + this.random(doubles) + this.random(vowels) + this.random(suffixes);
  }
  
  berberPattern3Glory() {
    // Pattern: Flowing sounds
    const syllable1 = ['Ma', 'Ju', 'Si', 'Ha', 'Ga', 'Na', 'Ba', 'Za'];
    const syllable2 = ['si', 'gu', 'di', 'fi', 'ki', 'li', 'ni'];
    const syllable3 = ['tha', 'ssa', 'bal', 'tan', 'psa'];
    
    return this.random(syllable1) + this.random(syllable2) + this.random(syllable3);
  }
  
  generateMirageSurvival() {
    const patterns = [
      () => this.berberPattern1Survival(),
      () => this.berberPattern2Survival()
    ];
    
    return this.random(patterns)();
  }
  
  berberPattern1Survival() {
    // Pattern: Persian-influenced harsh sounds
    const starts = ['Ar', 'Spi', 'Be', 'Ox', 'Sa', 'Da', 'Xe', 'Ph', 'Bar', 'Arta'];
    const middles = ['sa', 'ta', 'tha', 'pha', 'ba', 'ka', 'za', 'xa'];
    const suffixes = ['ces', 'mes', 'nes', 'ax', 'os', 'us', 'an'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  berberPattern2Survival() {
    // Pattern: Harsh desert sounds
    const starts = ['Kha', 'Gha', 'Sha', 'Tha', 'Dha'];
    const middles = ['ri', 'ru', 'ra', 'li', 'lu'];
    const suffixes = ['d', 'k', 'n', 'x', 'z'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  // ============================================================================
  // HERO (Trojan/Homeric Greek Names)
  // ============================================================================
  
  generateHeroGlory() {
    const patterns = [
      () => this.greekHeroPattern1Glory(),
      () => this.greekHeroPattern2Glory(),
      () => this.greekHeroPattern3Glory()
    ];
    
    return this.random(patterns)();
  }
  
  greekHeroPattern1Glory() {
    // Pattern: [Vowel start][consonant][vowel][s/or/us]
    const starts = ['Ae', 'He', 'Di', 'Od', 'Ag', 'Id', 'Phi', 'The', 'Ari', 'Eu', 'Io', 'Oe'];
    const consonants = ['ct', 'me', 'gen', 'ne', 'ry', 'no', 'do'];
    const vowels = ['e', 'a', 'o', 'u'];
    const suffixes = ['s', 'or', 'us', 'as', 'eus', 'on'];
    
    return this.random(starts) + this.random(consonants) + this.random(vowels) + this.random(suffixes);
  }
  
  greekHeroPattern2Glory() {
    // Pattern: Classical Greek structure
    const prefixes = ['Anti', 'Neo', 'Pro', 'Epi', 'Para', 'Meta'];
    const roots = ['cles', 'genes', 'medes', 'phanes', 'laus', 'machos'];
    
    return this.random(prefixes) + this.random(roots);
  }
  
  greekHeroPattern3Glory() {
    // Pattern: Hero-style names
    const starts = ['Hect', 'Aen', 'Pari', 'Deip', 'Troi', 'Hel', 'Ag', 'Patro', 'Nest'];
    const suffixes = ['or', 'as', 'eus', 'us', 'lus', 'on'];
    
    return this.random(starts) + this.random(suffixes);
  }
  
  generateHeroSurvival() {
    const patterns = [
      () => this.greekHeroPattern1Survival(),
      () => this.greekHeroPattern2Survival()
    ];
    
    return this.random(patterns)();
  }
  
  greekHeroPattern1Survival() {
    // Pattern: Death/destruction words
    const starts = ['Kra', 'Tha', 'Pho', 'Dei', 'Ne', 'Er', 'Ly', 'Ares', 'Tro'];
    const middles = ['to', 'na', 'bo', 'mo', 'cro', 'go'];
    const suffixes = ['s', 'n', 'x', 'os', 'is', 'us', 'on'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  greekHeroPattern2Survival() {
    // Pattern: Underworld/fear deities
    const darkGods = ['Phob', 'Deim', 'Eri', 'Than', 'Hypn', 'Mor', 'Kerat', 'Spara'];
    const suffixes = ['os', 'us', 'on', 'is', 'ax'];
    
    return this.random(darkGods) + this.random(suffixes);
  }
  
  // ============================================================================
  // WALL (Greek/Sicilian Scholarly Names)
  // ============================================================================
  
  generateWallGlory() {
    const patterns = [
      () => this.scholarPattern1Glory(),
      () => this.scholarPattern2Glory(),
      () => this.scholarPattern3Glory()
    ];
    
    return this.random(patterns)();
  }
  
  scholarPattern1Glory() {
    // Pattern: Arch/Her/Dio + [middle] + medes/cles/on
    const starts = ['Arch', 'Her', 'Dio', 'Ge', 'The', 'Py', 'Em', 'Pol', 'Epi', 'Hiero', 
                   'Tim', 'Aga', 'Emp', 'Gor', 'Zeno', 'Par'];
    const middles = ['i', 'o', 'e', 'a'];
    const suffixes = ['medes', 'cles', 'on', 'os', 'us', 'genes', 'krates', 'phanes', 'doros'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  scholarPattern2Glory() {
    // Pattern: Philosophical names
    const prefixes = ['Philo', 'Theo', 'Sopho', 'Poly', 'Auto'];
    const roots = ['sophos', 'mathes', 'krates', 'medes', 'genes'];
    
    return this.random(prefixes) + this.random(roots);
  }
  
  scholarPattern3Glory() {
    // Pattern: Sicilian style
    const starts = ['Aga', 'Dio', 'Her', 'Ge', 'The', 'Hie', 'Tim', 'Pro', 'Lepto', 'Epi'];
    const middles = ['tho', 'ny', 'mo', 'lo', 'ro'];
    const suffixes = ['cles', 'n', 's', 'us'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  generateWallSurvival() {
    const patterns = [
      () => this.scholarPattern1Survival(),
      () => this.scholarPattern2Survival()
    ];
    
    return this.random(patterns)();
  }
  
  scholarPattern1Survival() {
    // Pattern: Time/fate deities
    const starts = ['Chro', 'Atro', 'Mem', 'Tan', 'Sis', 'Cha', 'Hyp', 'Clo', 'Lache'];
    const middles = ['n', 't', 'ph', 'r', 'no', 'ta'];
    const suffixes = ['os', 'on', 'us', 'as', 'is'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  scholarPattern2Survival() {
    // Pattern: Underworld rivers
    const rivers = ['Sty', 'Ache', 'Cocy', 'Phle', 'Le'];
    const suffixes = ['x', 'ron', 'tus', 'thon', 'the'];
    
    return this.random(rivers) + this.random(suffixes);
  }
  
  // ============================================================================
  // WIND (Mongolian Names)
  // ============================================================================
  
  generateWindGlory() {
    const patterns = [
      () => this.mongolPattern1Glory(),
      () => this.mongolPattern2Glory(),
      () => this.mongolPattern3Glory()
    ];
    
    return this.random(patterns)();
  }
  
  mongolPattern1Glory() {
    // Pattern: [Hard stop][vowel][guttural][jin/tai]
    const starts = ['Te', 'Bo', 'To', 'Yi', 'Kha', 'Su', 'Je', 'Mu', 'Og', 'Ja', 'Cha', 'Ho'];
    const middles = ['mu', 'ro', 'go', 'su', 'kh', 'lu', 'qa', 'ba', 'la'];
    const suffixes = ['jin', 'tai', 'tei', 'ul', 'ai', 'an', 'ri', 'dar', 'gan'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  mongolPattern2Glory() {
    // Pattern: Strong Mongol sounds
    const syllable1 = ['Bor', 'Tem', 'Tog', 'Jes', 'Kho', 'Mong', 'Gen', 'Bat'];
    const syllable2 = ['te', 'chu', 'ril', 'sai', 'gai', 'tai', 'ko'];
    
    return this.random(syllable1) + this.random(syllable2);
  }
  
  mongolPattern3Glory() {
    // Pattern: Sky/nature words
    const prefixes = ['Tengg', 'Mong', 'Bator', 'Noyon', 'Bagh'];
    const suffixes = ['ri', 'ai', 'jin', 'khan', 'chi'];
    
    return this.random(prefixes) + this.random(suffixes);
  }
  
  generateWindSurvival() {
    const patterns = [
      () => this.mongolPattern1Survival(),
      () => this.mongolPattern2Survival()
    ];
    
    return this.random(patterns)();
  }
  
  mongolPattern1Survival() {
    // Pattern: Harsh guttural sounds
    const starts = ['Khu', 'Gru', 'Ak', 'Ba', 'Tu', 'Kho', 'Gha', 'Kha', 'Gur'];
    const middles = ['ga', 'ma', 'tu', 'ba', 'ri', 'la', 'ta'];
    const suffixes = ['r', 'k', 't', 'ar', 'ak', 'or', 'ot', 'ur'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  mongolPattern2Survival() {
    // Pattern: Harsh Xiongnu style
    const parts = ['Khug', 'Grum', 'Akta', 'Bazu', 'Turm', 'Ghur', 'Khar'];
    const suffixes = ['ar', 'ak', 'ok', 'ur', 'or'];
    
    return this.random(parts) + this.random(suffixes);
  }
  
  // ============================================================================
  // THRESHOLD (Spartan Names)
  // ============================================================================
  
  generateThresholdGlory() {
    const patterns = [
      () => this.spartanPattern1Glory(),
      () => this.spartanPattern2Glory(),
      () => this.spartanPattern3Glory()
    ];
    
    return this.random(patterns)();
  }
  
  spartanPattern1Glory() {
    // Pattern: [Strong][o/e][consonant][idas/eus]
    const starts = ['Leo', 'Bra', 'Kle', 'Ari', 'Die', 'Age', 'Pau', 'Ly', 'Ple', 'Dema', 'Leoty'];
    const middles = ['n', 's', 'm', 'd', 'k'];
    const suffixes = ['idas', 'eus', 'us', 'as', 'os', 'is'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  spartanPattern2Glory() {
    // Pattern: Classical Spartan
    const prefixes = ['Aristo', 'Diene', 'Megas', 'Kleom', 'Anax', 'Pleisto'];
    const suffixes = ['mus', 'kes', 'tias', 'brotos', 'andros'];
    
    return this.random(prefixes) + this.random(suffixes);
  }
  
  spartanPattern3Glory() {
    // Pattern: -idas emphasis
    const starts = ['Leon', 'Bras', 'Paus', 'Arche', 'Lych', 'Ages'];
    const suffixes = ['idas', 'ilas', 'ippos'];
    
    return this.random(starts) + this.random(suffixes);
  }
  
  generateThresholdSurvival() {
    const patterns = [
      () => this.spartanPattern1Survival(),
      () => this.spartanPattern2Survival()
    ];
    
    return this.random(patterns)();
  }
  
  spartanPattern1Survival() {
    // Pattern: Death/war gods
    const starts = ['Kra', 'Pha', 'Tha', 'Spha', 'Ere', 'Nyx', 'Mor', 'Ares', 'Hades'];
    const middles = ['t', 'n', 'k', 'g', 'bo', 'ke'];
    const suffixes = ['os', 'on', 'ax', 'us', 'is'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  spartanPattern2Survival() {
    // Pattern: Harsh Spartan
    const parts = ['Kratho', 'Phake', 'Thanor', 'Sphag', 'Eremo', 'Nyxo'];
    const suffixes = ['s', 'n', 'us', 'is'];
    
    return this.random(parts) + this.random(suffixes);
  }
  
  // ============================================================================
  // SERPENT (Germanic Bog - reuse Ghost patterns with swamp emphasis)
  // ============================================================================
  
  generateSerpentGlory() {
    // Reuse Germanic patterns but with swamp/water emphasis
    const patterns = [
      () => this.bogPattern1Glory(),
      () => this.bogPattern2Glory()
    ];
    
    return this.random(patterns)();
  }
  
  bogPattern1Glory() {
    const waterFirst = ['Fluss', 'Bach', 'Sumpf', 'Moor', 'See', 'Teich', 'Wasser'];
    const secondParts = ['mann', 'meister', 'held', 'ric', 'brand'];
    
    return this.random(waterFirst) + this.random(secondParts);
  }
  
  bogPattern2Glory() {
    // Latinized Germanic
    const starts = ['Civ', 'Brin', 'Vele', 'Gann', 'Char', 'Malo', 'Verr', 'Crup', 'Bata'];
    const suffixes = ['ilis', 'is', 'us', 'ix', 'ar', 'or', 'ix'];
    
    return this.random(starts) + this.random(suffixes);
  }
  
  generateSerpentSurvival() {
    const patterns = [
      () => this.bogPattern1Survival(),
      () => this.bogPattern2Survival()
    ];
    
    return this.random(patterns)();
  }
  
  bogPattern1Survival() {
    // Pattern: Swamp death
    const swampFirst = ['Sumpf', 'Mor', 'Schlick', 'Faul', 'Modder', 'Schlamm'];
    const darkSecond = ['tod', 'mord', 'grab', 'geist', 'dreck'];
    
    return this.random(swampFirst) + this.random(darkSecond);
  }
  
  bogPattern2Survival() {
    // Pattern: Latin swamp death
    const starts = ['Do', 'Fra', 'Per', 'Pes', 'Mor', 'Put', 'Lim', 'Vor', 'Aby'];
    const middles = ['l', 'r', 's', 't'];
    const suffixes = ['us', 'ax', 'or', 'ix', 'os'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  // ============================================================================
  // STORM (Macedonian Names)
  // ============================================================================
  
  generateStormGlory() {
    const patterns = [
      () => this.macedonPattern1Glory(),
      () => this.macedonPattern2Glory(),
      () => this.macedonPattern3Glory()
    ];
    
    return this.random(patterns)();
  }
  
  macedonPattern1Glory() {
    // Pattern: [Prefix][strong middle][os/der/eus]
    const starts = ['Ale', 'Phi', 'Pto', 'Sel', 'Cas', 'Eum', 'Cra', 'Par', 'Anti', 'Poly'];
    const middles = ['xa', 'le', 'eu', 'an', 'ar', 'me', 'pe', 'go'];
    const suffixes = ['nder', 'os', 'us', 'on', 'eus', 'ter'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  macedonPattern2Glory() {
    // Pattern: Diadochi style
    const prefixes = ['Lysi', 'Anti', 'Sele', 'Ptole', 'Cassa', 'Perdic', 'Crate', 'Leonna'];
    const suffixes = ['machus', 'gonus', 'ucus', 'maeus', 'nder', 'cas', 'tus'];
    
    return this.random(prefixes) + this.random(suffixes);
  }
  
  macedonPattern3Glory() {
    // Pattern: -ippos (horse) names
    const starts = ['Phil', 'Hip', 'Ari', 'Demo', 'Cal', 'Xeno'];
    const suffixes = ['ippos', 'ippus', 'archos'];
    
    return this.random(starts) + this.random(suffixes);
  }
  
  generateStormSurvival() {
    const patterns = [
      () => this.macedonPattern1Survival(),
      () => this.macedonPattern2Survival()
    ];
    
    return this.random(patterns)();
  }
  
  macedonPattern1Survival() {
    // Pattern: Destroyer names
    const starts = ['Kra', 'De', 'Py', 'Pol', 'An', 'Ty', 'Bria'];
    const middles = ['to', 'mo', 'ro', 'y', 'ta', 'ph'];
    const suffixes = ['klos', 'phon', 'mor', 'lys', 'gon', 'reus'];
    
    return this.random(starts) + this.random(middles) + this.random(suffixes);
  }
  
  macedonPattern2Survival() {
    // Pattern: Titans/monsters
    const titans = ['Typhon', 'Cronos', 'Bria', 'Cot', 'Gy', 'Echid', 'Scyl', 'Hydra'];
    const suffixes = ['', 'os', 'us', 'ax'];
    
    return this.random(titans) + this.random(suffixes);
  }
  
  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  random(array) {
    return array[Math.floor(Math.random() * array.length)];
  }
  
  /**
   * Main entry point for name generation
   */
  async generateUniqueName(archetype, philosophy, userId, maxAttempts = 100) {
    let attempts = 0;
    let generatedName = null;
    let isUnique = false;
    
    // For Romans, try simple name first
    if (archetype === 'engineer') {
      const simpleName = await this.tryGenerateSimpleRomanName(philosophy, maxAttempts);
      if (simpleName) {
        await this.reserveName(simpleName, archetype, philosophy, userId, false);
        return simpleName;
      }
      
      // Fall back to surname
      return await this.generateUniqueRomanWithSurname(philosophy, userId, maxAttempts);
    }
    
    // For other archetypes
    while (attempts < maxAttempts && !isUnique) {
      generatedName = this.generateForArchetype(archetype, philosophy);
      
      const existing = await models.UsedNames.findOne({
        where: {
          fullName: generatedName,
          retired: false
        }
      });
      
      if (!existing) {
        isUnique = true;
        await this.reserveName(generatedName, archetype, philosophy, userId, false);
      }
      
      attempts++;
    }
    
    if (!isUnique) {
      throw new Error(`Could not generate unique ${philosophy} ${archetype} name after ${maxAttempts} attempts`);
    }
    
    return generatedName;
  }
  
  async tryGenerateSimpleRomanName(philosophy, maxAttempts) {
    for (let i = 0; i < maxAttempts; i++) {
      const name = philosophy === 'glory' 
        ? this.generateEngineerGlory() 
        : this.generateEngineerSurvival();
      
      const existing = await models.UsedNames.findOne({
        where: {
          fullName: name,
          retired: false,
          hasSurname: false
        }
      });
      
      if (!existing) return name;
    }
    
    return null;
  }
  
  async generateUniqueRomanWithSurname(philosophy, userId, maxAttempts) {
    for (let i = 0; i < maxAttempts; i++) {
      const name = this.generateEngineerSurname(philosophy);
      
      const existing = await models.UsedNames.findOne({
        where: {
          fullName: name,
          retired: false
        }
      });
      
      if (!existing) {
        const [firstName, surname] = name.split(' ');
        await this.reserveName(name, 'engineer', philosophy, userId, true, surname);
        return name;
      }
    }
    
    throw new Error(`Could not generate unique Roman surname after ${maxAttempts} attempts`);
  }
  
  generateForArchetype(archetype, philosophy) {
    const generators = {
      engineer: philosophy === 'glory' ? this.generateEngineerGlory.bind(this) : this.generateEngineerSurvival.bind(this),
      mountain: philosophy === 'glory' ? this.generateMountainGlory.bind(this) : this.generateMountainSurvival.bind(this),
      ghost: philosophy === 'glory' ? this.generateGhostGlory.bind(this) : this.generateGhostSurvival.bind(this),
      mirage: philosophy === 'glory' ? this.generateMirageGlory.bind(this) : this.generateMirageSurvival.bind(this),
      hero: philosophy === 'glory' ? this.generateHeroGlory.bind(this) : this.generateHeroSurvival.bind(this),
      wall: philosophy === 'glory' ? this.generateWallGlory.bind(this) : this.generateWallSurvival.bind(this),
      wind: philosophy === 'glory' ? this.generateWindGlory.bind(this) : this.generateWindSurvival.bind(this),
      threshold: philosophy === 'glory' ? this.generateThresholdGlory.bind(this) : this.generateThresholdSurvival.bind(this),
      serpent: philosophy === 'glory' ? this.generateSerpentGlory.bind(this) : this.generateSerpentSurvival.bind(this),
      storm: philosophy === 'glory' ? this.generateStormGlory.bind(this) : this.generateStormSurvival.bind(this)
    };
    
    return generators[archetype]();
  }
  
  async reserveName(fullName, archetype, philosophy, userId, hasSurname, surname = null) {
    const firstName = hasSurname ? fullName.split(' ')[0] : fullName;
    
    await models.UsedNames.create({
      archetype,
      philosophy,
      firstName,
      surname,
      hasSurname,
      fullName,
      usedBy: userId,
      usedAt: new Date(),
      retired: false
    });
  }

  /**
   * Lock in a specific, already-presented name if it is still available.
   * Throws if the name is already in use.
   */
  async lockInSpecificName(archetype, philosophy, userId, fullName) {
    const existing = await models.UsedNames.findOne({
      where: {
        fullName,
        retired: false
      }
    });

    if (existing) {
      throw new Error('Name already in use');
    }

    const parts = fullName.split(' ');
    const hasSurname = parts.length > 1;
    const surname = hasSurname ? parts.slice(1).join(' ') : null;

    await this.reserveName(fullName, archetype, philosophy, userId, hasSurname, surname);
  }
  
  /**
   * Test function to verify generator output
   */
  async testGenerator(archetype, philosophy, count = 20) {
    console.log(`\n=== Testing ${archetype} ${philosophy} (${count} names) ===\n`);
    
    const names = new Set();
    for (let i = 0; i < count; i++) {
      const name = this.generateForArchetype(archetype, philosophy);
      names.add(name);
      console.log(`${i + 1}. ${name}`);
    }
    
    console.log(`\nUnique names: ${names.size}/${count}`);
    console.log(`Collision rate: ${((count - names.size) / count * 100).toFixed(1)}%\n`);
  }
}

module.exports = new NameGenerators();