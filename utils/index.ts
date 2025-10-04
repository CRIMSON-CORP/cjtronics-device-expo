export function adNotActive(ad: Ad) {
  if (!ad) return false;

  const now = new Date();
  const startTime = new Date(ad.adConfiguration.startTime);
  const endTime = new Date(ad.adConfiguration.endTime);

  // Check if current date is within ad's overall time window
  return now < startTime || now > endTime;
}
