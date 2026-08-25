/**
 * Objectionable-content screening for everything a user can publish: community
 * board posts, replies, and the public username shown next to them.
 *
 * App Store Guideline 1.2 requires "a method for filtering objectionable
 * content" on top of the report/block mechanisms and the moderation queue.
 * This is that method. It runs BEFORE anything is written, so the worst
 * material never reaches the database, and it is the only filter that also
 * covers users with `boardAutoApprove` — who otherwise skip the human queue
 * entirely and would be an unfiltered path straight to the live board.
 *
 * Three verdicts, deliberately:
 *   - "block"  — refuse the write outright (slurs, sexual content, threats).
 *   - "review" — accept it but force it into the moderation queue, overriding
 *                auto-approve. Used for ordinary profanity and spam signals,
 *                where a human should decide rather than a word list.
 *   - "allow"  — nothing matched; normal rules apply.
 *
 * The matcher is not trying to be clever. Evasion (leetspeak, padding, spaced-
 * out letters) is normalised away, but the word lists are kept narrow on
 * purpose: a false positive on the block tier silently eats a legitimate post
 * about groceries, which is worse than letting a borderline one reach a human.
 */

export type ContentVerdict = "allow" | "review" | "block";

export interface ContentScreening {
  verdict: ContentVerdict;
  /** Human-readable reason, safe to return to the client. Null when allowed. */
  reason: string | null;
  /** Which rules fired, for the moderation record. Never echoed to the client. */
  matched: string[];
}

const BLOCK_MESSAGE =
  "That wording isn't allowed here. TimetoPay has no tolerance for hateful, sexual, " +
  "threatening or abusive content. Please rewrite it and try again.";

const USERNAME_MESSAGE = "That username isn't available. Please choose another.";

/** Characters people substitute to slip past a naive word list. */
const LEET: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a",
  "5": "s", "$": "s", "7": "t", "8": "b", "@": "a", "+": "t",
};

/** Collapse repeated letters ("shiiiit" → "shit", "fuuuck" → "fuck"). */
function collapse(word: string): string {
  return word.replace(/(.)\1+/g, "$1");
}

/**
 * Two normalised views of the text, because they catch different evasions:
 *   `words`    — diacritics stripped, leet folded, split on non-letters. Word
 *                matching here can't produce a Scunthorpe-style false positive.
 *   `squashed` — everything that isn't a letter removed and repeated letters
 *                collapsed, so "f-u-c-k", "f u c k" and "fuuuuck" all land on
 *                the same string. Only distinctive patterns are matched against
 *                this view, since substring matching on it WILL over-match.
 */
function normalize(raw: string): Normalized {
  const folded = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const deLeet = Array.from(folded).map((c) => LEET[c] ?? c).join("");
  const words = deLeet.split(/[^a-z]+/).filter(Boolean);
  const letters = deLeet.replace(/[^a-z]/g, "");

  return { words, despaced: despace(words), letters, squashed: collapse(letters) };
}

/**
 * Join runs of three or more single-letter "words" back into one token, so
 * "f u c k i n g" and "k.i.l.l  y.o.u" are screened as what they are. Three is
 * the threshold because "a", "I" and initials legitimately appear alone, but
 * three consecutive one-letter words in prose is spelling something out.
 *
 * The result is only ever matched by substring — a token that reached here is
 * already evasive, so there is no innocent word for a substring hit to land in.
 */
function despace(words: string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) out.push(run.join(""));
    run = [];
  };
  for (const word of words) {
    if (word.length === 1) run.push(word);
    else flush();
  }
  flush();
  return out;
}

interface Normalized {
  /** Tokens split on non-letters. Safe to match whole-word. */
  words: string[];
  /** Runs of spelled-out single letters rejoined ("f u c k" → "fuck"). */
  despaced: string[];
  /** Every letter, in order, nothing removed. Padding is preserved. */
  letters: string;
  /** `letters` with repeated letters collapsed. */
  squashed: string;
}

/**
 * Build a matcher that finds a term ANYWHERE in a string, tolerating letter
 * padding: "nigger" becomes /n+i+g+g+e+r+/, which matches "niggggger" but not
 * "niger" — the doubled letter still has to be doubled. Used only where
 * substring matching is safe (usernames, and tokens that were already spelled
 * out letter by letter), never on prose, where "analysis" would match "anal".
 */
function buildPaddedMatcher(terms: string[]): (haystack: string) => string[] {
  const patterns = terms.map((term) => ({
    term,
    re: new RegExp(Array.from(term).map((c) => `${c}+`).join("")),
  }));
  return (haystack: string): string[] =>
    patterns.filter((p) => p.re.test(haystack)).map((p) => p.term);
}

/**
 * Build a whole-word matcher that also catches letter-padding, without the
 * collisions that collapsing the dictionary alone would cause.
 *
 * A word matches a term when it is the term outright, or when both collapse to
 * the same string AND the word is at least as long as the term — padding only
 * ever adds letters. That length guard is what keeps "Niger" (5) from matching
 * "nigger" (6) while "niggggger" (9) still does.
 */
function buildWordMatcher(terms: string[]): (word: string) => boolean {
  const exact = new Set(terms);
  const shortestByCollapsed = new Map<string, number>();
  for (const term of terms) {
    const key = collapse(term);
    const prev = shortestByCollapsed.get(key);
    if (prev === undefined || term.length < prev) shortestByCollapsed.set(key, term.length);
  }
  return (word: string): boolean => {
    if (exact.has(word)) return true;
    const shortest = shortestByCollapsed.get(collapse(word));
    return shortest !== undefined && word.length >= shortest;
  };
}

/**
 * Whole-word terms that end the request. Hate slurs, sexual content and
 * explicit threats — the categories Apple names, and the ones no amount of
 * context makes acceptable on a grocery-price board.
 *
 * Terms that are also ordinary English in some register (escort, lynch as a
 * surname, genocide as a topic) live on the review tier instead: a human reads
 * those rather than the post being silently refused.
 */
const BLOCK_TERMS = [
  // Racial / ethnic / religious slurs
  "nigger", "niggers", "nigga", "niggas", "chink", "chinks", "gook", "gooks",
  "spic", "spics", "wetback", "wetbacks", "kike", "kikes", "paki", "pakis",
  "coon", "coons", "raghead", "ragheads", "towelhead", "towelheads",
  "beaner", "beaners", "kaffir", "kafir",
  // Homophobic / transphobic slurs
  "faggot", "faggots", "fag", "fags", "dyke", "dykes", "tranny", "trannies",
  "shemale", "shemales",
  // Ableist slurs
  "retard", "retards", "retarded", "mongoloid",
  // Explicit sexual content
  "porn", "porno", "pornhub", "creampie", "cumshot", "blowjob", "handjob",
  "rimjob", "gangbang", "bukkake", "hentai", "camgirl", "nudes", "onlyfans",
  "milf", "deepthroat", "dildo", "fleshlight", "masturbate", "masturbating",
  "jizz", "cum", "anal",
  // Sexual exploitation of minors — never contextual, never allowed
  "pedo", "pedophile", "paedophile", "loli", "shota", "jailbait",
];

const isBlockedWord = buildWordMatcher(BLOCK_TERMS);
const findBlockedAnywhere = buildPaddedMatcher(BLOCK_TERMS);

/**
 * Patterns matched against the squashed view, for phrases whose letters get
 * split up by the writer. Each has to be distinctive enough that a substring
 * hit is unambiguous — "kill yourself" is; "ass" is not, which is why it lives
 * on the review tier as a whole word instead. Note the view has already had
 * repeated letters collapsed, so these are written single-lettered.
 */
const SQUASHED_BLOCK: { re: RegExp; label: string }[] = [
  { re: /kil(?:your|ur)self/, label: "threat:kill-yourself" },
  { re: /kilyou\b/, label: "threat:kill-you" },
  { re: /childporn/, label: "csam" },
  { re: /chidporn/, label: "csam" },
  { re: /rape(?:you|her|him)/, label: "threat:rape" },
];

/**
 * Whole-word terms that force human review rather than refusal. Ordinary
 * profanity: common enough in a frustrated "this store is a rip-off" post that
 * refusing it outright would be heavy-handed, objectionable enough that a
 * trusted poster shouldn't be able to push it live unseen.
 */
const REVIEW_TERMS = [
  "fuck", "fucking", "fucked", "fucker", "fuckers", "motherfucker",
  "shit", "shitty", "shitting", "bullshit", "bitch", "bitches",
  "bastard", "bastards", "cunt", "cunts", "twat", "twats",
  "asshole", "assholes", "arsehole", "arseholes", "dickhead", "dickheads",
  "prick", "pricks", "wanker", "wankers", "slut", "sluts", "whore", "whores",
  "piss", "pissed", "goddamn", "scumbag", "scumbags",
  "escort", "escorts", "lynch", "genocide",
];

const isReviewWord = buildWordMatcher(REVIEW_TERMS);
const findReviewAnywhere = buildPaddedMatcher(REVIEW_TERMS);

/**
 * Spam signals. The board is regional grocery advice; a post carrying a link,
 * an email address or a phone number is either a scam or an advert often
 * enough that a moderator should see it first. None of these are refusals —
 * a legitimate "this is on the store's site at ..." post is a real thing.
 */
const SPAM_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bhttps?:\/\//i, label: "spam:url" },
  { re: /\bwww\.[a-z0-9-]+\.[a-z]{2,}/i, label: "spam:url" },
  { re: /\b[a-z0-9-]+\.(?:com|net|org|io|shop|store|xyz|top|ru|cn)\b/i, label: "spam:domain" },
  { re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, label: "spam:email" },
  // A phone-number shape, not "nine or more digits": a list of prices is full
  // of digits and separators and would otherwise match every week.
  { re: /(?<!\d)(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/, label: "spam:phone" },
  { re: /\b(?:telegram|whatsapp|wa\.me|t\.me|cash\s?app|venmo|bitcoin|crypto\s?wallet)\b/i, label: "spam:contact" },
  { re: /\b(?:make money fast|work from home|click here|dm me|earn \$\d)/i, label: "spam:solicitation" },
];

/**
 * Screen a piece of user-generated text.
 *
 * Empty/whitespace input is "allow" — length validation is the caller's job and
 * gives a better error message than this ever could.
 */
export function screenContent(raw: string): ContentScreening {
  const text = raw ?? "";
  if (!text.trim()) return { verdict: "allow", reason: null, matched: [] };

  const { words, despaced, squashed } = normalize(text);
  const blocked: string[] = [];

  for (const word of words) {
    if (isBlockedWord(word)) blocked.push(`block:${collapse(word)}`);
  }
  for (const token of despaced) {
    for (const term of findBlockedAnywhere(token)) blocked.push(`block:${term}`);
  }
  for (const { re, label } of SQUASHED_BLOCK) {
    if (re.test(squashed)) blocked.push(label);
  }
  if (blocked.length > 0) {
    return { verdict: "block", reason: BLOCK_MESSAGE, matched: blocked };
  }

  const flagged: string[] = [];
  for (const word of words) {
    if (isReviewWord(word)) flagged.push(`review:${collapse(word)}`);
  }
  for (const token of despaced) {
    for (const term of findReviewAnywhere(token)) flagged.push(`review:${term}`);
  }
  for (const { re, label } of SPAM_PATTERNS) {
    if (re.test(text)) flagged.push(label);
  }
  if (flagged.length > 0) {
    return { verdict: "review", reason: null, matched: flagged };
  }

  return { verdict: "allow", reason: null, matched: [] };
}

/**
 * Grocery words that would otherwise collide with the profanity list once a
 * handle is matched by substring. Only needed for usernames — prose is matched
 * whole-word — and cheap insurance against refusing a handle like "ShiitakeSam".
 */
const USERNAME_FALSE_FRIENDS = ["shiitake", "shitake", "cumin", "assam", "cumberland", "scunthorpe"];
const stripFalseFriends = buildPaddedMatcher(USERNAME_FALSE_FRIENDS);

/**
 * Usernames are public UGC too — they sit next to every post — but they have no
 * moderation queue to fall back on, so there is no "review" tier here: a handle
 * either passes or is refused, and the review-tier profanity list is promoted
 * to a refusal for that reason.
 *
 * A handle is one short token with no separators ("N1gg3rHater"), so unlike
 * prose it has to be matched by substring. That is safe here precisely because
 * there is no surrounding sentence for an innocent word to hide in — only the
 * false friends above, which are removed first.
 */
export function screenUsername(raw: string): ContentScreening {
  // The underscore is the one separator a handle can carry, so treat it as one.
  const spaced = raw.replace(/_/g, " ");
  const { words, letters } = normalize(spaced);

  let residue = letters;
  for (const friend of stripFalseFriends(letters)) {
    residue = residue.replace(new RegExp(Array.from(friend).map((c) => `${c}+`).join(""), "g"), " ");
  }

  const matched: string[] = [];
  for (const word of words) {
    if (isBlockedWord(word)) matched.push(`block:${collapse(word)}`);
    if (isReviewWord(word)) matched.push(`review:${collapse(word)}`);
  }
  for (const term of findBlockedAnywhere(residue)) matched.push(`block:${term}`);
  for (const term of findReviewAnywhere(residue)) matched.push(`review:${term}`);

  if (matched.length > 0) {
    return { verdict: "block", reason: USERNAME_MESSAGE, matched };
  }
  return { verdict: "allow", reason: null, matched: [] };
}
