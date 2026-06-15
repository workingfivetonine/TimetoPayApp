// Ridiculous-username generator + availability checks for the profile onboarding
// step. Usernames are the public handle shown as the author on community posts.
import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const ADJECTIVES = [
  "Soggy", "Waddling", "Grumpy", "Sneaky", "Wobbly", "Sassy", "Bumbling",
  "Cranky", "Goofy", "Sleepy", "Feral", "Majestic", "Rogue", "Spicy",
  "Clumsy", "Dapper", "Squishy", "Frantic", "Mighty", "Drowsy", "Salty",
  "Zesty", "Cosmic", "Disco", "Turbo", "Snazzy", "Plucky", "Noble",
  "Rowdy", "Velvet", "Cheeky", "Bouncy",
];
const NOUNS = [
  "Pickle", "Waffle", "Possum", "Noodle", "Penguin", "Walrus", "Muffin",
  "Goblin", "Pumpkin", "Raccoon", "Biscuit", "Llama", "Pretzel", "Gnome",
  "Otter", "Dumpling", "Hedgehog", "Cactus", "Narwhal", "Wombat", "Burrito",
  "Platypus", "Marshmallow", "Yeti", "Pigeon", "Sloth", "Taco", "Gizmo",
  "Bagel", "Mango", "Pancake", "Gremlin",
];

function pick<T>(arr: T[], n: number): T {
  return arr[Math.abs(n) % arr.length]!;
}

function candidate(entropy: number): string {
  const adj = pick(ADJECTIVES, entropy);
  const noun = pick(NOUNS, Math.floor(entropy / ADJECTIVES.length));
  const num = (entropy % 90) + 10; // 10..99
  return `${adj}${noun}${num}`;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function isValidUsernameFormat(u: string): boolean {
  return USERNAME_RE.test(u);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.username}) = lower(${username})`)
    .limit(1);
  return rows.length === 0;
}

// Generate a playful username that's currently free. Falls back to a longer
// numeric suffix if the (large) playful space is somehow crowded.
export async function generateUniqueUsername(): Promise<string> {
  for (let i = 0; i < 12; i += 1) {
    const seed = (Date.now() + i * 7919) >>> 0;
    const u = candidate(seed);
    if (await isUsernameAvailable(u)) return u;
  }
  const seed = Date.now() % 100000;
  return `${pick(ADJECTIVES, seed)}${pick(NOUNS, seed >> 3)}${seed}`;
}
