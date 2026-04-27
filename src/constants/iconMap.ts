import type { TaskType } from '../types/taskTemplate';
import worldBg from '../assets/icons/background-worldView.svg';
import logoClosed from '../assets/icons/logo_canClosed.svg';
import logoUser from '../assets/icons/logo_.svg';
import resourceAccounts from '../assets/icons/resource-accounts.svg';
import resourceContacts from '../assets/icons/resource-contacts.svg';
import resourceDocs from '../assets/icons/resource-docs.svg';
import resourceHomes from '../assets/icons/resource-homes.svg';
import resourceInventory from '../assets/icons/resource-inventory.svg';
import resourceVehicles from '../assets/icons/resource-vehicles.svg';
import statAgility from '../assets/icons/stat-agility.svg';
import statCharisma from '../assets/icons/stat-charisma.svg';
import statDefense from '../assets/icons/stat-defense.svg';
import statHealth from '../assets/icons/stat-health.svg';
import statStrength from '../assets/icons/stat-strength.svg';
import statWisdom from '../assets/icons/stat-wisdom.svg';
import taskCheck from '../assets/icons/task-check.svg';
import taskChecklist from '../assets/icons/task-checklist.svg';
import taskChoice from '../assets/icons/task-choice.svg';
import taskCircuit from '../assets/icons/task-circuit.svg';
import taskCounter from '../assets/icons/task-counter.svg';
import taskDuration from '../assets/icons/task-duration.svg';
import taskForm from '../assets/icons/task-form.svg';
import taskLocationPoint from '../assets/icons/task-location_point.svg';
import taskLocationTrail from '../assets/icons/task-location_trail.svg';
import taskLog from '../assets/icons/task-log.svg';
import taskRating from '../assets/icons/task-rating.svg';
import taskRoll from '../assets/icons/task-roll.svg';
import taskScan from '../assets/icons/task-scan.svg';
import taskSetRep from '../assets/icons/task-setRep.svg';
import taskText from '../assets/icons/task-text.svg';
import taskTimer from '../assets/icons/task-timer.svg';
import menuTasks from '../assets/icons/menu-tasks.svg';

// ICON MAP - D93
// Single source of truth: icon key string -> visual representation.
// LOCAL can now resolve either emoji or imported SVG asset URLs.

export const ICON_MAP: Record<string, string> = {
  // task types
  'task-type-check': taskCheck,
  'task-type-counter': taskCounter,
  'task-type-sets-reps': taskSetRep,
  'task-type-circuit': taskCircuit,
  'task-type-duration': taskDuration,
  'task-type-timer': taskTimer,
  'task-type-rating': taskRating,
  'task-type-text': taskText,
  'task-type-form': taskForm,
  'task-type-choice': taskChoice,
  'task-type-checklist': taskChecklist,
  'task-type-scan': taskScan,
  'task-type-log': taskLog,
  'task-type-location-point': taskLocationPoint,
  'task-type-location-trail': taskLocationTrail,
  'task-type-roll': taskRoll,
  check: taskCheck,
  counter: taskCounter,
  rating: taskRating,
  text: taskText,
  choice: taskChoice,
  checklist: taskChecklist,
  'checklist-legacy': '☑️',
  log: taskLog,
  sets_reps: taskSetRep,
  circuit: taskCircuit,
  duration: taskDuration,
  timer: taskTimer,
  form: taskForm,
  scan: taskScan,
  location_point: taskLocationPoint,
  location_trail: taskLocationTrail,
  roll: taskRoll,
  // categories
  health: statHealth,
  food: '🍎',
  fitness: '💪',
  mindfulness: '🧘',
  nutrition: '🥗',
  home: resourceHomes,
  vehicle: resourceVehicles,
  work: '💼',
  admin: '📁',
  finance: '💰',
  social: '👥',
  learning: '📚',
  'category-health': '❤️',
  'category-fitness': '💪',
  'category-nutrition': '🥗',
  'category-mindfulness': '🧘',
  'category-home': '🏠',
  'category-admin': '📁',
  'category-social': '👥',
  'category-learning': '📚',
  // stats
  strength: statStrength,
  agility: statAgility,
  defense: statDefense,
  charisma: statCharisma,
  wisdom: statWisdom,
  'user-default': logoUser,
  'logo-open': logoUser,
  'logo-closed': logoClosed,
  'bg-world': worldBg,
  'stat-health': statHealth,
  'stat-strength': statStrength,
  'stat-agility': statAgility,
  'stat-defense': statDefense,
  'stat-charisma': statCharisma,
  'stat-wisdom': statWisdom,
  // resource types
  'resource-contact': resourceContacts,
  'resource-home': resourceHomes,
  'resource-vehicle': resourceVehicles,
  'resource-account': resourceAccounts,
  'resource-inventory': resourceInventory,
  'resource-doc': resourceDocs,
  'resource-document': resourceDocs,
  // gear slots
  head: '🧢',
  body: '👕',
  hand: '🧤',
  feet: '👢',
  accessory: '💍',
  // events and routines
  routine: '🔄',
  event: '📅',
  calendar: '📅',
  welcome: '👋',
  quest: '🎯',
  task: menuTasks,
  'resource-task': '📦',
  coach: '🐸',
  daily: '☀️',
  'boost-early-bird': '🌅',
  'boost-late-night': '🌙',
  'boost-streak': '🔥',
  'boost-roll': '🎲',
  // act types
  'act-onboarding': '🐸',
  'act-daily': '☀️',
  'act-health': '❤️',
  'act-strength': '⚔️',
  'act-agility': '⚡',
  'act-defense': '🛡️',
  'act-charisma': '💬',
  'act-wisdom': '🔮',
  // chain types
  chain: '🔗',
  'chain-daily': '📅',
  'chain-stat': '📊',
  // gear assets
  'gear:gear-starter-hat': '🧢',
  'gear:gear-work-shirt': '👕',
  'gear:gear-adventurer-jacket': '🧥',
  'gear:gear-work-gloves': '🧤',
  'gear:gear-streak-gloves': '🥊',
  'gear:gear-veteran-boots': '👢',
  'gear:gear-endurance-boots': '👟',
  'gear:gear-legendary-crown': '👑',
  'gear:gear-task-master-ring': '💍',
  'gear:gear-all-rounder-amulet': '📿',
  'gear:gear-coach-drop-ribbon': '🎀',
  'gear:gear-cap': '🧢',
  'gear:gear-bandana': '🧣',
  'gear:gear-tshirt': '👕',
  'gear:gear-hoodie': '🧥',
  'gear:gear-gloves': '🧤',
  'gear:gear-wristband': '💪',
  'gear:gear-sneakers': '👟',
  'gear:gear-boots': '🥾',
  'gear:gear-watch': '⌚',
  'gear:gear-ring': '💍',
  'gear:gear-chain': '📿',
  // stake tiers
  'stake-forest': '⛺️',
  'stake-grove': '🌲',
  'stake-sapling': '🌳',
  'stake-sprout': '🌿',
  'stake-seed': '🌱',
  // ui controls
  star: '⭐',
  'star-outline': '☆',
  close: '✕',
  expand: '▼',
  collapse: '▲',
  add: '+',
  edit: '✏️',
  delete: '🗑️',
  lock: '🔒',
  unlock: '🔓',
  splash: '🐸💦',
  // resources & roles
  contact: resourceContacts,
  account: resourceAccounts,
  inventory: resourceInventory,
  doc: resourceDocs,
  document: resourceDocs,
  birthday: '🎂',
  chore: '🧹',
  resource: '📦',
  badge: '🏆',
  equipment: '🎒',
  // weather
  'weather-clear': '☀️',
  'weather-partly-cloudy': '🌤️',
  'weather-overcast': '☁️',
  'weather-fog': '🌫️',
  'weather-drizzle': '🌦️',
  'weather-rain': '🌧️',
  'weather-snow': '❄️',
  'weather-showers': '🌩️',
  'weather-thunderstorm': '⛈️',
  'weather-unknown': '🌡️',
  // time-of-day
  morning: '🌅',
  night: '🌙',
  rainbow: '🌈',
  // xp / progression
  gold: '🪙',
  xp: '✨',
  streak: '🔥',
  level: '⬆️',
  boost: '⚡',
  glow: '💫',
  // item library — facility
  'item-bed': '🛏️',
  'item-sofa': '🛋️',
  'item-desk': '🖥️',
  'item-fridge': '🧊',
  'item-stove': '🍳',
  'item-oven': '🍳',
  'item-washer': '🫧',
  'item-washing-machine': '🫧',
  'item-dryer': '🌀',
  'item-lawnmower': '🌿',
  'item-car': '🚗',
  'item-bicycle': '🚲',
  'item-gym-equipment': '🏋️',
  'item-garden': '🌱',
  'item-shower': '🚿',
  // item library — consumable
  'item-water': '💧',
  'item-coffee': '☕',
  'item-coffee-beans': '☕',
  'item-onion': '🧅',
  'item-bread': '🍞',
  'item-eggs': '🥚',
  'item-milk': '🥛',
  'item-fruit': '🍎',
  'item-vegetables': '🥦',
  'item-protein': '🥩',
  'item-supplements': '💊',
  'item-cooking-oil': '🫙',
  'item-cleaning-supplies': '🧴',
  'item-laundry-detergent': '🫧',
  'item-toilet-paper': '🧻',
  'item-bin-bags': '🗑️',
  'item-trash-bags': '🗑️',
  'item-soap': '🧼',
  'item-shampoo': '🚿',
  'item-toothpaste': '🦷',
  'item-medication': '💊',
  // clothing
  tshirt: '👕',
  pants: '👖',
  shorts: '🩳',
  dress: '👗',
  jacket: '🧥',
  coat: '🧥',
  hoodie: '🧥',
  socks: '🧦',
  underwear: '🩲',
  shoes: '👞',
  boots: '🥾',
  sneakers: '👟',
  hat: '👒',
  cap: '🧢',
  gloves: '🧤',
  scarf: '🧣',
  swimsuit: '🩱',
  suit: '🤵',
  tie: '👔',
  belt: '🪢',
  backpack: '🎒',
  handbag: '👜',
  wallet: '👛',
  sunglasses: '🕶️',
  watch: '⌚',
  // electronics
  laptop: '💻',
  desktop: '🖥️',
  monitor: '🖥️',
  keyboard: '⌨️',
  mouse: '🖱️',
  phone: '📱',
  tablet: '📲',
  charger: '🔌',
  cable: '🔌',
  headphones: '🎧',
  earbuds: '🎧',
  speaker: '🔊',
  camera: '📷',
  tv: '📺',
  remote: '🎛️',
  battery: '🔋',
  flashlight: '🔦',
  printer: '🖨️',
  router: '📡',
  gamepad: '🎮',
  smartwatch: '⌚',
  // tools
  hammer: '🔨',
  screwdriver: '🪛',
  drill: '🛠️',
  wrench: '🔧',
  pliers: '🗜️',
  saw: '🪚',
  toolbox: '🧰',
  'tape-measure': '📏',
  // level key already exists above and is reused in the picker
  paintbrush: '🖌️',
  roller: '🧽',
  ladder: '🪜',
  shovel: '🛠️',
  rake: '🍂',
  hose: '🪢',
  lawnmower: '🚜',
  chainsaw: '🪚',
  axe: '🪓',
  crowbar: '🔩',
  clamp: '🗜️',
  // furniture
  armchair: '🪑',
  couch: '🛋️',
  bed: '🛏️',
  desk: '🪑',
  table: '🪵',
  'dining-table': '🍽️',
  nightstand: '🗄️',
  dresser: '🗄️',
  wardrobe: '🚪',
  bookshelf: '📚',
  shelf: '🪜',
  cabinet: '🗄️',
  bench: '🪑',
  stool: '🪑',
  ottoman: '🪑',
  crib: '🛏️',
  'bunk-bed': '🛏️',
  'coffee-table': '☕',
  'side-table': '🪵',
  'tv-stand': '📺',
  // kitchen expanded
  pot: '🍲',
  pan: '🍳',
  knife: '🔪',
  'cutting-board': '🪵',
  blender: '🥤',
  toaster: '🍞',
  kettle: '🫖',
  microwave: '📻',
  oven: '🔥',
  fridge: '🧊',
  dishwasher: '🍽️',
  plate: '🍽️',
  bowl: '🥣',
  cup: '🥤',
  mug: '☕',
  glass: '🥛',
  fork: '🍴',
  spoon: '🥄',
  spatula: '🍳',
  whisk: '🥄',
  colander: '🍜',
  'baking-tray': '🧁',
  'rolling-pin': '🥖',
  grater: '🧀',
  peeler: '🔪',
  'rice-cooker': '🍚',
  'air-fryer': '🍟',
  'instant-pot': '🍲',
  // storage and containers
  bin: '🗑️',
  box: '📦',
  basket: '🧺',
  drawer: '🗄️',
  'shelf-unit': '🪜',
  rack: '🧱',
  hook: '🪝',
  hanger: '🪝',
  organizer: '🗂️',
  tote: '🛍️',
  crate: '🧺',
  trunk: '🧰',
  safe: '🔐',
  'filing-cabinet': '🗄️',
  'magazine-rack': '📰',
  // office and work
  pen: '🖊️',
  pencil: '✏️',
  notebook: '📓',
  folder: '📁',
  binder: '📚',
  stapler: '📎',
  scissors: '✂️',
  tape: '📏',
  paperclip: '📎',
  ruler: '📏',
  calculator: '🧮',
  lamp: '💡',
  clock: '🕒',
  // calendar key already exists above and is reused in the picker
  whiteboard: '🪧',
  corkboard: '📌',
  'inbox-tray': '📥',
  // general
  default: '📌',
};

export function resolveIcon(key: string | null | undefined): string {
  if (!key) return ICON_MAP.default;
  if (key.startsWith('icon:ach-') || key.startsWith('sticker:ach-')) return '🏅';
  return ICON_MAP[key.toLowerCase()] ?? key;
}

export function getTaskTypeIconKey(taskType: TaskType): string {
  return `task-type-${taskType.toLowerCase().replace(/_/g, '-')}`;
}

const LEGACY_TASK_TEMPLATE_ICON_MAP: Record<string, string> = {
  check: 'task-type-check',
  counter: 'task-type-counter',
  sets_reps: 'task-type-sets-reps',
  circuit: 'task-type-circuit',
  duration: 'task-type-duration',
  timer: 'task-type-timer',
  rating: 'task-type-rating',
  text: 'task-type-text',
  form: 'task-type-form',
  choice: 'task-type-choice',
  checklist: 'task-type-checklist',
  scan: 'task-type-scan',
  log: 'task-type-log',
  location_point: 'task-type-location-point',
  location_trail: 'task-type-location-trail',
  roll: 'task-type-roll',
};

export function normalizeTaskTemplateIconKey(iconKey: string, taskType?: TaskType): string {
  const normalized = iconKey.toLowerCase();
  if (normalized in LEGACY_TASK_TEMPLATE_ICON_MAP) {
    return LEGACY_TASK_TEMPLATE_ICON_MAP[normalized];
  }
  if (!iconKey && taskType) {
    return getTaskTypeIconKey(taskType);
  }
  return iconKey;
}

export function isImageIcon(value: string | null | undefined): value is string {
  if (!value) return false;
  return value.endsWith('.svg')
    || value.startsWith('data:')
    || value.startsWith('/')
    || value.startsWith('./')
    || value.startsWith('../')
    || value.startsWith('blob:')
    || value.startsWith('http://')
    || value.startsWith('https://');
}
