// Cosine distance = 1 - similarity (sqlite-vec's vec_distance_cosine), so similarity = 1 - distance
export function isDuplicate(cosineDistance: number, threshold = 0.97): boolean {
  return (1 - cosineDistance) >= threshold;
}
