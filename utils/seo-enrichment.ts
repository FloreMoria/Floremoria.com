import { getLocalDateKey, mulberry32, xmur3 } from './dailyImageSet';

const WEATHER_CONDITIONS = [
    "Cielo Sereno",
    "Soleggiato",
    "Lievemente Nuvoloso",
    "Foschia Leggera",
];

const TEMPERATURE_RANGES = {
    winter: [4, 12],
    spring: [13, 20],
    summer: [22, 32],
    autumn: [10, 18]
};

function getCurrentSeason(): keyof typeof TEMPERATURE_RANGES {
    const month = new Date().getMonth();
    if (month === 11 || month <= 1) return 'winter';
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    return 'autumn';
}

/**
 * Generates a deterministic weather string for a given municipality.
 * Changes every day, but stays consistent across page loads for the same day/city.
 * Note: Only proposes GOOD weather to avoid discouraging user purchases.
 */
export function getDeterministicWeather(city: string): string {
    const dateKey = getLocalDateKey();
    const seedString = `${city}_${dateKey}`;
    const seed = xmur3(seedString)();
    const rand = mulberry32(seed);

    const condition = WEATHER_CONDITIONS[Math.floor(rand() * WEATHER_CONDITIONS.length)];
    
    const season = getCurrentSeason();
    const [minTemp, maxTemp] = TEMPERATURE_RANGES[season];
    const temp = Math.floor(rand() * (maxTemp - minTemp + 1)) + minTemp;

    return `${condition}, ${temp}°C`;
}

/**
 * Generates a deterministic distance for the closest partner.
 * Stays identical forever for the same city to provide consistent SEO data.
 * Business Rule: Always propose around 200m (e.g. 180m - 240m) to maximize conversion.
 */
export function getDeterministicDistance(city: string): string {
    const seedString = `${city}_distance`;
    const seed = xmur3(seedString)();
    const rand = mulberry32(seed);

    // Generate a distance closely pivoting around 200 meters
    const distanceMeters = Math.floor(180 + rand() * 60);
    return `${distanceMeters} mt`;
}
