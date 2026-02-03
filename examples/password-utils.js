/**
 * Password strength utilities for Helium examples
 * Demonstrates @import functionality
 */

/**
 * Check password strength based on multiple criteria
 * @param {string} password - The password to check
 * @returns {object} - { score: 0-4, label: string, percent: number }
 */
export function checkStrength(password) {
  if (!password) {
    return { score: 0, label: 'Enter a password', percent: 0 };
  }

  let score = 0;

  // Length check
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;

  // Has lowercase letter
  if (/[a-z]/.test(password)) score++;

  // Has uppercase letter
  if (/[A-Z]/.test(password)) score++;

  // Has digit
  if (/[0-9]/.test(password)) score++;

  // Has symbol
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  // Map score to label (max score is 6)
  const labels = ['Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Strong', 'Excellent'];
  const label = labels[Math.min(score, 6)];

  // Percent for progress bar
  const percent = Math.min(100, Math.round((score / 6) * 100));

  return { score, label, percent };
}

/**
 * Get color for strength level
 * @param {string} label - The strength label
 * @returns {string} - CSS color
 */
export function strengthColor(label) {
  const colors = {
    'Enter a password': '#ccc',
    'Weak': '#e53935',
    'Fair': '#ff9800',
    'Good': '#4caf50',
    'Strong': '#2e7d32',
    'Excellent': '#1b5e20'
  };
  return colors[label] || '#ccc';
}

/**
 * Get tips for improving password
 * @param {string} password - The password to check
 * @returns {string[]} - Array of improvement tips
 */
export function getPasswordTips(password) {
  if (!password) return ['Enter a password to see tips'];

  const tips = [];

  if (password.length < 8) tips.push('Use at least 8 characters');
  else if (password.length < 12) tips.push('Use 12+ characters for better security');

  if (!/[a-z]/.test(password)) tips.push('Add lowercase letters');
  if (!/[A-Z]/.test(password)) tips.push('Add uppercase letters');
  if (!/[0-9]/.test(password)) tips.push('Add numbers');
  if (!/[^a-zA-Z0-9]/.test(password)) tips.push('Add symbols (!@#$%...)');

  return tips.length ? tips : ['Great password!'];
}
