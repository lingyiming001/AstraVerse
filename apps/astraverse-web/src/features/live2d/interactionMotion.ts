/** Match a model's own motion groups to its hit areas without assuming every model has the same names. */
export function interactionMotion(groups: string[], hitAreas: string[]): string | null {
  if (!hitAreas.length) return null;
  const head = hitAreas.some(name => /head|face|hair|头|脸/i.test(name));
  const body = hitAreas.some(name => /body|torso|chest|身体|躯干/i.test(name));
  const patterns = head
    ? [/tap[_ -]?head|touch[_ -]?head|flick[_ -]?head|tap[_ -]?face/i, /head|face|smile|greet/i, /tap|touch|flick/i]
    : body
      ? [/tap[_ -]?body|touch[_ -]?body|tap[_ -]?chest/i, /body|wave|greet/i, /tap|touch|flick/i]
      : [/tap|touch|flick|greet|wave/i];
  return patterns.map(pattern => groups.find(group => pattern.test(group))).find(Boolean) || null;
}
