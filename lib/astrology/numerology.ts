export type Numerology = {
  mulank: number; // root number, from the day of birth (1-9)
  bhagyank: number; // destiny number, from the full birth date (1-9)
};

export function reduceToDigit(n: number): number {
  let x = Math.abs(n);
  while (x > 9) {
    x = String(x)
      .split("")
      .reduce((sum, d) => sum + Number(d), 0);
  }
  return x;
}

// birthDate is "YYYY-MM-DD".
export function computeNumerology(birthDate: string): Numerology {
  const [, , dayStr] = birthDate.split("-");
  const day = Number(dayStr);
  const mulank = reduceToDigit(day);

  const digitSum = birthDate
    .replace(/-/g, "")
    .split("")
    .reduce((sum, ch) => sum + Number(ch), 0);
  const bhagyank = reduceToDigit(digitSum);

  return { mulank, bhagyank };
}

// Namank: Pythagorean name number (A=1..I=9, J=1.., reduced to 1-9).
export function computeNameNumber(name: string): number {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  if (!letters) return 0;
  const sum = letters
    .split("")
    .reduce((s, ch) => s + ((ch.charCodeAt(0) - 65) % 9) + 1, 0);
  return reduceToDigit(sum);
}

/**
 * The cycle a person is in this year, by the common Vedic reckoning: birth
 * month plus birth day plus the current calendar year, reduced.
 *
 * It changes once a year, which is why the prompt carries it in the half that
 * varies rather than the cached half.
 */
export function personalYear(birthDate: string, today: string): number {
  const [, bm, bd] = birthDate.split("-").map(Number);
  const year = Number(today.slice(0, 4));
  return reduceToDigit(bm + bd + year);
}

export function personalMonth(birthDate: string, today: string): number {
  const month = Number(today.slice(5, 7));
  return reduceToDigit(personalYear(birthDate, today) + month);
}

/**
 * Both personal-cycle numbers together, from one call.
 *
 * `personalYear` and `personalMonth` take identical arguments and differ only
 * by which function is named, so a caller building `{ year, month }` from two
 * separate positional calls can have them silently transposed — every
 * existing test still passes, because nothing pins which call produced which
 * field. Wrapping the pairing here, in a function a unit test can assert
 * against by name, moves that risk out of every call site.
 */
export function personalCycle(birthDate: string, today: string): { year: number; month: number } {
  return { year: personalYear(birthDate, today), month: personalMonth(birthDate, today) };
}

export type LoShu = {
  /** How many times each digit 1-9 appears in the birth date. */
  counts: Record<number, number>;
  missing: number[];
  repeated: number[];
};

/**
 * Which digits the birth date repeats and which it lacks.
 *
 * This is the most concrete thing numerology has: "three 1s and no 4" is
 * specific in a way "your mulank is 5" can never be. Zeros are not placed on
 * the grid, by the classical arrangement.
 */
export function loShu(birthDate: string): LoShu {
  const counts: Record<number, number> = {};
  for (let d = 1; d <= 9; d++) counts[d] = 0;
  for (const ch of birthDate.replace(/-/g, "")) {
    const d = Number(ch);
    if (d >= 1 && d <= 9) counts[d] += 1;
  }
  const digits = Object.keys(counts).map(Number);
  return {
    counts,
    missing: digits.filter((d) => counts[d] === 0),
    repeated: digits.filter((d) => counts[d] > 1),
  };
}

/**
 * Numbers 1-9 are ruled by planets, and their relationship is those planets'
 * natural friendship.
 *
 * Rahu (4) and Ketu (7) have no friendships the tradition agrees on. They are
 * given Saturn's and Mercury's rows respectively, which is the most common
 * numerological practice — a convention, not a rule, kept here in one place so
 * it can be corrected in one place.
 */
const NUMBER_RULER: Record<number, string> = {
  1: "Sun", 2: "Moon", 3: "Jupiter", 4: "Saturn", 5: "Mercury",
  6: "Venus", 7: "Mercury", 8: "Saturn", 9: "Mars",
};

const FRIENDS: Record<string, string[]> = {
  Sun: ["Moon", "Mars", "Jupiter"],
  Moon: ["Sun", "Mercury"],
  Mars: ["Sun", "Moon", "Jupiter"],
  Mercury: ["Sun", "Venus"],
  Jupiter: ["Sun", "Moon", "Mars"],
  Venus: ["Mercury", "Saturn"],
  Saturn: ["Mercury", "Venus"],
};

const ENEMIES: Record<string, string[]> = {
  Sun: ["Venus", "Saturn"],
  Moon: [],
  Mars: ["Mercury"],
  Mercury: ["Moon"],
  Jupiter: ["Mercury", "Venus"],
  Venus: ["Sun", "Moon"],
  Saturn: ["Sun", "Moon", "Mars"],
};

/**
 * The classical table is genuinely asymmetric — `ENEMIES.Moon` is `[]` but
 * `ENEMIES.Venus` contains `Moon` — so consulting only `a`'s row would make
 * `numberRelationship(2, 6)` and `numberRelationship(6, 2)` disagree, and the
 * prompt renders the result as a reciprocal sentence ("N and M are enemies").
 * Two users would then get opposite claims about the same pair. Resolved
 * compoundly instead: enemy if EITHER direction calls it an enemy, friend
 * only if BOTH directions do, neutral otherwise.
 */
export function numberRelationship(a: number, b: number): "friend" | "neutral" | "enemy" {
  const pa = NUMBER_RULER[a];
  const pb = NUMBER_RULER[b];
  if (!pa || !pb) return "neutral";
  if (pa === pb) return "friend";
  const abEnemy = ENEMIES[pa]?.includes(pb) ?? false;
  const baEnemy = ENEMIES[pb]?.includes(pa) ?? false;
  if (abEnemy || baEnemy) return "enemy";
  const abFriend = FRIENDS[pa]?.includes(pb) ?? false;
  const baFriend = FRIENDS[pb]?.includes(pa) ?? false;
  if (abFriend && baFriend) return "friend";
  return "neutral";
}
