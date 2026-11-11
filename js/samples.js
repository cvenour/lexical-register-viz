/* samples.js: the stock sentences in the drop-down list.
 *
 * The New Yorker and newspaper sentences use the wording that was tested in the dissertation
 * (Table 6.1 and the logfiles), not the original wording. Contractions are spelled out and
 * quote marks, a dash and one name are gone, so the page gives the scores in the logfiles.
 * "no" is the sentence's number in the dissertation's test set; tests/run-tests.mjs uses it to
 * find the logfile.
 *
 * The two Monty Python sentences are not in the final test set, so no logfile exists for them.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LexSamples = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  return [
    {
      label: "Monty Python and the Holy Grail",
      items: [
        {
          id: "mp-tart",
          text: "You cannot expect to wield supreme executive power just because some watery tart threw a sword at you.",
        },
        {
          id: "mp-grenade",
          text: "Oh, Lord, bless this thy hand grenade that with it thou mayest blow thy enemies to tiny bits, in thy mercy.",
        },
      ],
    },
    {
      label: "The New Yorker cartoon captions (the dissertation's test set)",
      logs: "lexical jokes",
      items: [
        { id: "ny-01", no: 1, text: "This cell block is for naughty businessmen like yourself who were caught price fixing and such." },
        { id: "ny-02", no: 2, text: "Hail Caesar! The enemy has been totalled." },
        { id: "ny-03", no: 3, text: "The woman who ordered the poulet chasseur would like to come in and rap about it." },
        { id: "ny-04", no: 4, text: "If you do not mind my saying so Doctor, Exegetical Dissertations on Theosophical Redirections in the Twentieth Century will not have quite the impact of Keep the Faith Baby!" },
        { id: "ny-05", no: 5, text: "Woe! The gods have now decreed that there will be a short pause for a commercial." },
        { id: "ny-06", no: 6, text: "And finally Lord may thy wisdom guide and inspire the deliberations of those thy servants our planning and zoning commission." },
        { id: "ny-07", no: 7, text: "I deem thee newsworthy." },
        { id: "ny-08", no: 8, text: "You are getting to be a big boy sonny and when we are alone it is still nice to hear you call me Popsy. But in front of people try to remember to call me Sire." },
        { id: "ny-09", no: 9, text: "Miss would you type this searing blast at the honkie power structure in triplicate for me please?" },
        { id: "ny-10", no: 10, text: "There is a skillful juxtaposition of contrasting elements but doggone it I miss his oblique offhand symbolism." },
        { id: "ny-11", no: 11, text: "I warned you that giving him the presidency would be a boo boo." },
      ],
    },
    {
      label: "Newspaper quotes (the dissertation's test set)",
      logs: "newspaper quotes",
      items: [
        { id: "news-04", no: 4, text: "It has an institutional dimension that cannot be ignored given the circumstances." },
        { id: "news-08", no: 8, text: "We do things in order to get infrastructure legacy projects. That is what we do it for." },
        { id: "news-01", no: 1, text: "I got the okay to just take the wood and, to me, it was just a pile of wood." },
      ],
    },
  ];
});
