export type Numerology = {
  mulank: number; // root number, from the day of birth (1-9)
  bhagyank: number; // destiny number, from the full birth date (1-9)
};

function reduceToDigit(n: number): number {
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
