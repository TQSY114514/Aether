/**
 * stripAnsi.js
 * A lightweight ANSI escape sequence cleaner (no external dependencies).
 */

/**
 * Removes ANSI escape sequences and carriage returns from text.
 * @param {string} text - The input string containing ANSI sequences.
 * @returns {string} The cleaned string.
 */
function stripAnsi(text) {
  if (text == null) return '';
  if (typeof text !== 'string') text = String(text);
  
  // Regular expression to match ANSI escape codes
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  
  // Remove ANSI codes and carriage returns
  return text.replace(ansiRegex, '').replace(/\r/g, '');
}

module.exports = {
  stripAnsi
};
