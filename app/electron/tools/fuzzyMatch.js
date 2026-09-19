/**
 * fuzzyMatch.js
 * A fuzzy string matching module for edit_file resilience.
 */

/**
 * Calculates Levenshtein similarity between two strings.
 * @param {string} a 
 * @param {string} b 
 * @returns {number} 0.0 to 1.0 similarity ratio.
 */
function levenshteinSimilarity(a, b) {
  if (a === b) return 1.0;
  if (a == null || b == null) return 0.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  let currRow = new Array(b.length + 1);

  for (let i = 0; i < a.length; i++) {
    currRow[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      currRow[j + 1] = Math.min(
        currRow[j] + 1,
        prevRow[j + 1] + 1,
        prevRow[j] + cost
      );
    }
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  const dist = prevRow[b.length];
  return 1 - dist / Math.max(a.length, b.length);
}

/**
 * Fuzzy string matching.
 * @param {string} fileContent 
 * @param {string} needle 
 * @param {object} options 
 * @returns {object} { found, index, matchedText, strategy, similarity, closestLines }
 */
function fuzzyFind(fileContent, needle, options = {}) {
  const result = {
    found: false,
    index: -1,
    matchedText: '',
    strategy: '',
    similarity: 0,
    closestLines: ''
  };

  if (!fileContent || !needle) return result;

  // 1. Exact match
  const exactIndex = fileContent.indexOf(needle);
  if (exactIndex !== -1) {
    return {
      found: true,
      index: exactIndex,
      matchedText: needle,
      strategy: 'Exact match',
      similarity: 1.0
    };
  }

  const fileLines = fileContent.split(/\r?\n/);
  const needleLines = needle.split(/\r?\n/);
  const normFileLines = fileLines.map(l => l.trimEnd());
  const normNeedleLines = needleLines.map(l => l.trimEnd());

  // Helper to find sub-array match
  const findSubArray = (haystack, pin, eqFn) => {
    if (pin.length === 0) return -1;
    for (let i = 0; i <= haystack.length - pin.length; i++) {
      let match = true;
      for (let j = 0; j < pin.length; j++) {
        if (!eqFn(haystack[i + j], pin[j])) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
    return -1;
  };

/** Convert a zero-based line index into its character offset in joined text. */
function getCharOffsetForLine(lines, lineIdx) {
    let offset = 0;
    for (let k = 0; k < lineIdx && k < lines.length; k++) {
      offset += lines[k].length + 1;
    }
    return offset;
  }

  // 2. Whitespace-normalized match
  const matchIdxNorm = findSubArray(normFileLines, normNeedleLines, (a, b) => a === b);
  if (matchIdxNorm !== -1) {
    const matchedLines = fileLines.slice(matchIdxNorm, matchIdxNorm + needleLines.length);
    const matchedText = matchedLines.join('\n');
    return {
      found: true,
      index: getCharOffsetForLine(fileLines, matchIdxNorm),
      matchedText,
      strategy: 'Whitespace-normalized match',
      similarity: 1.0
    };
  }

  // 3. Indent-offset match
  const needleIndentMatch = needleLines[0].match(/^[ \t]*/);
  const needleIndent = needleIndentMatch ? needleIndentMatch[0] : '';
  
  for (let i = 0; i <= fileLines.length - needleLines.length; i++) {
    const fileIndentMatch = fileLines[i].match(/^[ \t]*/);
    const fileIndent = fileIndentMatch ? fileIndentMatch[0] : '';
    
    const shiftedNeedleLines = needleLines.map(line => {
      if (line.startsWith(needleIndent)) {
        return fileIndent + line.slice(needleIndent.length);
      }
      return line;
    });
    
    const normShiftedNeedle = shiftedNeedleLines.map(l => l.trimEnd());
    const fileSlice = normFileLines.slice(i, i + needleLines.length);
    
    let match = true;
    for (let j = 0; j < needleLines.length; j++) {
      if (fileSlice[j] !== normShiftedNeedle[j]) {
        match = false;
        break;
      }
    }
    
    if (match) {
      const matchedLines = fileLines.slice(i, i + needleLines.length);
      return {
        found: true,
        index: getCharOffsetForLine(fileLines, i),
        matchedText: matchedLines.join('\n'),
        strategy: 'Indent-offset match',
        similarity: 1.0
      };
    }
  }

  // 4. Line-level Levenshtein sliding window
  let bestSim = 0;
  let bestIdx = -1;
  
  for (let i = 0; i <= fileLines.length - needleLines.length; i++) {
    let simSum = 0;
    for (let j = 0; j < needleLines.length; j++) {
      simSum += levenshteinSimilarity(normFileLines[i + j], normNeedleLines[j]);
    }
    const avgSim = simSum / needleLines.length;
    
    if (avgSim > bestSim) {
      bestSim = avgSim;
      bestIdx = i;
    }
  }

  if (bestSim > 0.85 && bestIdx !== -1) {
    const matchedLines = fileLines.slice(bestIdx, bestIdx + needleLines.length);
    return {
      found: true,
      index: getCharOffsetForLine(fileLines, bestIdx),
      matchedText: matchedLines.join('\n'),
      strategy: 'Line-level Levenshtein sliding window',
      similarity: bestSim
    };
  }

  // ALL strategies failed, populate closestLines
  if (bestIdx !== -1) {
    result.closestLines = fileLines.slice(bestIdx, bestIdx + needleLines.length).join('\n');
    result.similarity = bestSim;
  }
  
  return result;
}

module.exports = {
  fuzzyFind,
  levenshteinSimilarity
};
