/**
 * Vercel keeps variable names exactly as typed, and some screens only allow lowercase.
 * Copy any lowercase name (e.g. stripe_secret_key) to its uppercase form when the
 * uppercase one isn't set, so the rest of the code can use the standard names.
 * Next.js runs this once when the server starts.
 */
export function register() {
  for (const [name, value] of Object.entries(process.env)) {
    const upper = name.toUpperCase();
    if (name !== upper && value && !process.env[upper]) process.env[upper] = value;
  }
}
