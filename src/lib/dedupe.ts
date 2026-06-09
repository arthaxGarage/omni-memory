// LanceDB cosine metric returns distance = 1 - similarity, so similarity = 1 - distance
export function isDuplicate(lanceDistance: number, threshold = 0.97): boolean {
  return (1 - lanceDistance) >= threshold;
}
