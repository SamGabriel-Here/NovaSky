/**
 * Cultural background and plain-language descriptions.
 *
 * This file holds *editorial* text only: history, mythology and beginner-facing
 * explanations. Every numeric or positional value in NovaSky comes from a catalogue
 * or from astronomy-engine, never from here.
 *
 * Attribution conventions used below:
 *  - "Ptolemy": one of the 48 constellations listed in the Almagest (2nd century CE).
 *  - "Keyser & de Houtman": charted on the 1595-97 Dutch voyage, published by
 *    Plancius (1598) and popularised by Bayer's Uranometria (1603).
 *  - "Lacaille": introduced by Nicolas-Louis de Lacaille from his 1751-52 Cape survey.
 *  - "Hevelius": introduced by Johannes Hevelius, published 1687/1690.
 */

export interface ConstellationLore {
  /** One or two sentences a beginner can read at a glance. */
  summary: string
  /** Mythological or historical background. */
  mythology: string
  /** Shown in Beginner mode: how to actually find it. */
  findIt?: string
}

/** The constellations Beginner mode keeps on screen. */
export const BEGINNER_CONSTELLATIONS = new Set([
  'Ori', 'UMa', 'UMi', 'Cas', 'Cyg', 'Lyr', 'Aql', 'Sco', 'Sgr', 'Leo', 'Tau',
  'Gem', 'Cnc', 'Vir', 'Boo', 'Per', 'And', 'Peg', 'Aur', 'CMa', 'CMi', 'Cru',
  'Cen', 'Cap', 'Aqr', 'Psc', 'Ari', 'Lib', 'Dra', 'Cep'
])

export const CONSTELLATION_LORE: Record<string, ConstellationLore> = {
  And: {
    summary: 'A chain of stars running off the corner of the Great Square of Pegasus, and home to the Andromeda Galaxy.',
    mythology: 'Ptolemy. In Greek myth Andromeda was chained to a rock as a sacrifice to the sea monster Cetus, and rescued by Perseus. Her parents Cepheus and Cassiopeia lie beside her in the sky.',
    findIt: 'Find the Great Square of Pegasus, then follow the two curving lines of stars leading away from its top-left corner.'
  },
  Ant: {
    summary: 'A faint southern group with no bright stars, representing an air pump.',
    mythology: 'Lacaille, named for the air pump of the physicist Denis Papin, one of fourteen constellations he devoted to instruments of science and craft.'
  },
  Aps: {
    summary: 'A small, faint constellation near the south celestial pole.',
    mythology: 'Keyser & de Houtman. It represents a bird of paradise; the name comes from a Greek word meaning "without feet", reflecting a European belief that the trade skins of these New Guinea birds, which arrived with the legs removed, came from creatures that never landed.'
  },
  Aqr: {
    summary: 'A large, faint zodiac constellation. Its "water jar" asterism pours a stream of stars toward Piscis Austrinus.',
    mythology: 'Ptolemy. Associated with Ganymede, the youth carried to Olympus by Zeus to serve as cupbearer to the gods. The region of sky around it holds several watery constellations.'
  },
  Aql: {
    summary: 'The eagle, marked by bright Altair flanked by two fainter stars, one corner of the Summer Triangle.',
    mythology: 'Ptolemy. The eagle of Zeus, which carried his thunderbolts and, in some versions, bore Ganymede up to Olympus.',
    findIt: 'Altair is the southernmost star of the Summer Triangle, and the only bright star with a companion close on each side.'
  },
  Ara: {
    summary: 'A southern constellation just below the tail of Scorpius, seen as an altar.',
    mythology: 'Ptolemy. The altar on which the gods swore their alliance before the war against the Titans.'
  },
  Ari: {
    summary: 'A small zodiac constellation of a few modest stars between Taurus and Pisces.',
    mythology: 'Ptolemy. The ram with the golden fleece sought by Jason and the Argonauts. It once held the vernal equinox point, which precession has since carried into Pisces.'
  },
  Aur: {
    summary: 'A bright pentagon high in northern winter skies, anchored by the star Capella.',
    mythology: 'Ptolemy. Usually identified as a charioteer, often Erichthonius of Athens, credited with inventing the four-horse chariot. He is drawn carrying a goat and her kids, the stars around Capella, whose name means "little she-goat".',
    findIt: 'Capella is the bright yellow star high overhead on winter evenings, north of Orion.'
  },
  Boo: {
    summary: 'A kite-shaped figure rising from the orange giant Arcturus.',
    mythology: 'Ptolemy. The herdsman or ploughman who drives the bears around the pole. The name Arcturus means "guardian of the bear".',
    findIt: 'Follow the curve of the Big Dipper’s handle away from the bowl. The old mnemonic is "arc to Arcturus".'
  },
  Cae: { summary: 'One of the faintest constellations, a thin wedge of southern sky.', mythology: 'Lacaille, representing a burin or engraving chisel.' },
  Cam: { summary: 'A large but very dim northern constellation filling the gap between Perseus, Auriga and the pole.', mythology: 'Introduced by Petrus Plancius in 1612 to fill an empty stretch of northern sky. The name means "giraffe".' },
  Cnc: {
    summary: 'The faintest zodiac constellation, but home to the Beehive Cluster, an easy naked-eye smudge under dark skies.',
    mythology: 'Ptolemy. The crab crushed underfoot by Heracles during his battle with the Hydra, placed in the sky by Hera for its trouble.'
  },
  CVn: { summary: 'A quiet northern constellation under the handle of the Big Dipper, containing the Whirlpool Galaxy.', mythology: 'Hevelius. The hunting dogs Asterion and Chara, held on a leash by neighbouring Boötes.' },
  CMa: {
    summary: 'Home to Sirius, the brightest star in the night sky.',
    mythology: 'Ptolemy. The larger of Orion’s two hunting dogs. The rising of Sirius just before dawn once marked the annual flooding of the Nile for the ancient Egyptians.',
    findIt: 'Follow Orion’s belt down and to the left; the first brilliant star you meet is Sirius.'
  },
  CMi: { summary: 'A two-star constellation dominated by Procyon.', mythology: 'Ptolemy. Orion’s smaller hunting dog. Procyon means "before the dog", because it rises shortly before Sirius from northern latitudes.' },
  Cap: { summary: 'A wide triangle of faint stars in the autumn zodiac.', mythology: 'Ptolemy. A sea-goat, goat in front and fish behind, a hybrid inherited from Babylonian astronomy and linked in Greek myth to the god Pan.' },
  Car: {
    summary: 'A rich southern constellation containing Canopus, the second-brightest star, and the vast Carina Nebula.',
    mythology: 'Formed when Lacaille divided the unwieldy ancient constellation Argo Navis, the ship of the Argonauts, into Carina (the keel), Puppis (the stern) and Vela (the sails).'
  },
  Cas: {
    summary: 'An unmistakable W or M of five bright stars, opposite the Big Dipper across the pole.',
    mythology: 'Ptolemy. The boastful queen, mother of Andromeda, set in the sky on a throne that turns her upside down for half of every night as a punishment for her vanity.',
    findIt: 'Look for a bright zigzag "W" in the north; it circles the pole opposite the Big Dipper.'
  },
  Cen: { summary: 'A large southern constellation holding Alpha Centauri, the closest star system to the Sun, and the great globular cluster Omega Centauri.', mythology: 'Ptolemy. The centaur Chiron, tutor of heroes, distinguished from his wilder kin by his wisdom and healing skill.' },
  Cep: { summary: 'A house-shaped figure near the pole, containing the prototype variable star Delta Cephei.', mythology: 'Ptolemy. King of Aethiopia, husband of Cassiopeia and father of Andromeda.' },
  Cet: { summary: 'A sprawling constellation of the "water" region, home to Mira, a red giant that fades and brightens over about eleven months.', mythology: 'Ptolemy. The sea monster sent to devour Andromeda, killed by Perseus.' },
  Cha: { summary: 'A small, dim southern constellation near the celestial south pole.', mythology: 'Keyser & de Houtman, named after the chameleon.' },
  Cir: { summary: 'A narrow triangle of faint stars beside Alpha Centauri.', mythology: 'Lacaille, representing a draughtsman’s pair of compasses.' },
  Col: { summary: 'A small southern group below Canis Major.', mythology: 'Introduced by Petrus Plancius in 1592. The dove, associated both with Noah’s dove and with the dove sent ahead of the Argo.' },
  Com: { summary: 'A faint scatter of stars that is actually a nearby star cluster, and a window onto thousands of distant galaxies.', mythology: 'Named for Queen Berenice II of Egypt, who cut off her hair as an offering for her husband’s safe return from war; when it vanished from the temple, the court astronomer declared it had been placed among the stars. Formalised as a constellation by Tycho Brahe.' },
  CrA: { summary: 'A delicate arc of stars beneath Sagittarius.', mythology: 'Ptolemy. The southern crown, sometimes a wreath laid at the feet of the neighbouring centaur.' },
  CrB: { summary: 'A near-perfect semicircle of stars between Boötes and Hercules.', mythology: 'Ptolemy. The crown given to Ariadne by Dionysus and thrown into the sky.', findIt: 'A small, neat arc just east of bright Arcturus.' },
  Crv: { summary: 'A compact quadrilateral in the southern spring sky.', mythology: 'Ptolemy. The crow sent by Apollo to fetch water, which dallied and returned with excuses, and with the water snake Hydra and the cup Crater, both of which sit beside it in the sky.' },
  Crt: { summary: 'A faint cup-shaped group riding on the back of Hydra.', mythology: 'Ptolemy. The goblet of Apollo, part of the same story as Corvus.' },
  Cru: {
    summary: 'The smallest constellation and the most famous southern signpost, with the dark Coalsack Nebula alongside.',
    mythology: 'Known to the ancients as part of Centaurus and separated by European navigators in the 16th and 17th centuries; Augustin Royer is often credited with formalising it in 1679. It appears on several national flags of the southern hemisphere.',
    findIt: 'Visible from southern latitudes. The long axis of the cross points toward the south celestial pole.'
  },
  Cyg: {
    summary: 'The Northern Cross, flying down the Milky Way, with brilliant Deneb at its tail.',
    mythology: 'Ptolemy. A swan. In one telling it is the form Zeus took to approach Leda. In another it is the grieving Cycnus, transformed as he dived repeatedly into the river for his friend Phaethon.',
    findIt: 'Deneb marks the top of the Summer Triangle; the cross runs along the Milky Way beneath it.'
  },
  Del: { summary: 'A tiny, charming diamond of stars with a tail, east of Altair.', mythology: 'Ptolemy. The dolphin that rescued the poet Arion from drowning, or that persuaded the sea-nymph Amphitrite to marry Poseidon.' },
  Dor: { summary: 'A southern constellation containing most of the Large Magellanic Cloud.', mythology: 'Keyser & de Houtman, representing a dolphinfish (mahi-mahi), not the goldfish its name is sometimes translated as.' },
  Dra: { summary: 'A long winding constellation coiling between the two Bears.', mythology: 'Ptolemy. The dragon Ladon, guardian of the golden apples of the Hesperides, slain by Heracles. Its star Thuban was the pole star around 3000 BCE.' },
  Equ: { summary: 'The second-smallest constellation, a faint group beside Delphinus.', mythology: 'Ptolemy. The "little horse", sometimes identified as Celeris, brother of Pegasus.' },
  Eri: { summary: 'A very long river of stars winding from Orion’s foot deep into the southern sky, ending at bright Achernar.', mythology: 'Ptolemy. A celestial river, variously identified with the Po, the Nile, or the river into which Phaethon fell after losing control of the Sun’s chariot.' },
  For: { summary: 'A faint southern constellation notable as the location of the Hubble Ultra Deep Field.', mythology: 'Lacaille, representing a chemical furnace.' },
  Gem: {
    summary: 'The twins, marked by the bright pair Castor and Pollux, and the radiant of the December Geminid meteor shower.',
    mythology: 'Ptolemy. The Dioscuri: mortal Castor and immortal Pollux, who asked to share immortality so they need never be parted.',
    findIt: 'Two bright stars of similar brightness, up and to the left of Orion on winter evenings.'
  },
  Gru: { summary: 'A bright southern constellation south of Piscis Austrinus.', mythology: 'Keyser & de Houtman. The crane, a bird the Dutch navigators would have known well from European wetlands.' },
  Her: { summary: 'A large northern constellation whose "Keystone" asterism points the way to M13, the finest globular cluster in northern skies.', mythology: 'Ptolemy, who called it simply "the kneeler". Later identified with Heracles, shown kneeling with one foot on Draco’s head.' },
  Hor: { summary: 'A faint southern constellation.', mythology: 'Lacaille, representing a pendulum clock, an instrument central to the precise timing of his own star observations.' },
  Hya: { summary: 'The largest of the 88 constellations, a long thin trail of faint stars with one moderately bright star, Alphard.', mythology: 'Ptolemy. The many-headed water snake fought by Heracles as his second labour.' },
  Hyi: { summary: 'A southern constellation between the two Magellanic Clouds.', mythology: 'Keyser & de Houtman. The "little water snake", distinct from the much larger and older Hydra.' },
  Ind: { summary: 'A faint southern constellation.', mythology: 'Keyser & de Houtman, depicting an indigenous man; the figure reflects the European voyaging context in which these constellations were invented rather than any specific culture.' },
  Lac: { summary: 'A faint zigzag of stars between Cygnus and Andromeda.', mythology: 'Hevelius, who filled this gap with a lizard because the space was too small for anything grander.' },
  Leo: {
    summary: 'One of the few constellations that really looks like its namesake, with a backwards question-mark "Sickle" forming the head and Regulus at its base.',
    mythology: 'Ptolemy. The Nemean lion, whose impenetrable hide forced Heracles to strangle it as the first of his twelve labours.',
    findIt: 'Look for the backwards question mark of the Sickle in the east on spring evenings; Regulus is the bright star at its bottom.'
  },
  LMi: { summary: 'A small, faint constellation squeezed between Leo and Ursa Major.', mythology: 'Hevelius, added to fill an unclaimed patch of sky next to the greater lion.' },
  Lep: { summary: 'A compact constellation directly beneath Orion.', mythology: 'Ptolemy. The hare, crouched at the hunter’s feet and pursued by his dogs.' },
  Lib: { summary: 'A modest zodiac constellation between Virgo and Scorpius.', mythology: 'Ptolemy listed these stars as the claws of the Scorpion; the Romans reimagined them as the scales of justice held by neighbouring Virgo. Two of its star names still mean "southern claw" and "northern claw".' },
  Lup: { summary: 'A southern constellation between Centaurus and Scorpius.', mythology: 'Ptolemy. Originally simply "the beast", an unspecified animal held by the Centaur; it became a wolf in later European tradition.' },
  Lyn: { summary: 'A very faint northern constellation.', mythology: 'Hevelius, who reportedly said you would need the eyes of a lynx to see it.' },
  Lyr: {
    summary: 'A small constellation containing brilliant Vega and the Ring Nebula.',
    mythology: 'Ptolemy. The lyre of Orpheus, whose music could move stones and persuade the lord of the underworld.',
    findIt: 'Vega is the brightest star of the Summer Triangle, nearly overhead on summer evenings from mid-northern latitudes.'
  },
  Men: { summary: 'A faint constellation near the south celestial pole, overlapping part of the Large Magellanic Cloud.', mythology: 'Lacaille, named for Table Mountain overlooking Cape Town, where he made his southern survey. It is the only constellation named after a terrestrial landmark.' },
  Mic: { summary: 'A faint constellation south of Capricornus.', mythology: 'Lacaille, representing a microscope.' },
  Mon: { summary: 'A dim constellation inside the Winter Triangle, but rich in nebulae and clusters where the Milky Way crosses it.', mythology: 'Attributed to Petrus Plancius, 1612. The unicorn.' },
  Mus: { summary: 'A small southern constellation just below Crux.', mythology: 'Keyser & de Houtman. The fly, the only insect among the 88 constellations.' },
  Nor: { summary: 'A faint southern constellation whose brightest stars were reassigned to neighbouring Scorpius.', mythology: 'Lacaille, representing a carpenter’s set square and rule.' },
  Oct: { summary: 'The constellation containing the south celestial pole. It has no bright pole star; faint Sigma Octantis is the closest equivalent to Polaris.', mythology: 'Lacaille, named for the octant, a navigational instrument for measuring altitude at sea.' },
  Oph: { summary: 'A large equatorial constellation that the Sun passes through, though it is not one of the traditional twelve zodiac signs.', mythology: 'Ptolemy. Asclepius, the healer who learned to raise the dead and was struck down by Zeus for it, and shown grappling with the serpent that is the separate constellation Serpens.' },
  Ori: {
    summary: 'The most recognisable constellation in the sky: three belt stars in a row, red Betelgeuse and blue-white Rigel at the corners, and the Orion Nebula hanging from the belt.',
    mythology: 'Ptolemy. The great hunter, killed by a scorpion, which is why Orion and Scorpius are placed on opposite sides of the sky and never appear together.',
    findIt: 'Three equally bright stars in a short straight line, the belt, are unmistakable on winter evenings.'
  },
  Pav: { summary: 'A southern constellation containing the bright globular cluster NGC 6752.', mythology: 'Keyser & de Houtman. The peacock, a bird sacred to Hera in Greek myth and encountered by the Dutch navigators in the East Indies.' },
  Peg: {
    summary: 'Dominated by the Great Square, a large and useful signpost in the autumn sky.',
    mythology: 'Ptolemy. The winged horse sprung from the blood of Medusa when Perseus killed her.',
    findIt: 'Four stars of similar brightness forming a large, nearly empty square high in the autumn sky.'
  },
  Per: { summary: 'A rich Milky Way constellation containing the Double Cluster and Algol, the "demon star" that dims every 2.87 days.', mythology: 'Ptolemy. The hero who killed Medusa and rescued Andromeda. Algol marks the head of Medusa, and its regular fading was noticed long before its eclipsing binary nature was understood.' },
  Phe: { summary: 'The brightest of the southern bird constellations.', mythology: 'Keyser & de Houtman. The phoenix, reborn from its own ashes.' },
  Pic: { summary: 'A faint southern constellation beside Canopus, home to Beta Pictoris and its famous debris disc.', mythology: 'Lacaille, representing a painter’s easel.' },
  Psc: { summary: 'A large, faint zodiac constellation. Its western fish is marked by the "Circlet" of stars below Pegasus.', mythology: 'Ptolemy. Aphrodite and Eros transformed into fish, tied together by a cord, to escape the monster Typhon. The vernal equinox currently lies within its borders.' },
  PsA: { summary: 'A small constellation whose one bright star, Fomalhaut, stands alone in an otherwise empty stretch of autumn sky.', mythology: 'Ptolemy. The "southern fish", shown drinking the stream poured from the water jar of Aquarius.' },
  Pup: { summary: 'A bright section of the southern Milky Way, thick with open clusters.', mythology: 'The stern of Argo Navis, separated out by Lacaille.' },
  Pyx: { summary: 'A small faint constellation beside Puppis.', mythology: 'Lacaille, representing a mariner’s compass, a nautical instrument placed near the dismembered ship Argo.' },
  Ret: { summary: 'A small southern constellation near the Large Magellanic Cloud.', mythology: 'Lacaille, named for the reticle, the eyepiece grid he used to measure star positions.' },
  Sge: { summary: 'The third-smallest constellation, a small but genuinely arrow-shaped group in the Milky Way.', mythology: 'Ptolemy. An arrow, variously the one Heracles used to kill the eagle tormenting Prometheus, or a shaft of Eros.' },
  Sgr: {
    summary: 'Contains the "Teapot" asterism and the direction of the centre of our galaxy, making it the richest region of the Milky Way.',
    mythology: 'Ptolemy. An archer centaur, drawn from a Babylonian figure, with his bow aimed at the heart of Scorpius.',
    findIt: 'Low in the south on summer evenings from northern latitudes, look for a teapot shape with the Milky Way rising from its spout like steam.'
  },
  Sco: {
    summary: 'A genuinely scorpion-shaped constellation with red supergiant Antares at its heart and a curling tail of bright stars.',
    mythology: 'Ptolemy. The scorpion that killed Orion. Antares means "rival of Ares", a red star as fierce-looking as the planet Mars.'
  },
  Scl: { summary: 'A faint constellation containing the south galactic pole, so it offers a clear view out of our galaxy.', mythology: 'Lacaille, representing a sculptor’s studio.' },
  Sct: { summary: 'A small but bright Milky Way constellation containing the Wild Duck Cluster.', mythology: 'Hevelius, who named it for the coat of arms of King John III Sobieski of Poland after his victory at Vienna in 1683, one of the few constellations honouring a historical event.' },
  Ser: { summary: 'The only constellation split into two separate pieces: Serpens Caput (the head) and Serpens Cauda (the tail), on either side of Ophiuchus.', mythology: 'Ptolemy. The serpent held by the healer Asclepius; the snake shedding its skin symbolised renewal and healing.' },
  Sex: { summary: 'A very faint constellation on the celestial equator below Leo.', mythology: 'Hevelius, commemorating the large sextant he used for measuring star positions, destroyed in a fire at his observatory in 1679.' },
  Tau: {
    summary: 'Contains two of the finest naked-eye star clusters, the Pleiades and the Hyades, plus orange Aldebaran and the Crab Nebula.',
    mythology: 'Ptolemy, though the bull is far older. It appears in Babylonian records and is among the oldest identified constellations. Zeus took the form of a white bull to carry Europa across the sea.',
    findIt: 'Follow Orion’s belt up and to the right to reach orange Aldebaran; the fuzzy knot of stars beyond it is the Pleiades.'
  },
  Tel: { summary: 'A faint southern constellation below Sagittarius.', mythology: 'Lacaille, representing an aerial telescope of the kind used in the 17th century.' },
  Tri: { summary: 'A small but distinct triangle north of Aries, containing the Triangulum Galaxy.', mythology: 'Ptolemy. Its simple shape was linked by the Greeks to the delta of the Nile and to the letter delta.' },
  TrA: { summary: 'A small southern triangle, brighter and more obvious than its northern namesake.', mythology: 'Keyser & de Houtman, though a southern triangle had appeared on earlier charts.' },
  Tuc: { summary: 'Contains the Small Magellanic Cloud and 47 Tucanae, one of the finest globular clusters in the sky.', mythology: 'Keyser & de Houtman. The toucan, a bird from the Americas rather than the East Indies route the navigators actually sailed.' },
  UMa: {
    summary: 'Contains the Big Dipper (the Plough), the best-known star pattern in the northern sky and the key to finding Polaris.',
    mythology: 'Ptolemy. The nymph Callisto, transformed into a bear by a jealous Hera and placed in the sky by Zeus. Many unrelated cultures independently saw a bear here, and several also saw the three handle stars as hunters pursuing it.',
    findIt: 'Seven bright stars forming a saucepan. The two stars at the end of the bowl point straight at Polaris.'
  },
  UMi: {
    summary: 'The Little Dipper, with Polaris, the North Star, at the end of its handle.',
    mythology: 'Ptolemy. Usually Arcas, son of Callisto, placed in the sky beside his transformed mother. Polaris sits within about a degree of the north celestial pole today, but precession means it has not always been the pole star and will not remain so.',
    findIt: 'Use the two "pointer" stars at the end of the Big Dipper’s bowl; they lead straight to Polaris.'
  },
  Vel: { summary: 'A bright southern Milky Way constellation containing the Vela supernova remnant and the Eight-Burst Nebula.', mythology: 'The sails of Argo Navis, separated out by Lacaille.' },
  Vir: { summary: 'The second-largest constellation, marked by bright Spica and containing the enormous Virgo Cluster of galaxies.', mythology: 'Ptolemy. A maiden associated with harvest and justice, variously Demeter, Persephone or Astraea. Spica means "ear of grain", the sheaf she holds.' },
  Vol: { summary: 'A small southern constellation next to the Large Magellanic Cloud.', mythology: 'Keyser & de Houtman. The flying fish, which the Dutch navigators saw leaping alongside their ships in tropical waters.' },
  Vul: { summary: 'A faint constellation inside the Summer Triangle, containing the Dumbbell Nebula.', mythology: 'Hevelius, who introduced it as "the little fox with the goose"; the goose was later dropped from the name.' }
}

/**
 * Beginner-facing notes for individual objects. Purely descriptive: brightness,
 * distance and position always come from the catalogues and the ephemeris.
 */
export const OBJECT_NOTES: Record<string, string> = {
  // --- stars (keyed on proper name) ---
  Sirius: 'The brightest star in the night sky, and one of the closest. Its low altitude from many locations makes it flash through vivid colours as the atmosphere splits its light.',
  Canopus: 'The second-brightest star, a distant white supergiant. It is a familiar sight from the southern hemisphere but never rises from most of Europe and North America.',
  Arcturus: 'An orange giant, and the brightest star in the northern celestial hemisphere. It is moving rapidly across the sky compared with most stars.',
  'Rigel Kentaurus': 'Part of the Alpha Centauri system, the closest star system to the Sun. What looks like a single star is a close pair, with the faint red dwarf Proxima Centauri orbiting further out.',
  Vega: 'A hot, fast-spinning white star that served as the original zero-point of the magnitude scale. It was the pole star around 12 000 BCE and will be again in roughly 13 000 years.',
  Capella: 'Actually two pairs of stars, four in total. The bright pair are both yellow giants, giving Capella a colour much like the Sun’s.',
  Rigel: 'A blue supergiant, and the brightest star in Orion despite carrying the "beta" designation. It is tens of thousands of times more luminous than the Sun.',
  Procyon: 'A nearby star with a white dwarf companion, forming the third corner of the Winter Triangle with Sirius and Betelgeuse.',
  Achernar: 'The flattened end of the river Eridanus. It spins so fast that it is markedly oblate rather than spherical.',
  Betelgeuse: 'A red supergiant so large it would swallow the inner Solar System. Its brightness varies noticeably, and it is expected to end as a supernova, though on an astronomical timescale rather than a human one.',
  Hadar: 'A hot blue giant that acts, with Alpha Centauri, as a pointer to the Southern Cross.',
  Altair: 'One of the fastest-rotating bright stars known, spinning so quickly that it is visibly flattened. It marks the southern corner of the Summer Triangle.',
  Aldebaran: 'An orange giant that appears to sit among the Hyades cluster but is actually much closer, lying in the same line of sight by chance.',
  Antares: 'A red supergiant at the heart of the Scorpion, comparable in size to Betelgeuse and similarly variable.',
  Spica: 'A close pair of hot blue stars orbiting every four days, so near to each other that their mutual gravity distorts them into egg shapes.',
  Pollux: 'The brighter of the twins, an orange giant with a confirmed planet in orbit.',
  Fomalhaut: 'A young star surrounded by a prominent ring of dust and debris, one of the first such discs ever imaged directly.',
  Deneb: 'One of the most luminous stars visible to the naked eye. It appears no brighter than its neighbours only because it is far more distant.',
  Regulus: 'The "little king", lying almost exactly on the ecliptic, so the Moon and planets pass close to it regularly.',
  Castor: 'A remarkable system of six stars in three gravitationally bound pairs.',
  Polaris: 'The current North Star. It sits within about a degree of the north celestial pole, so it barely moves through the night while everything else wheels around it.',
  Mizar: 'The middle star of the Big Dipper’s handle. Its faint neighbour Alcor makes a classic naked-eye test of sharp vision, and Mizar itself was the first star discovered to be a telescopic double.',
  Algol: 'An eclipsing binary. Every 2.87 days one star passes in front of the other and the pair visibly dims for several hours.',
  Alphard: 'The "solitary one", an orange giant in an otherwise empty stretch of sky.',
  // --- deep sky (keyed on primary common name) ---
  'Andromeda Galaxy': 'The nearest large spiral galaxy and the most distant object visible to the unaided eye. It is approaching the Milky Way and the two will eventually merge.',
  'Orion Nebula': 'A vast star-forming region visible as the fuzzy middle "star" of Orion’s sword. Thousands of young stars are being born inside it.',
  Pleiades: 'A young open cluster, easily seen as a small dipper-shaped knot of stars. Most people see six stars; sharp eyes under dark skies see more.',
  'Crab Nebula': 'The expanding wreckage of a star that exploded in 1054 CE, an event recorded by Chinese and Japanese astronomers as a "guest star" bright enough to see in daylight.',
  'Hercules Globular Cluster': 'A ball of several hundred thousand ancient stars, and the finest globular cluster visible from northern latitudes.',
  'Ring Nebula': 'A dying Sun-like star that has shed its outer layers, leaving a glowing smoke ring around a fading white dwarf.',
  'Whirlpool Galaxy': 'A face-on spiral caught interacting with a smaller companion galaxy, its arms drawn out by the encounter.',
  'Triangulum Galaxy': 'The third-largest galaxy in our Local Group. Large but diffuse, it needs genuinely dark skies to see.',
  'Lagoon Nebula': 'A bright star-forming cloud in Sagittarius, visible to the naked eye from dark sites as a patch of light in the Milky Way.',
  'Dumbbell Nebula': 'One of the brightest planetary nebulae, and an easy target for small telescopes.',
  'Beehive Cluster': 'An open cluster that appears as a hazy patch to the naked eye. Galileo was the first to resolve it into stars.',
  'Omega Centauri': 'By far the largest globular cluster in the Milky Way, containing millions of stars, possibly the stripped core of a small galaxy the Milky Way absorbed.',
  '47 Tucanae': 'The second-brightest globular cluster in the sky, a dense southern showpiece.',
  'Sombrero Galaxy': 'An edge-on galaxy crossed by a striking dark dust lane.',
  'Double Cluster': 'A pair of young open clusters side by side in Perseus, best seen with binoculars at low magnification.'
}

/**
 * Black-hole systems.
 *
 * Positions and magnitudes come from SIMBAD (see scripts/build-data.mjs); the text
 * below is editorial. Masses and distances are quoted as published estimates and are
 * deliberately hedged, because for most of these objects the error bars are large.
 */
export const BLACK_HOLE_NOTES: Record<string, string> = {
  'Cygnus X-1':
    'The first object widely accepted as a black hole. What you can actually see is HDE 226868, a blue supergiant of about magnitude 8.9 and within reach of binoculars, orbiting an unseen companion of roughly 21 solar masses. The black hole itself emits no light; it is detected by the X-rays from material being torn off its companion.',
  'V404 Cygni':
    'A black hole of roughly nine solar masses that spends most of its time quiet, then erupts. Its 2015 outburst made it one of the brightest X-ray sources in the sky for several weeks before it faded again.',
  'GRO J1655-40':
    'A microquasar: a stellar-mass black hole that launches jets of material at close to the speed of light. It is moving through the galaxy unusually fast, which suggests it was kicked when the star that formed it exploded.',
  'A0620-00':
    'One of the nearest black holes to Earth, roughly three thousand light-years away in Monoceros. It flared dramatically in 1975 and has been quiet ever since; only the faint orange companion star remains visible.',
  'GRS 1915+105':
    'A microquasar whose jets appear to move faster than light. They do not. It is a perspective illusion caused by material moving toward us at very nearly light speed, but it was the first object where the effect was seen in our own galaxy.',
  'XTE J1118+480':
    'Unusual for sitting far above the plane of the Milky Way, out in the galactic halo. That position is hard to explain unless the system was flung there, or formed somewhere very different.',
  'GX 339-4':
    'A recurring transient in Ara that brightens every few years, making it one of the most closely studied black-hole binaries in the sky.',
  'MAXI J1820+070':
    'Discovered in outburst in 2018, when it briefly became one of the brightest X-ray sources in the sky. Telescopes tracked its jets visibly moving across the sky over the following weeks.',
  'LMC X-1':
    'A black hole in the Large Magellanic Cloud, our satellite galaxy, and one of the first found outside the Milky Way. It draws material from a hot, massive companion star.',
  'LMC X-3':
    'A second black-hole binary in the Large Magellanic Cloud, and an important early case for measuring how much mass a compact object can have and still not be a neutron star.',
  'SS 433':
    'A microquasar with two jets that wobble through a full circle every 162 days, painting a corkscrew across the sky. The nature of its compact object was argued over for decades and is now generally taken to be a black hole.',
  'Gaia BH1':
    'A "dormant" black hole, found not by X-rays but by the wobble it forces on an ordinary Sun-like star. ESA’s Gaia mission spotted the motion; nothing is falling in, so the system is otherwise silent. It is currently the closest black hole known to Earth.',
  'Sagittarius A*':
    'The supermassive black hole at the centre of the Milky Way, about four million times the mass of the Sun and some twenty-six thousand light-years away. Decades of tracking stars whipping around it earned the 2020 Nobel Prize, and the Event Horizon Telescope released an image of its shadow in 2022. Thick dust hides it completely at visible wavelengths, so the position here is exact, but there is nothing to see through a telescope.',
  'M87*':
    'The first black hole ever imaged, released by the Event Horizon Telescope in 2019. It sits at the heart of the giant elliptical galaxy M87 in Virgo and weighs several billion solar masses. The galaxy itself is an easy target in a modest telescope; the black hole announces itself through a jet of plasma thousands of light-years long.',
  '3C 273':
    'The first object ever recognised as a quasar, in 1963, and still the optically brightest one in our sky at around magnitude 13, genuinely reachable with a large amateur telescope. Its light set out roughly two and a half billion years ago.',
  'OJ 287':
    'Believed to hold two supermassive black holes orbiting one another. The smaller one crashes through the larger one’s accretion disc roughly every twelve years, producing flares that astronomers can predict years ahead.',
  'TON 618':
    'One of the most massive black holes known anywhere, powering a quasar so luminous it was catalogued as a faint blue star before anyone realised what it was. Mass estimates run into the tens of billions of solar masses, with large uncertainties.'
}

/** Planet descriptions. Physical data is quoted from NASA fact sheets in the details panel. */
export const PLANET_NOTES: Record<string, string> = {
  Mercury: 'The smallest planet and the closest to the Sun. It never strays far from the Sun in our sky, so it is only visible briefly after sunset or before sunrise.',
  Venus: 'The brightest planet by a wide margin, often mistaken for an aircraft or a UFO. A runaway greenhouse effect makes its surface hotter than Mercury’s.',
  Mars: 'Visibly orange to the naked eye. Its brightness changes dramatically depending on where Earth and Mars are in their orbits.',
  Jupiter: 'The largest planet. Its four big moons, discovered by Galileo, are visible in binoculars and shift position from night to night.',
  Saturn: 'Its rings are visible in almost any telescope and are the classic first "wow" of amateur astronomy.',
  Uranus: 'Just barely visible to the naked eye under excellent conditions, and the first planet discovered with a telescope.',
  Neptune: 'Never visible without optical aid. It was found by mathematical prediction from irregularities in the orbit of Uranus.',
  Pluto: 'Reclassified as a dwarf planet in 2006. Far too faint for the naked eye.',
  Sun: 'Our own star. Never look directly at the Sun, and never point binoculars or a telescope anywhere near it without a purpose-made solar filter.',
  Moon: 'Earth’s only natural satellite. Its phase changes over about 29.5 days, and a bright Moon washes out fainter objects across the whole sky.'
}
