globalThis.GalactusSettings = Object.freeze({
  enabled: true,
  bubbles: true,
  sound: false,
  pace: 4500
});

globalThis.galactusWhipDuration = (pace, elapsed = 0) => {
  const initialDuration = 900 + pace / 12;
  const fastestDuration = Math.max(750, initialDuration * .55);
  const progress = Math.min(1, Math.max(0, elapsed / 42000));
  return Math.round(initialDuration + (fastestDuration - initialDuration) * progress);
};
