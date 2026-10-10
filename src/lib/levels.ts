// The database purchase guard uses the same 250 XP per level rule.
export const XP_PER_LEVEL = 250;
export function levelProgress(xp: number) {
  const value = Math.max(0, Math.floor(xp));
  return {
    level: Math.floor(value / XP_PER_LEVEL) + 1,
    progress: value % XP_PER_LEVEL,
    required: XP_PER_LEVEL,
  };
}
