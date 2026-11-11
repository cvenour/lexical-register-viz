/* app.js: the page. It draws each step of classifier #4 with D3.
 * The maths is in core.js, the word counts are in lexicon.js. Nothing here talks to a server.
 *
 *   Step 1  tiles fly in and form one row per word and one column per collection of writing
 *   Step 2  log entropy: the same tiles change colour, and a bar under each column shows its weight
 *   Step 3  the two rows with the lowest cosine are outlined in the matrix, and the verdict appears
 */
(function () {
  "use strict";

  const Core = window.LexCore;
  const Corpora = window.LexCorpora;
  const Samples = window.LexSamples;
  const lexicon = Core.createLexicon(window.LEXICON);

  /* ------------------------------------------------------------------ helpers */

  const $ = (selector) => document.querySelector(selector);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const fmtFreq = d3.format(",.2~f");
  const fmt3 = d3.format(".3f");
  const fmtInt = d3.format(",d");

  // Three decimals, unless that would print the threshold itself for a score that is not the threshold.
  function fmtScore(x) {
    const s = x.toFixed(3);
    return s === "0.250" && x !== 0.25 ? x.toFixed(5) : s;
  }

  const quote = (w) => "“" + w + "”";

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ------------------------------------------------------------------ colour */

  // Light steps run from almost white to dark. Dark-mode steps run from almost the page colour
  // to light, so the lowest values fade into the page in both modes.
  const RED = {
    light: ["#f9edeb", "#f9d6d1", "#f8b8b0", "#f19489", "#e56a5f", "#d33b36", "#b70012", "#90000b", "#690509"],
    dark: ["#342422", "#542f2b", "#7c3832", "#a54139", "#cf4a42", "#f25d53", "#ff8579", "#ffb0a6", "#ffd6d1"],
  };

  // Tile colour follows log10(1 + value). 5 is 100,000 per million words; the largest value in
  // the whole word table is "the" at about 89,700.
  const FREQ_DOMAIN = 5;

  function themeMode() {
    const forced = document.documentElement.dataset.theme;
    if (forced === "light" || forced === "dark") return forced;
    return darkQuery.matches ? "dark" : "light";
  }

  const rampCache = {};
  function ramp() {
    const mode = themeMode();
    if (!rampCache[mode]) rampCache[mode] = d3.piecewise(d3.interpolateLab, RED[mode]);
    return rampCache[mode];
  }

  const redAt = (v) => ramp()(clamp(v / FREQ_DOMAIN, 0, 1));
  const fillStep1 = (d) => redAt(Math.log10(1 + d.freq));
  const fillStep2 = (d) => redAt(Math.max(0, d.logent));
  const tileFill = (d) => (state.stage >= 2 ? fillStep2(d) : fillStep1(d));

  /* ------------------------------------------------------------------ state and elements */

  const COLUMNS = lexicon.columns.map((id, j) => {
    const corpus = lexicon.corpora.find((c) => c.id === id);
    return { id, j, short: Corpora[id].short, long: Corpora[id].long, total: corpus ? corpus.total : null };
  });

  const state = {
    stage: 0,        // 0 nothing yet, 1 frequencies, 2 log entropy, 3 verdict
    busy: false,     // true while something is animating
    stale: false,    // true when the text box no longer matches what is on screen
    text: "",        // the text that was analysed
    result: null,
    tiles: [],
    geo: null,
  };

  const els = {
    sample: $("#sample"),
    text: $("#text"),
    message: $("#message"),
    step1: $("#step1"),
    step2: $("#step2"),
    step3: $("#step3"),
    reset: $("#reset"),
    caption: $("#caption"),
    verdict: $("#verdict"),
    matrixPanel: $("#matrix-panel"),
  };

  /* ------------------------------------------------------------------ the stock sentences */

  const sampleById = new Map();

  function shorten(text, max) {
    if (text.length <= max) return text;
    const cut = text.slice(0, max).replace(/\s+\S*$/, "");
    return cut + "…";
  }

  function buildSampleList() {
    const select = d3.select(els.sample);
    select.append("option").attr("value", "").text("Choose a stock sentence…");
    Samples.forEach((group) => {
      const optgroup = select.append("optgroup").attr("label", group.label);
      group.items.forEach((item) => {
        sampleById.set(item.id, item);
        optgroup.append("option").attr("value", item.id).text(shorten(item.text, 90));
      });
    });
  }

  /* ------------------------------------------------------------------ words, rows and tiles */

  function buildTiles(result) {
    const tiles = [];
    result.words.forEach((word, i) => {
      COLUMNS.forEach((col) => {
        tiles.push({
          i,
          j: col.j,
          word,
          freq: result.frequencies[i][col.j],
          logent: result.weighted.matrix[i][col.j],
        });
      });
    });
    return tiles;
  }

  function computeGeometry(m) {
    const avail = Math.max(300, $("#matrix-scroll").clientWidth);
    const left = 120;
    const right = 12;
    const top = 136;
    const gap = 2;
    const cw = clamp(Math.floor((avail - left - right) / COLUMNS.length), 14, 30);
    const ch = m <= 12 ? 26 : m <= 24 ? 21 : 17;
    return { left, right, top, gap, cw, ch, stripH: 66, width: left + cw * COLUMNS.length + right, height: top + ch * m + 8 };
  }

  const tileX = (geo, d) => geo.left + d.j * geo.cw + geo.gap / 2;
  const tileY = (geo, d) => geo.top + d.i * geo.ch + geo.gap / 2;

  /* ------------------------------------------------------------------ the tooltip */

  const tip = $("#tip");

  // One thing is hovered at a time. clearHover undoes whatever that hover highlighted.
  let clearHover = () => {};

  function tipHide() {
    tip.hidden = true;
    clearHover();
    clearHover = () => {};
  }

  // Call this before applying a new highlight, because it first undoes the previous one.
  function tipShow(event, value, title, note, undo) {
    tipHide();
    clearHover = undo || (() => {});
    const nodes = [element("div", "tip-value", value), element("div", "tip-title", title)];
    if (note) nodes.push(element("div", "tip-note", note));
    tip.replaceChildren(...nodes);
    tip.hidden = false;
    tipMove(event);
  }

  // A mouse leaves a tile and the tip goes. A finger lifts off a tile and the tip stays until the next tap.
  const tipLeave = (event) => {
    if (event.pointerType !== "touch") tipHide();
  };

  function tipMove(event) {
    const pad = 14;
    const box = tip.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + box.width > window.innerWidth - 8) x = event.clientX - box.width - pad;
    if (y + box.height > window.innerHeight - 8) y = event.clientY - box.height - pad;
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest || !event.target.closest("svg")) tipHide();
  });

  function tileTip(d) {
    const col = COLUMNS[d.j];
    const title = `${quote(d.word)} in ${col.long}`;
    if (state.stage < 2) {
      if (col.id === "bnc") {
        return [fmtFreq(d.freq), title, d.freq === 0 ? "Not in the dictionary" : "Count from the CUVPlus dictionary, used as it is"];
      }
      return [
        `${fmtFreq(d.freq)} per million`,
        title,
        d.freq === 0 ? "Not found in this collection" : `${fmtInt(col.total)} words in this collection`,
      ];
    }
    const weighted = state.result.weighted;
    const note = weighted.empty[d.j]
      ? "No word in this text has a count in this column"
      : `log10(${fmtFreq(d.freq)} + 1) × weight ${fmt3(weighted.weights[d.j])}`;
    return [fmt3(d.logent), title, note];
  }

  /* ------------------------------------------------------------------ the matrix (steps 1 to 3) */

  function drawMatrix(options) {
    const hideTiles = Boolean(options && options.hideTiles);
    const result = state.result;
    const m = result.words.length;
    const geo = (state.geo = computeGeometry(m));
    const svg = d3.select("#matrix");

    svg.attr("width", geo.width).attr("height", geo.height + (state.stage >= 2 ? geo.stripH : 0));
    svg.selectAll("*").remove();

    const colLabels = svg
      .append("g")
      .attr("class", "col-labels")
      .selectAll("text")
      .data(COLUMNS)
      .join("text")
      .attr("transform", (d) => `translate(${geo.left + d.j * geo.cw + geo.cw / 2},${geo.top - 8}) rotate(-90)`)
      .attr("dy", "0.35em")
      .attr("font-size", 12)
      .text((d) => d.short);

    const rowLabels = svg
      .append("g")
      .attr("class", "row-labels")
      .selectAll("text")
      .data(result.words)
      .join("text")
      .attr("x", geo.left - 8)
      .attr("y", (d, i) => geo.top + i * geo.ch + geo.ch / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("font-size", 12)
      .text((d) => (d.length > 15 ? d.slice(0, 14) + "…" : d));

    const outline = svg
      .append("rect")
      .attr("class", "hover-outline")
      .attr("fill", "none")
      .attr("rx", 3)
      .attr("pointer-events", "none")
      .attr("display", "none")
      .style("stroke", "var(--ink)")
      .attr("stroke-width", 2);

    svg
      .insert("g", ".hover-outline")
      .attr("class", "tiles")
      .selectAll("rect")
      .data(state.tiles)
      .join("rect")
      .attr("x", (d) => tileX(geo, d))
      .attr("y", (d) => tileY(geo, d))
      .attr("width", geo.cw - geo.gap)
      .attr("height", geo.ch - geo.gap)
      .attr("rx", 2)
      .attr("fill", tileFill)
      .attr("opacity", hideTiles ? 0 : 1)
      .on("pointerenter", (event, d) => {
        const [value, title, note] = tileTip(d);
        tipShow(event, value, title, note, () => {
          outline.attr("display", "none");
          rowLabels.classed("label-hot", false);
          colLabels.classed("label-hot", false);
          if (state.stage >= 3) markPairLabels();
        });
        outline
          .attr("display", null)
          .attr("x", tileX(geo, d) - 1)
          .attr("y", tileY(geo, d) - 1)
          .attr("width", geo.cw - geo.gap + 2)
          .attr("height", geo.ch - geo.gap + 2);
        rowLabels.classed("label-hot", (w, i) => i === d.i);
        colLabels.classed("label-hot", (c) => c.j === d.j);
      })
      .on("pointermove", tipMove)
      .on("pointerleave", tipLeave);

    updateHint();
  }

  // Bars under the columns (step 2): the column weight, from 0 to 1.
  const barPath = (x, base, w, h, r) => {
    if (h <= 0.5) return `M${x},${base}h${w}z`;
    const rr = Math.min(r, h, w / 2);
    return `M${x},${base}V${base - h + rr}Q${x},${base - h} ${x + rr},${base - h}H${x + w - rr}Q${x + w},${base - h} ${x + w},${base - h + rr}V${base}Z`;
  };

  function drawWeights(animate) {
    const result = state.result;
    const geo = state.geo;
    const m = result.words.length;
    const svg = d3.select("#matrix");
    svg.select(".weights").remove();

    const base = geo.top + m * geo.ch + 14 + 46;
    const maxH = 42;
    const barW = Math.min(24, geo.cw - geo.gap);
    const g = svg.append("g").attr("class", "weights");
    const data = COLUMNS.map((c) => ({
      ...c,
      w: clamp(result.weighted.weights[c.j], 0, 1),
      entropy: result.weighted.entropies[c.j],
      empty: result.weighted.empty[c.j],
    }));
    const barX = (d) => geo.left + d.j * geo.cw + (geo.cw - barW) / 2;

    g.append("line")
      .attr("x1", geo.left)
      .attr("x2", geo.left + COLUMNS.length * geo.cw)
      .attr("y1", base + 0.5)
      .attr("y2", base + 0.5)
      .style("stroke", "var(--rule)");
    g.append("text").attr("x", geo.left - 8).attr("y", base - 20).attr("text-anchor", "end").attr("font-size", 12).text("Column weight");
    g.append("text").attr("x", geo.left - 8).attr("y", base - 5).attr("text-anchor", "end").attr("font-size", 11).text("0 to 1");

    const bars = g
      .selectAll("path")
      .data(data.filter((d) => !d.empty))
      .join("path")
      .style("fill", "var(--ink-3)");
    if (animate) {
      bars
        .attr("d", (d) => barPath(barX(d), base, barW, 0, 4))
        .transition()
        .duration(900)
        .ease(d3.easeCubicOut)
        .attrTween("d", (d) => (t) => barPath(barX(d), base, barW, d.w * maxH * t, 4));
    } else {
      bars.attr("d", (d) => barPath(barX(d), base, barW, d.w * maxH, 4));
    }

    // a wider invisible target per column, so even a weight of 0 can be hovered
    g.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", (d) => geo.left + d.j * geo.cw)
      .attr("y", base - maxH - 2)
      .attr("width", geo.cw)
      .attr("height", maxH + 4)
      .attr("fill", "transparent")
      .on("pointerenter", (event, d) => {
        tipShow(
          event,
          d.empty ? "No counts" : `Weight ${fmt3(d.w)}`,
          d.long,
          d.empty ? "No word in this text has a count in this column" : `Entropy ${fmt3(d.entropy)}. Weight is 1 − entropy / log10(${m}).`
        );
      })
      .on("pointermove", tipMove)
      .on("pointerleave", tipLeave);
  }

  // Shows the "scroll sideways" hint when the matrix is wider than its box.
  function updateHint() {
    const scroller = $("#matrix-scroll");
    $("#matrix-hint").hidden = !(scroller.scrollWidth > scroller.clientWidth + 1);
  }

  // Step 3: bold the labels of the two rows with the lowest cosine, and outline the rows.
  function markPairLabels() {
    const lowest = state.result.lowest;
    d3.selectAll("#matrix .row-labels text").classed("label-hot", (d, i) => i === lowest.i || i === lowest.j);
  }

  function drawPairMark(animate) {
    const geo = state.geo;
    const lowest = state.result.lowest;
    const svg = d3.select("#matrix");
    svg.select(".pair-mark").remove();
    const g = svg.append("g").attr("class", "pair-mark").attr("pointer-events", "none");
    [lowest.i, lowest.j].forEach((row) => {
      g.append("rect")
        .attr("x", geo.left - 3)
        .attr("y", geo.top + row * geo.ch)
        .attr("width", COLUMNS.length * geo.cw + 6)
        .attr("height", geo.ch)
        .attr("rx", 3)
        .attr("fill", "none")
        .attr("stroke-width", 2)
        .style("stroke", "var(--ink)");
    });
    if (animate) g.attr("opacity", 0).transition().duration(400).attr("opacity", 1);
    markPairLabels();
  }

  /* ------------------------------------------------------------------ tiles flying in (step 1) */

  // The tiles drift in slowly from outside the screen, turning over and spinning like slabs in
  // zero gravity, and slow to a stop in their places. Row by row, so the words appear in order.
  // A click or a key press skips the flight.
  async function flyIn() {
    const geo = state.geo;
    const box = $("#matrix").getBoundingClientRect();
    const viewW = document.documentElement.clientWidth;
    const viewH = document.documentElement.clientHeight;
    const pageX = window.scrollX;
    const pageY = window.scrollY;

    // The flying layer covers the whole page and scrolls with it, so a tile that is still in the air
    // when the reader scrolls still lands in its place.
    const layer = d3
      .select("#fly")
      .attr("width", viewW)
      .attr("height", Math.max(document.documentElement.scrollHeight, viewH));
    layer.selectAll("*").remove();

    // Every tile starts on a ring around the visible screen, at a random angle, out of sight.
    const radius = Math.hypot(viewW, viewH) / 2 + 160;
    const centreX = pageX + viewW / 2;
    const centreY = pageY + viewH / 2;
    const w = geo.cw - geo.gap;
    const h = geo.ch - geo.gap;
    const rowGap = Math.min(220, 1500 / state.result.words.length);
    const real = d3.selectAll("#matrix .tiles rect").nodes();

    const flying = state.tiles.map((d, index) => {
      const angle = Math.random() * 2 * Math.PI;
      const sx = centreX + radius * Math.cos(angle);
      const sy = centreY + radius * Math.sin(angle);
      const tx = pageX + box.left + tileX(geo, d) + w / 2; // the centre of the tile's place
      const ty = pageY + box.top + tileY(geo, d) + h / 2;
      const length = Math.hypot(tx - sx, ty - sy) || 1;
      return {
        index,
        sx,
        sy,
        tx,
        ty,
        bow: (Math.random() - 0.5) * 160, // how far the path bends sideways
        nx: -(ty - sy) / length, // the sideways direction
        ny: (tx - sx) / length,
        spin: (Math.random() < 0.8 ? 1 : -1) * 180 * (1 + Math.floor(Math.random() * 2)), // 180 or 360 degrees, mostly one way
        flip: 180 * (1 + Math.floor(Math.random() * 3)), // one to three half turns about the tile's upright axis
        delay: d.i * rowGap + Math.random() * 400,
        duration: 2600 + Math.random() * 1200,
      };
    });

    // Where a tile is, and how it is turned, at time t from 0 to 1. At t = 1 it matches the real tile exactly.
    function pose(f, t) {
      const e = d3.easeQuadOut(t);
      const arc = Math.sin(Math.PI * e) * f.bow;
      const x = f.sx + (f.tx - f.sx) * e + f.nx * arc;
      const y = f.sy + (f.ty - f.sy) * e + f.ny * arc;
      let flip = Math.cos(((f.flip * (1 - e)) * Math.PI) / 180);
      if (Math.abs(flip) < 0.03) flip = flip < 0 ? -0.03 : 0.03; // edge on, a hairline and never zero
      const size = 0.35 + 0.65 * e; // it grows as it comes closer
      return `translate(${x},${y}) rotate(${f.spin * (1 - e)}) scale(${size * flip},${size}) translate(${-w / 2},${-h / 2})`;
    }

    const rects = layer
      .selectAll("rect")
      .data(flying)
      .join("rect")
      .attr("width", w)
      .attr("height", h)
      .attr("rx", 2)
      .attr("fill", (f) => fillStep1(state.tiles[f.index]))
      .attr("transform", (f) => pose(f, 0));

    const flight = rects
      .transition()
      .delay((f) => f.delay)
      .duration((f) => f.duration)
      .ease(d3.easeLinear)
      .attrTween("transform", (f) => (t) => pose(f, t))
      .on("end", function (f) {
        // the tile has landed: the real tile takes its place
        real[f.index].setAttribute("opacity", 1);
        d3.select(this).remove();
      });

    const skip = () => rects.interrupt();
    document.addEventListener("pointerdown", skip, { once: true });
    document.addEventListener("keydown", skip, { once: true });
    try {
      await flight.end();
    } catch (error) {
      /* the reader skipped the flight */
    }
    document.removeEventListener("pointerdown", skip);
    document.removeEventListener("keydown", skip);
    real.forEach((node) => node.setAttribute("opacity", 1));
    layer.selectAll("*").remove();
    layer.attr("width", 0).attr("height", 0);
  }

  /* ------------------------------------------------------------------ the verdict */

  function renderVerdict() {
    const result = state.result;
    const lowest = result.lowest;
    const threshold = Core.THRESHOLD;
    const score = fmtScore(lowest.cos);
    const relation = lowest.cos < threshold ? "below" : lowest.cos > threshold ? "above" : "equal to";
    const wordA = result.words[lowest.i];
    const wordB = result.words[lowest.j];

    // which words, and why a score can be exactly 0
    let detail = `Lowest pair: ${quote(wordA)} and ${quote(wordB)}.`;
    if (result.zeroRows.length) {
      const unknown = [...new Set(result.zeroRows.map((i) => result.words[i]))].map(quote).join(", ");
      detail += ` ${unknown} ${result.zeroRows.length === 1 ? "is" : "are"} in none of the 25 collections. A word like that has a row of zeros, so it scores 0 against every other word.`;
    } else if (lowest.cos === 0) {
      detail += " Their rows have no column where both tiles are above zero, so the score is 0.";
    }
    const ties = result.pairs.filter((p) => p.cos === lowest.cos).length;
    if (ties > 1) detail += ` ${ties} pairs have this score. This is the first.`;

    const box = els.verdict;
    box.replaceChildren();
    box.hidden = false;

    const words = element("div", "verdict-text");
    words.append(
      element(
        "p",
        "sentence",
        `The lowest pairwise score is ${score}, which is ${relation} the joke threshold of ${threshold}, so this text is likely ${
          result.isJoke ? "" : "not "
        }a lexical register joke.`
      ),
      element("p", "detail", detail)
    );
    box.append(words, meterSvg(lowest.cos, score));
  }

  // A small scale from 0 to 1: the joke zone, the threshold, and where the lowest score falls.
  function meterSvg(cos, scoreText) {
    const width = clamp((els.verdict.clientWidth || 360) - 32, 240, 320);
    const x = d3.scaleLinear([0, 1], [10, width - 10]);
    const y = 38;
    const svg = d3
      .create("svg")
      .attr("width", width)
      .attr("height", 84)
      .attr("role", "img")
      .attr("aria-label", `A scale from 0 to 1. The joke threshold is ${Core.THRESHOLD}. The lowest score is ${scoreText}.`);

    svg.append("rect").attr("x", x(0)).attr("y", y - 11).attr("width", x(Core.THRESHOLD) - x(0)).attr("height", 22).attr("rx", 4).style("fill", "var(--zone)");
    svg.append("line").attr("x1", x(0)).attr("x2", x(1)).attr("y1", y).attr("y2", y).attr("stroke-width", 2).style("stroke", "var(--rule)");
    svg.append("line").attr("x1", x(Core.THRESHOLD)).attr("x2", x(Core.THRESHOLD)).attr("y1", y - 17).attr("y2", y + 17).attr("stroke-width", 1.5).style("stroke", "var(--ink)");

    // the two zone names sit under the line, so a score near 0 cannot print over them
    svg.append("text").attr("x", x(0) + 4).attr("y", y + 22).attr("font-size", 11).text("joke");
    svg.append("text").attr("x", x(Core.THRESHOLD) + 6).attr("y", y + 22).attr("font-size", 11).text("not a joke");
    [[0, "0"], [Core.THRESHOLD, String(Core.THRESHOLD)], [0.5, "0.5"], [1, "1"]].forEach(([v, label]) => {
      svg
        .append("text")
        .attr("x", x(v))
        .attr("y", y + 42)
        .attr("text-anchor", v === 0 ? "start" : v === 1 ? "end" : "middle")
        .attr("font-size", 11)
        .text(label);
    });

    const dotX = x(clamp(cos, 0, 1));
    svg
      .append("circle")
      .attr("cx", dotX)
      .attr("cy", y)
      .attr("r", 6)
      .attr("stroke-width", 2)
      .style("fill", "var(--ink)")
      .style("stroke", "var(--surface)");
    svg
      .append("text")
      .attr("x", dotX)
      .attr("y", y - 22)
      .attr("text-anchor", dotX < 40 ? "start" : dotX > width - 40 ? "end" : "middle")
      .attr("font-size", 12)
      .attr("font-weight", 650)
      .style("fill", "var(--ink)")
      .text(scoreText);
    return svg.node();
  }

  /* ------------------------------------------------------------------ legend */

  function drawLegend(host, spec) {
    const width = 240;
    const root = d3.select(host);
    root.selectAll("*").remove();
    const svg = root.append("svg").attr("width", width).attr("height", 54).attr("role", "img").attr("aria-label", spec.title);
    const gradient = svg.append("defs").append("linearGradient").attr("id", spec.id);
    d3.range(0, 1.0001, 0.125).forEach((t) => {
      gradient.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", ramp()(t));
    });
    svg.append("text").attr("x", 0).attr("y", 10).attr("font-size", 11).text(spec.title);
    svg.append("rect").attr("x", 0).attr("y", 18).attr("width", width).attr("height", 10).attr("rx", 3).attr("fill", `url(#${spec.id})`);
    spec.ticks.forEach((tick, k) => {
      const x = tick.at * width;
      svg.append("line").attr("x1", x).attr("x2", x).attr("y1", 28).attr("y2", 32).style("stroke", "var(--rule)");
      svg
        .append("text")
        .attr("x", x)
        .attr("y", 44)
        .attr("font-size", 11)
        .attr("text-anchor", k === 0 ? "start" : k === spec.ticks.length - 1 ? "end" : "middle")
        .text(tick.label);
    });
  }

  const logTick = (value, label) => ({ at: Math.log10(1 + value) / FREQ_DOMAIN, label });

  function drawLegends() {
    if (!state.result) return;
    if (state.stage >= 2) {
      drawLegend($("#matrix-legend"), {
        id: "legend-red",
        title: "log10(count + 1) × weight",
        ticks: [0, 1, 2, 3, 4, 5].map((v) => ({ at: v / FREQ_DOMAIN, label: String(v) })),
      });
    } else {
      drawLegend($("#matrix-legend"), {
        id: "legend-red",
        title: "Words per million (log scale)",
        ticks: [logTick(0, "0"), logTick(1, "1"), logTick(10, "10"), logTick(100, "100"), logTick(1000, "1k"), logTick(10000, "10k"), logTick(100000, "100k")],
      });
    }
  }

  /* ------------------------------------------------------------------ the number table */

  function renderTable() {
    const result = state.result;
    const step2 = state.stage >= 2;

    const table = d3.select("#matrix-table");
    table.selectAll("*").remove();
    const head = table.append("thead").append("tr");
    head.append("th").attr("scope", "col").text("Word");
    head.selectAll("th.corpus").data(COLUMNS).join("th").attr("class", "corpus").attr("scope", "col").attr("title", (d) => d.long).text((d) => d.short);
    const body = table.append("tbody");
    if (step2) {
      const row = body.append("tr").attr("class", "sub");
      row.append("th").attr("scope", "row").text("Column weight");
      row.selectAll("td").data(COLUMNS).join("td").text((d) => (result.weighted.empty[d.j] ? "–" : fmt3(clamp(result.weighted.weights[d.j], 0, 1))));
    }
    result.words.forEach((word, i) => {
      const row = body.append("tr");
      row.append("th").attr("scope", "row").text(word);
      row
        .selectAll("td")
        .data(COLUMNS)
        .join("td")
        .text((d) => (step2 ? fmt3(result.weighted.matrix[i][d.j]) : fmtFreq(result.frequencies[i][d.j])));
    });
  }

  /* ------------------------------------------------------------------ captions and buttons */

  // In the dark theme the ramp runs the other way, so the sentence about colour depends on the theme.
  function captionFor(stage) {
    if (stage === 0) return "Choose a stock sentence or type your own text, then press 1.";
    if (stage === 1) {
      const scale = themeMode() === "dark" ? "bright red is common, dark is rare or missing" : "dark red is common, white is rare or missing";
      return `Each row is a word from your text and each column is a collection of writing. A tile shows how often the word appears there per million words: ${scale}. The BNC column is the dictionary's own count. Hover a tile for details. Press 2 next.`;
    }
    if (stage === 2) {
      return "Log entropy gave each column a weight from 0 to 1 (the bars under the columns). Each tile is now log10(count + 1) × weight. Where every word has a similar count, the weight is near 0 and the column fades out. Where a few words stand out, the column keeps its colour. Press 3 next.";
    }
    return "The classifier compared every pair of rows by cosine. The two outlined rows are the pair with the lowest score, and that score decides.";
  }

  function updateUi(captionOverride) {
    const stage = state.stage;
    els.step1.disabled = state.busy;
    els.step2.disabled = state.busy || stage !== 1 || state.stale;
    els.step3.disabled = state.busy || stage !== 2 || state.stale;
    els.reset.disabled = state.busy || (stage === 0 && !state.result);
    els.step1.classList.toggle("done", stage >= 1 && !state.stale);
    els.step2.classList.toggle("done", stage >= 2);
    els.step3.classList.toggle("done", stage >= 3);

    let text = captionOverride || captionFor(stage);
    if (state.stale && !state.busy && stage > 0) text = "You changed the text. Press 1 to run the new text.";
    els.caption.textContent = text;

    $("#matrix-title").textContent = stage >= 2 ? "Step 2: after log entropy" : "Step 1: word frequencies";
    $("#matrix-sub").textContent =
      stage >= 3
        ? "Each tile is log10(count + 1) × the weight of its column. The two outlined rows have the lowest cosine."
        : stage >= 2
          ? "Each tile is log10(count + 1) × the weight of its column."
          : "Words per million in each collection of writing.";
  }

  function setMessage(text) {
    els.message.textContent = text;
  }

  /* ------------------------------------------------------------------ the three steps */

  function clearViews() {
    els.verdict.hidden = true;
    els.verdict.replaceChildren();
    d3.select("#matrix").selectAll("*").remove();
    d3.select("#fly").selectAll("*").remove();
    tipHide();
  }

  async function onStep1() {
    if (state.busy) return;
    const result = Core.analyse(lexicon, els.text.value);
    if (!result.ok) {
      setMessage(
        result.reason === "tooFew"
          ? `Enter at least ${Core.MIN_WORDS} words.`
          : `Enter ${Core.MAX_WORDS} words or fewer. This text has ${result.words.length}.`
      );
      els.text.focus();
      return;
    }
    setMessage("");
    clearViews();
    state.result = result;
    state.text = els.text.value;
    state.stale = false;
    state.stage = 0;
    state.tiles = buildTiles(result);
    state.busy = true;
    const animate = !reduceMotion();
    updateUi(animate ? "The tiles are flying in. Click anywhere to skip." : "");
    try {
      els.matrixPanel.hidden = false;
      drawMatrix({ hideTiles: animate });
      renderTable();
      state.stage = 1;
      drawLegends();
      els.matrixPanel.scrollIntoView({ block: "start" });
      if (animate) await flyIn();
      d3.selectAll("#matrix .tiles rect").attr("opacity", 1);
    } finally {
      state.busy = false;
      updateUi();
    }
    els.step2.focus({ preventScroll: true });
  }

  async function onStep2() {
    if (state.busy || state.stage !== 1 || state.stale) return;
    state.busy = true;
    state.stage = 2;
    updateUi();
    try {
      const animate = !reduceMotion();
      d3.select("#matrix").attr("height", state.geo.height + state.geo.stripH);
      const tiles = d3.selectAll("#matrix .tiles rect");
      drawWeights(animate);
      drawLegends();
      renderTable();
      if (animate) {
        // the tiles change colour right now, over one second
        await tiles.transition().duration(1000).ease(d3.easeCubicInOut).attr("fill", fillStep2).end().catch(() => {});
      } else {
        tiles.attr("fill", fillStep2);
      }
    } finally {
      state.busy = false;
      updateUi();
    }
    els.step3.focus({ preventScroll: true });
  }

  // The matrix stays where it is. The two lowest rows are outlined, then the verdict appears above it.
  async function onStep3() {
    if (state.busy || state.stage !== 2 || state.stale) return;
    state.busy = true;
    state.stage = 3;
    updateUi();
    try {
      const animate = !reduceMotion();
      drawPairMark(animate);
      if (animate) await sleep(500);
      renderVerdict();
      els.verdict.scrollIntoView({ block: "nearest" }); // only moves the page if the card is out of sight
    } finally {
      state.busy = false;
      updateUi();
    }
    els.reset.focus({ preventScroll: true });
  }

  function onReset() {
    if (state.busy) return;
    clearViews();
    els.matrixPanel.hidden = true;
    state.stage = 0;
    state.result = null;
    state.tiles = [];
    state.stale = false;
    setMessage("");
    updateUi();
    els.text.focus();
  }

  /* ------------------------------------------------------------------ wiring */

  function onTextEdited() {
    const edited = els.text.value !== state.text;
    state.stale = Boolean(state.result) && edited;
    if (els.sample.value && sampleById.get(els.sample.value).text !== els.text.value) els.sample.value = "";
    setMessage("");
    updateUi();
  }

  function onSamplePicked() {
    const item = sampleById.get(els.sample.value);
    if (!item) return;
    els.text.value = item.text;
    onTextEdited();
  }

  function relayout() {
    if (!state.result || state.busy) return;
    const was = state.geo ? state.geo.width : 0;
    drawMatrix();
    if (state.stage >= 2) drawWeights(false);
    if (state.stage >= 3) {
      drawPairMark(false);
      renderVerdict();
    }
    if (was !== state.geo.width) tipHide();
    updateHint();
  }

  function recolor() {
    if (!state.result) return;
    d3.selectAll("#matrix .tiles rect").attr("fill", tileFill);
    drawLegends();
    if (!state.busy) updateUi();
  }

  function debounce(fn, ms) {
    let timer = 0;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  function init() {
    buildSampleList();
    els.sample.addEventListener("change", onSamplePicked);
    els.text.addEventListener("input", onTextEdited);
    els.step1.addEventListener("click", onStep1);
    els.step2.addEventListener("click", onStep2);
    els.step3.addEventListener("click", onStep3);
    els.reset.addEventListener("click", onReset);
    window.addEventListener("resize", debounce(relayout, 150));
    darkQuery.addEventListener("change", recolor);
    new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // The sticky step bar covers the top of the screen, so scrolling leaves room for its height.
    const bar = $(".steps");
    const syncBar = () => document.documentElement.style.setProperty("--bar", bar.offsetHeight + "px");
    syncBar();
    if (window.ResizeObserver) new ResizeObserver(syncBar).observe(bar);
    else window.addEventListener("resize", syncBar);

    updateUi();
  }

  init();
})();
