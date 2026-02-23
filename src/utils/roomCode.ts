/**
 * Three-word room code generator for human-friendly PeerJS peer IDs.
 * Format: "word-word-word" (e.g. "peak-mist-bell")
 */

export const WORD_LIST: string[] = [
  // Mountains & terrain
  'peak', 'ridge', 'cliff', 'crag', 'bluff', 'mesa', 'knoll', 'ledge',
  'slope', 'vale', 'gorge', 'ravine', 'canyon', 'summit', 'crest',
  'alpine', 'sierra', 'butte', 'saddle', 'col',

  // Water & weather
  'mist', 'fog', 'rain', 'dew', 'frost', 'sleet', 'hail', 'storm',
  'cloud', 'brook', 'creek', 'river', 'lake', 'pond', 'spring',
  'tide', 'wave', 'surf', 'rapids', 'falls',

  // Sky & light
  'moon', 'sun', 'star', 'dawn', 'dusk', 'glow', 'beam', 'spark',
  'flash', 'gleam', 'shade', 'aurora', 'comet', 'lunar', 'solar',
  'haze', 'prism', 'ray', 'flare', 'ember',

  // Trees & plants
  'pine', 'oak', 'elm', 'birch', 'cedar', 'maple', 'willow', 'aspen',
  'fern', 'moss', 'vine', 'thorn', 'root', 'bark', 'leaf',
  'bloom', 'petal', 'bud', 'reed', 'sage',

  // Animals
  'hawk', 'eagle', 'falcon', 'crane', 'heron', 'swift', 'wren',
  'finch', 'raven', 'owl', 'fox', 'wolf', 'bear', 'deer', 'elk',
  'lynx', 'otter', 'trout', 'bass', 'pike',

  // Rocks & minerals
  'stone', 'rock', 'flint', 'slate', 'quartz', 'jade', 'onyx',
  'cobalt', 'iron', 'copper', 'amber', 'coral', 'pearl', 'opal',
  'agate', 'basalt', 'granite', 'marble', 'shale', 'chalk',

  // Wind & air
  'wind', 'gust', 'gale', 'breeze', 'draft', 'zephyr', 'squall',
  'whirl', 'swirl', 'drift',

  // Nature actions & qualities
  'still', 'calm', 'wild', 'bold', 'bright', 'clear',
  'deep', 'high', 'vast', 'cool', 'warm', 'crisp', 'quiet', 'hush',
  'echo', 'trail', 'path', 'pass', 'ford',

  // Landscape features
  'grove', 'glade', 'marsh', 'moor', 'heath', 'field', 'plain',
  'dune', 'delta', 'shoal', 'fjord', 'inlet', 'cape', 'cove', 'bay',
  'arch', 'cave', 'den', 'nest', 'lair',

  // Seasons & time
  'noon', 'eve', 'night', 'equinox', 'thaw',
  'north', 'south', 'east', 'west',

  // Bell / music themed (fits the game)
  'bell', 'chime', 'tone', 'ring', 'song', 'note', 'chord', 'hymn',
  'drum', 'flute',

  // Additional nature words
  'ash', 'larch', 'spruce', 'lichen', 'holly',
  'snow', 'ice', 'glacier', 'tundra', 'steppe', 'taiga',
  'torrent', 'eddy', 'ripple', 'harbor', 'blaze',
];

/**
 * Picks 3 distinct random words from the word list, joined by hyphens.
 * Valid as a PeerJS custom peer ID (alphanumeric + hyphens).
 */
export function generateRoomCode(): string {
  const indices = new Set<number>();
  while (indices.size < 3) {
    indices.add(Math.floor(Math.random() * WORD_LIST.length));
  }
  const picked = [...indices].map((i) => WORD_LIST[i]);
  return picked.join('-');
}
