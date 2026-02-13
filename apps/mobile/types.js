/**
 * Shared types for mobile app. Must match backend API and web app.
 * User comes from GET /api/v1/users/me and auth responses; use religions (array), not religion (singular).
 */

/** @typedef {'islam' | 'hinduism' | 'christianity'} Religion */

/**
 * @typedef {Object} User
 * @property {string} user_code
 * @property {string} email
 * @property {string} display_name
 * @property {Religion[]} religions - Preferred religions (filter); empty = show all. Backend returns this, not religion.
 * @property {string} [avatar_url]
 * @property {string} [created_at]
 * @property {string} [updated_at]
 */

export const RELIGIONS = /** @type {const} */ (['islam', 'hinduism', 'christianity']);
