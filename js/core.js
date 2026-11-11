/* core.js: the maths of classifier #4 from the dissertation. No page code in here.
 *
 *   text -> words -> one 25-number row per word -> log entropy on each column
 *        -> cosine of every pair of rows -> lowest cosine -> joke / not a joke
 *
 * It runs in the browser (window.LexCore) and in Node (module.exports), so the same code is
 * tested against the dissertation's logfiles. The operations are in the same order as the
 * Perl, so the numbers match the logs to about 15 digits.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LexCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const THRESHOLD = 0.25;   // a text is called a joke when its lowest pairwise cosine is at or below this
  const MIN_WORDS = 2;      // one word gives no pairs, and log entropy divides by log(number of words)
  const MAX_WORDS = 40;     // the longest sentence in the dissertation's test set has fewer

  const LN10 = Math.log(10);
  const log10 = (x) => Math.log(x) / LN10;   // the Perl's log($x)/log(10), not Math.log10

  /* ------------------------------------------------------------------ 1. text to words */

  // ProcessString in the Perl: these characters become spaces, A-Z becomes a-z, runs of spaces
  // shrink to one. Apostrophes and hyphens stay.
  const PUNCT = /[?.,;|><*!#=+%^:{}"()]/g;
  const SLASH = /[/\\]/g;

  function processString(text) {
    return String(text)
      .replace(/[\r\n]+$/, "")
      .replace(PUNCT, " ")
      .replace(SLASH, " ")
      .replace(/[A-Z]/g, (c) => c.toLowerCase())
      .replace(/ {2,}/g, " ");
  }

  // Clean-up for text people type or paste. The dissertation's sentences were edited by hand
  // before they were tested, so the Perl never saw curly quotes or long dashes.
  function prepareTyped(text) {
    return String(text)
      .replace(/[‘’‛′]/g, "'")                  // curly apostrophes become '
      .replace(/[“”„‟«»]/g, " ")      // curly and angle quotes become spaces
      .replace(/[‐‑]/g, "-")                              // hyphen variants become -
      .replace(/[‒–—―…]/g, " ")            // dashes and ellipses separate words
      .replace(/\s+/g, " ");                                        // tabs and new lines separate words
  }

  // A word is anything left between spaces. A token made only of hyphens or apostrophes is
  // not a word, so it is dropped.
  function tokenize(text) {
    return processString(prepareTyped(text))
      .split(" ")
      .filter((w) => w !== "" && !/^[-']+$/.test(w));
  }

  /* ------------------------------------------------------------------ 2. the lookup table */

  // data = globalThis.LEXICON from lexicon.js. data.text holds one sorted line per word:
  //   word TAB bncValue TAB corpusIndex:count corpusIndex:count ...
  // The lookup is a binary search over that text, so nothing is built when the page loads.
  function createLexicon(data) {
    const text = data.text;
    const columns = data.columns;
    const corpora = data.corpora;
    if (columns.length !== 25) throw new Error("lexicon.js should list 25 columns");

    // for each of the 25 columns: -1 for the BNC column, otherwise the corpus index
    const source = columns.map((id) => (id === "bnc" ? -1 : corpora.findIndex((c) => c.id === id)));
    if (source.some((s, k) => s === -2 || (s === -1 && columns[k] !== "bnc"))) {
      throw new Error("lexicon.js: a column has no matching corpus");
    }

    function findLine(word) {
      let lo = 0;               // lo and hi are always the start of a line, or the end of the text
      let hi = text.length;
      while (lo < hi) {
        const mid = lo + ((hi - lo) >> 1);
        const start = mid === 0 ? 0 : text.lastIndexOf("\n", mid - 1) + 1;
        const end = text.indexOf("\n", mid);
        const key = text.slice(start, text.indexOf("\t", start));
        if (key === word) return text.slice(start, end);
        if (key < word) lo = end + 1;
        else hi = start;
      }
      return null;
    }

    const cache = new Map();

    // The raw counts for a word, or null when no corpus has it.
    function lookup(word) {
      if (cache.has(word)) return cache.get(word);
      let entry = null;
      const line = word === "" ? null : findLine(word);
      if (line !== null) {
        const parts = line.split("\t");
        const counts = new Array(corpora.length).fill(0);
        if (parts[2]) {
          for (const pair of parts[2].split(" ")) {
            const [index, count] = pair.split(":");
            counts[+index] = +count;
          }
        }
        entry = { word, bnc: parts[1] === "" ? 0 : +parts[1], counts };
      }
      cache.set(word, entry);
      return entry;
    }

    // The 25 numbers for a word: a count per million words for each corpus, and for the BNC
    // column the CUVPlus number as it is (the dissertation does not scale it).
    function row(entry) {
      return source.map((s) => {
        if (entry === null) return 0;
        return s === -1 ? entry.bnc : normalized(entry.counts[s], corpora[s].total);
      });
    }

    return { columns, corpora, lookup, row, findLine };
  }

  // Count per million words, cut (not rounded) to two decimals, as in the Perl.
  function normalized(count, total) {
    const perMillion = count * (1000000 / total);
    return Math.trunc(perMillion * 100) / 100;
  }

  /* ------------------------------------------------------------------ 3. log entropy */

  // ComputeEntropy in the Perl. A column of zeros gets the natural log of its length, which
  // only matters for the weight; every cell in such a column is 0 anyway.
  function columnEntropy(col) {
    let sum = 0;
    for (const x of col) sum += x;
    if (sum === 0) return Math.log(col.length);
    let acc = 0;
    for (const x of col) {
      const p = x / sum;
      if (p !== 0) acc += p * log10(p);
    }
    return -acc;
  }

  function columnWeight(entropy, m) {
    return 1 - entropy / log10(m);
  }

  // matrix: m rows of 25 numbers. Each column is weighted on its own, using only this text's rows.
  function logEntropy(matrix) {
    const m = matrix.length;
    const width = matrix[0].length;
    const out = matrix.map(() => new Array(width));
    const entropies = [];
    const weights = [];
    const empty = [];
    for (let j = 0; j < width; j++) {
      const col = matrix.map((r) => r[j]);
      const e = columnEntropy(col);
      const w = columnWeight(e, m);
      entropies.push(e);
      weights.push(w);
      empty.push(col.every((x) => x === 0));
      for (let i = 0; i < m; i++) out[i][j] = log10(col[i] + 1) * w;
    }
    return { matrix: out, entropies, weights, empty };
  }

  /* ------------------------------------------------------------------ 4. cosines and the verdict */

  // A row of zeros has no direction, so its cosine with anything is 0.
  function cosine(a, b) {
    let dot = 0;
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      sa += a[i] * a[i];
      sb += b[i] * b[i];
    }
    const la = Math.sqrt(sa);
    const lb = Math.sqrt(sb);
    if (la * lb === 0) return 0;
    return dot / (la * lb);
  }

  // Every pair (i, j) with i < j, in the order the Perl loops produce them.
  function pairwiseCosines(matrix) {
    const pairs = [];
    for (let i = 0; i < matrix.length - 1; i++) {
      for (let j = i + 1; j < matrix.length; j++) {
        pairs.push({ i, j, cos: cosine(matrix[i], matrix[j]) });
      }
    }
    return pairs;
  }

  // The smallest cosine. On a tie the first pair in loop order wins, as in the Perl's stable sort.
  function lowestPair(pairs) {
    let best = pairs[0];
    for (const p of pairs) if (p.cos < best.cos) best = p;
    return best;
  }

  /* ------------------------------------------------------------------ everything in one call */

  // Runs the whole method on a piece of text. Returns every stage, so the page can draw each one.
  function analyse(lexicon, text) {
    const words = tokenize(text);
    if (words.length < MIN_WORDS) return { ok: false, reason: "tooFew", words };
    if (words.length > MAX_WORDS) return { ok: false, reason: "tooMany", words };

    const entries = words.map((w) => lexicon.lookup(w));
    const frequencies = entries.map((e) => lexicon.row(e));
    const weighted = logEntropy(frequencies);
    const pairs = pairwiseCosines(weighted.matrix);
    const lowest = lowestPair(pairs);
    const zeroRows = frequencies.map((r, i) => (r.every((x) => x === 0) ? i : -1)).filter((i) => i >= 0);

    return {
      ok: true,
      words,
      columns: lexicon.columns,
      frequencies,            // stage 1: counts per million, m rows of 25
      weighted,               // stage 2: { matrix, entropies, weights, empty }
      pairs,                  // stage 3: every pair with its cosine
      lowest,                 // the pair with the lowest cosine: { i, j, cos }
      isJoke: lowest.cos <= THRESHOLD,
      zeroRows,               // rows of words that appear in none of the 25 corpora
    };
  }

  return {
    THRESHOLD, MIN_WORDS, MAX_WORDS,
    processString, prepareTyped, tokenize,
    createLexicon, normalized,
    columnEntropy, columnWeight, logEntropy,
    cosine, pairwiseCosines, lowestPair,
    analyse,
  };
});
