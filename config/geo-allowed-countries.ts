/**
 * GateCtr — Geo-blocking configuration
 *
 * List of ISO 3166-1 alpha-2 country codes allowed to access the application.
 * Users from unlisted countries are redirected to /blocked.
 *
 * Set ENABLE_GEO_BLOCKING=true in environment variables to activate.
 *
 * Reference: https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2
 */
export const ALLOWED_COUNTRIES: string[] = [
  // North America
  "US", // United States
  "CA", // Canada
  "MX", // Mexico

  // Europe
  "FR", // France
  "DE", // Germany
  "GB", // United Kingdom
  "ES", // Spain
  "IT", // Italy
  "NL", // Netherlands
  "BE", // Belgium
  "CH", // Switzerland
  "SE", // Sweden
  "NO", // Norway
  "DK", // Denmark
  "FI", // Finland
  "PT", // Portugal
  "AT", // Austria
  "PL", // Poland
  "IE", // Ireland
  "LU", // Luxembourg

  // Middle East & Africa
  "MA", // Morocco
  "TN", // Tunisia
  "DZ", // Algeria
  "SN", // Senegal
  "CI", // Côte d'Ivoire
  "AE", // United Arab Emirates
  "CD", // Democratic Republic of Congo
  "CG", // Republic of Congo
  "ZA", // South Africa
  "EG", // Egypt
  "NG", // Nigeria
  "KE", // Kenya
  "GH", // Ghana
  "ET", // Ethiopia
  "TZ", // Tanzania
  "UG", // Uganda
  "CM", // Cameroon
  "MG", // Madagascar

  // Asia Pacific
  "AU", // Australia
  "NZ", // New Zealand
  "SG", // Singapore
  "JP", // Japan
  "KR", // South Korea
  "IN", // India

  // Latin America
  "BR", // Brazil
  "AR", // Argentina
  "CO", // Colombia
  "CL", // Chile
];
