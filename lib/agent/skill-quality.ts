export type SkillQuality = {
  fingerprint: string;
  outcomes: { passed: boolean; at: number }[];
};
export function skillQuality(
  raw: string | undefined,
  fingerprint: string,
): SkillQuality {
  try {
    const value = JSON.parse(raw || "null");
    if (
      value?.fingerprint === fingerprint &&
      Array.isArray(value.outcomes) &&
      value.outcomes.length <= 20 &&
      value.outcomes.every(
        (o: any) => typeof o.passed === "boolean" && Number.isFinite(o.at),
      )
    )
      return value;
  } catch {}
  return { fingerprint, outcomes: [] };
}
export function quarantined(quality: SkillQuality) {
  return (
    quality.outcomes.length >= 3 &&
    quality.outcomes.slice(-3).every((o) => !o.passed)
  );
}
export function recordSkillOutcome(quality: SkillQuality, passed: boolean) {
  return {
    ...quality,
    outcomes: [...quality.outcomes, { passed, at: Date.now() }].slice(-20),
  };
}
