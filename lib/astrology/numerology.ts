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
