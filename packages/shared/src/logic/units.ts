// Canonical unit is milliliters everywhere; fluid ounces are display-only.
const ML_PER_US_FL_OZ = 29.5735

export function mlToOz(ml: number): number {
  return ml / ML_PER_US_FL_OZ
}

export function ozToMl(oz: number): number {
  return oz * ML_PER_US_FL_OZ
}
