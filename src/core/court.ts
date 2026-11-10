// The half court in feet, on the NFHS (US high-school and youth) line: x across the 50 ft width, y from the baseline (the basket end) down the 42 ft to the half-court line.
// Imports nothing, so the share card's worker can draw the court without loading App Core.
const widthFt = 50;
const basketFt = 5.25;
const arcFt = 19.75;
const cornerFt = 5.25;
// the corner line runs from the baseline to where it meets the arc
const cornerEndFt = basketFt + Math.sqrt(arcFt ** 2 - (widthFt / 2 - cornerFt) ** 2);
export const HALF_COURT = { widthFt, lengthFt: 42, basketFt, arcFt, cornerFt, cornerEndFt };
// the three-point line: the corner lines from the baseline, then the arc between them
export const THREE_POINT_LINE = `M ${cornerFt} 0 V ${cornerEndFt} A ${arcFt} ${arcFt} 0 0 0 ${widthFt - cornerFt} ${cornerEndFt} V 0`;
