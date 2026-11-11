/* corpora.js: readable names for the 25 columns.
 * "short" is the column heading (kept under 20 characters). "long" is the full description for
 * tooltips and the table view. The descriptions come from Appendix A of the dissertation.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LexCorpora = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  return {
    virgilhomer:     { short: "Virgil, Homer",        long: "Virgil's Aeneid and Homer's works" },
    bible:           { short: "Bible",                long: "King James Bible (17th century)" },
    bnc:             { short: "BNC",                  long: "British National Corpus, written section (count from the CUVPlus dictionary)" },
    commonsense:     { short: "Common sense",         long: "Common sense statements (Open Mind Common Sense)" },
    fairy:           { short: "Grimm",                long: "Grimm's fairy tales (19th century)" },
    movies:          { short: "Movie reviews",        long: "Movie reviews" },
    reuters:         { short: "Reuters",              long: "Reuters news articles" },
    science:         { short: "Science",              long: "Science articles" },
    shakescoleridge: { short: "Shakespeare",          long: "Shakespeare's plays and Coleridge's poems" },
    bulfinchscott:   { short: "Bulfinch, Scott",      long: "Works by Bulfinch and Scott (19th century)" },
    milton:          { short: "Milton",               long: "Milton's poetry, including Paradise Lost (17th century)" },
    newscientist:    { short: "New Scientist",        long: "New Scientist articles" },
    otascience:      { short: "Student science",      long: "Science essays by British students" },
    overheard:       { short: "Overheard",            long: "Overheard statements" },
    otaarts:         { short: "Student arts",         long: "Arts essays by British students" },
    southpark1:      { short: "South Park 1-6",       long: "South Park episodes, seasons 1 to 6" },
    southpark2:      { short: "South Park 7-11",      long: "South Park episodes, seasons 7 to 11" },
    nytscience1:     { short: "NYT science 1987-88",  long: "New York Times science articles, 1987 to 1988" },
    nytscience2:     { short: "NYT science 2005-06",  long: "New York Times science articles, 2005 to 2006" },
    nytbookreviews1: { short: "NYT books 1987",       long: "New York Times book reviews, 1987" },
    nytbookreviews2: { short: "NYT books 1988",       long: "New York Times book reviews, 1988" },
    churchill:       { short: "Churchill",            long: "Winston Churchill's speeches and selected writings" },
    brontes:         { short: "Brontë",               long: "Novels by the Brontë sisters (19th century)" },
    rap1:            { short: "Rap 1",                long: "Rap lyrics, part 1" },
    rap2:            { short: "Rap 2",                long: "Rap lyrics, part 2" },
  };
});
