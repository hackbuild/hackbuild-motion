// Wardrobe classifier: mesh and material names to a slot label and a
// group, by scored keyword match over name tokens. Whole token matches
// score 3, a key of 4 letters or more inside a token scores 1, so
// "earring" goes to the ear slot and never to the hand slot through "ring".
// Plain data and string work, no three.js.

/** The wardrobe group of a part: clothing, accessory, hair or base. */
export type PartGroup = "clothing" | "accessory" | "hair" | "base";

/** Every wardrobe slot a part can be sorted into, accessories first and the base body last. */
export const SLOT_LABELS = [
  "eyewear", "headwear", "hairAccessory", "neck", "ear", "hand", "prop",
  "outerwear", "onepiece", "top", "bottom", "legwear", "footwear", "underwear",
  "hair", "face", "body",
] as const;
/** One wardrobe slot name from `SLOT_LABELS`. */
export type SlotLabel = (typeof SLOT_LABELS)[number];

const GROUP: Record<SlotLabel, PartGroup> = {
  eyewear: "accessory", headwear: "accessory", hairAccessory: "accessory", neck: "accessory", ear: "accessory", hand: "accessory", prop: "accessory",
  outerwear: "clothing", onepiece: "clothing", top: "clothing", bottom: "clothing", legwear: "clothing", footwear: "clothing", underwear: "clothing",
  hair: "hair", face: "base", body: "base",
};

/** Keywords per slot, including the romanized Japanese names VRoid and Booth models use. */
export const SLOT_KEYWORDS: Record<SlotLabel, readonly string[]> = {
  eyewear: ["glasses", "megane", "goggles", "sunglasses", "eyepatch", "spectacles"],
  headwear: ["hat", "cap", "helmet", "hood", "beret", "crown", "tiara", "bonnet", "beanie", "boushi", "veil"],
  hairAccessory: ["hairpin", "kanzashi", "scrunchie", "hairclip", "hairband", "headband", "kamikazari", "hairtie"],
  neck: ["necklace", "choker", "scarf", "necktie", "tie", "collar", "muffler", "pendant", "bowtie"],
  ear: ["earring", "earrings", "piercing", "mimikazari", "earcuff"],
  hand: ["glove", "gloves", "ring", "bracelet", "tebukuro", "watch", "wristband"],
  prop: ["sword", "staff", "wand", "bag", "umbrella", "weapon", "gun", "book", "phone", "katana", "shield"],
  outerwear: ["coat", "jacket", "haori", "cardigan", "hoodie", "parka", "cape", "cloak", "blazer", "vest", "outer"],
  onepiece: ["dress", "onepiece", "kimono", "yukata", "robe", "gown", "jumpsuit", "overall", "overalls", "leotard"],
  top: ["top", "tops", "shirt", "tshirt", "blouse", "sweater", "tank", "camisole", "sailor", "uwagi"],
  bottom: ["pants", "trousers", "shorts", "skirt", "hakama", "jeans", "bottoms", "bottom", "zubon"],
  legwear: ["socks", "sock", "stocking", "stockings", "tights", "leggings", "kneesocks", "thighhighs", "kutsushita", "pantyhose"],
  footwear: ["shoe", "shoes", "boot", "boots", "sneaker", "sneakers", "sandal", "sandals", "heels", "geta", "kutsu", "zori", "loafers"],
  underwear: ["bra", "panties", "underwear", "shitagi", "bikini", "lingerie"],
  hair: ["hair", "kami", "bangs", "fringe", "ponytail", "twintail", "ahoge", "braid", "maegami", "ushirogami", "yokogami"],
  face: ["face", "head", "eye", "eyes", "eyelash", "eyelashes", "brow", "eyebrow", "teeth", "tongue", "mouth", "iris", "hitomi", "matsuge", "kao"],
  body: ["body", "skin", "torso", "karada", "base"],
};

/** Strips exporter decoration: VRoid prefixes, "(Instance)", copy suffixes. */
export function partLabel(raw: string): string {
  let s = raw.replace(/\s*\(instance\)\s*/gi, "").trim();
  s = s.replace(/^N\d+_\d+_\d+_/, "");
  s = s.replace(/_(CLOTH|SKIN|HAIR|FACE|EYE)$/i, "");
  s = s.replace(/\.\d{3}$/, "");
  s = s.replace(/_\d{2}$/, "");
  return s || raw;
}

/** Lowercase word tokens: camelCase, snake, kebab, dots and digits split. */
export function tokens(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** The wardrobe slot a part name scores best for: group, label and score. */
export interface Category {
  group: PartGroup;
  label: SlotLabel;
  score: number;
}

/** The best slot for a name, or null when no keyword scores. */
export function categorize(name: string): Category | null {
  const toks = tokens(partLabel(name));
  const joined = toks.join("");
  let best: Category | null = null;
  for (const label of SLOT_LABELS) {
    let score = 0;
    for (const key of SLOT_KEYWORDS[label]) {
      if (toks.includes(key)) score = Math.max(score, 3);
      else if (key.length >= 4 && (toks.some((t) => t.includes(key)) || joined === key)) score = Math.max(score, 1);
    }
    if (score > 0 && (!best || score > best.score)) best = { group: GROUP[label], label, score };
  }
  return best;
}

const ALT_SUFFIX = new Set(["down", "up", "on", "off", "open", "closed", "alt", "leg", "rolled", "tucked"]);
const SIDE = new Set(["l", "r", "left", "right"]);

/**
 * Names that are alternates of another present name (`Shorts_down`,
 * `Shorts_on_leg`, `No_stocking_L` beside `Shorts` and `stocking_L`). They
 * start hidden so one garment state shows at a time.
 */
export function alternates(names: readonly string[]): Set<string> {
  const key = (n: string) => tokens(partLabel(n)).filter((t) => !SIDE.has(t));
  const keys = names.map(key);
  const out = new Set<string>();
  names.forEach((n, i) => {
    const k = keys[i]!;
    if (k[0] === "no" && k.length > 1) {
      out.add(n);
      return;
    }
    const isAlt = keys.some((o, j) => j !== i && o.length > 0 && o.length < k.length && o.every((t, x) => k[x] === t) && k.slice(o.length).every((t) => ALT_SUFFIX.has(t)));
    if (isAlt) out.add(n);
  });
  return out;
}

/** Order for toggle lists: clothing first, base last. */
export const GROUP_ORDER: readonly PartGroup[] = ["clothing", "accessory", "hair", "base"];
