/* Position sizer.
   Volume is derived from the stop distance, never the other way round:

     lot = risk in USD / (stop distance x contract size x quote-to-USD rate)

   Speed features, because this gets used with a live chart open:
     - stop and target can be typed as a number of points instead of a price
     - in price mode, trailing digits expand against the entry (533 -> 1.35533)
     - pair, balance, risk, leverage and mode are remembered between sessions
     - the volume itself is click-to-copy                                     */
(function () {
  "use strict";

  var SPECS = {
    EURUSD: { c: 100000, q: "USD", b: "EUR" }, GBPUSD: { c: 100000, q: "USD", b: "GBP" },
    AUDUSD: { c: 100000, q: "USD", b: "AUD" }, NZDUSD: { c: 100000, q: "USD", b: "NZD" },
    USDJPY: { c: 100000, q: "JPY", b: "USD" }, USDCHF: { c: 100000, q: "CHF", b: "USD" },
    USDCAD: { c: 100000, q: "CAD", b: "USD" }, EURJPY: { c: 100000, q: "JPY", b: "EUR" },
    GBPJPY: { c: 100000, q: "JPY", b: "GBP" }, EURGBP: { c: 100000, q: "GBP", b: "EUR" },
    XAUUSD: { c: 100, q: "USD", b: "XAU" },    XAGUSD: { c: 5000, q: "USD", b: "XAG" },
    USOIL:  { c: 1000, q: "USD", b: "OIL" },   UKOIL:  { c: 1000, q: "USD", b: "OIL" },
    BTCUSD: { c: 1, q: "USD", b: "BTC" },      ETHUSD: { c: 1, q: "USD", b: "ETH" },
    US30:   { c: 1, q: "USD", b: "IDX" },      NAS100: { c: 1, q: "USD", b: "IDX" },
    SP500:  { c: 1, q: "USD", b: "IDX" }
  };

  /* Placeholder prices only, so the form is never empty. Not live quotes. */
  var SEED = {
    EURUSD: [1.08500, 1.08100, 1.09300], GBPUSD: [1.27000, 1.26500, 1.28000],
    AUDUSD: [0.65500, 0.65200, 0.66100], NZDUSD: [0.60500, 0.60200, 0.61100],
    USDJPY: [155.000, 154.400, 156.200], USDCHF: [0.88000, 0.87600, 0.88800],
    USDCAD: [1.36000, 1.35600, 1.36800], EURJPY: [168.000, 167.300, 169.400],
    GBPJPY: [197.000, 196.100, 198.800], EURGBP: [0.85400, 0.85100, 0.86000],
    XAUUSD: [2650.00, 2635.00, 2680.00], XAGUSD: [31.000, 30.700, 31.600],
    USOIL:  [71.50, 70.60, 73.30],       UKOIL:  [75.20, 74.30, 77.00],
    BTCUSD: [68000.00, 66500.00, 71000.00], ETHUSD: [2600.00, 2540.00, 2720.00],
    US30:   [42000.00, 41800.00, 42400.00], NAS100: [19500.00, 19380.00, 19740.00],
    SP500:  [5800.00, 5770.00, 5860.00]
  };

  /* Fallback conversion rates for cross pairs. Editable in the UI. */
  var RATES = { USD: 1, JPY: 0.0065, EUR: 1.08, GBP: 1.27, CHF: 1.13, CAD: 0.73, AUD: 0.65 };

  /* Plausible price band per symbol, deliberately wide. Its only job is to
     catch prices that belong to a different instrument - the commonest way
     to get a nonsensical volume out of a correct formula. */
  var RANGE = {
    EURUSD: [0.5, 2], GBPUSD: [0.8, 2.5], AUDUSD: [0.3, 1.2], NZDUSD: [0.3, 1.2],
    USDJPY: [60, 300], USDCHF: [0.4, 2], USDCAD: [0.8, 2.2],
    EURJPY: [70, 320], GBPJPY: [90, 400], EURGBP: [0.4, 1.3],
    XAUUSD: [300, 20000], XAGUSD: [3, 300], USOIL: [5, 400], UKOIL: [5, 400],
    BTCUSD: [500, 2000000], ETHUSD: [20, 100000],
    US30: [3000, 200000], NAS100: [1000, 200000], SP500: [300, 50000]
  };

  var MAX_LOT = 100;        /* largest single order most brokers accept */
  var STORE_KEY = "hanadollars.sizer.v1";

  function looksLike(p) {
    var hits = [];
    for (var k in RANGE) if (p >= RANGE[k][0] && p <= RANGE[k][1]) hits.push(k);
    return hits;
  }

  var $ = function (i) { return document.getElementById(i); };
  var pair = $("pair"), customBox = $("customBox"), customPair = $("customPair"),
      contract = $("contract"), qccy = $("qccy"), rateBox = $("rateBox"),
      qrate = $("qrate"), qrateLabel = $("qrateLabel");
  var balance = $("balance"), riskUsd = $("riskUsd"), riskPct = $("riskPct"), chips = $("riskChips");
  var entry = $("entry"), sl = $("sl"), tp = $("tp"), lev = $("lev"),
      volEl = $("vol"), slLabel = $("slLabel"), tpLabel = $("tpLabel"), derived = $("derived");

  if (!pair || !volEl) return;

  var anchor = "pct", last = {}, lastVol = "";
  var resultCard = $("vol").closest(".card");

  /* Results only move when Calculate is pressed, so a half-typed price never
     shows up as a volume. Anything not yet recalculated is marked stale. */
  function markStale() { if (resultCard) resultCard.classList.add("stale"); }
  function clearStale() { if (resultCard) resultCard.classList.remove("stale"); }
  function onEdit() { syncRisk(); save(); markStale(); }

  /* The fields are plain text so the browser never reformats them. Commas
     mean different things in different fields: a decimal comma in a price,
     a thousands separator in an amount. Each field says which it is. */
  function parseNum(raw, commaIsDecimal) {
    var t = String(raw).replace(/[\s\u00a0]/g, "");
    if (!t) return NaN;
    if (t.indexOf(",") > -1 && t.indexOf(".") > -1) {
      t = t.lastIndexOf(",") > t.lastIndexOf(".")
        ? t.replace(/\./g, "").replace(",", ".")
        : t.replace(/,/g, "");
    } else if (t.indexOf(",") > -1) {
      t = commaIsDecimal ? t.replace(",", ".") : t.replace(/,/g, "");
    }
    var v = parseFloat(t);
    return isFinite(v) ? v : NaN;
  }
  function n(el) { return parseNum(el.value, false); }      /* amounts */
  function np(el) { return parseNum(el.value, true); }      /* prices */
  function side() { return document.querySelector("input[name=side]:checked").value; }
  function slMode() { return document.querySelector("input[name=slmode]:checked").value; }
  function usd(v) {
    return isFinite(v)
      ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "\u2014";
  }
  /* Decimal places come from exactly what was typed, trailing zeros and
     all - 1.08500 is a 5-decimal symbol, 1.085 is not. */
  function dec() {
    var t = String(entry.value).replace(/[\s\u00a0]/g, "").replace(",", ".");
    var i = t.indexOf(".");
    var d = i < 0 ? 2 : Math.min(8, t.length - i - 1);
    return d < 2 ? 2 : d;
  }
  function pointSize() { return Math.pow(10, -dec()); }
  function pxs(v) { return isFinite(v) ? v.toFixed(dec()) : "\u2014"; }
  function symbol() {
    return pair.value === "CUSTOM"
      ? (customPair.value.trim().toUpperCase() || "CUSTOM")
      : pair.value;
  }

  /* Resolve the stop and target to actual prices, whichever mode is active. */
  function levels() {
    var E = np(entry);
    if (slMode() === "price") return { E: E, S: np(sl), T: np(tp) };
    var ps = pointSize(), sp = n(sl), tpp = n(tp), up = side() === "buy";
    return {
      E: E,
      S: isFinite(sp) && sp > 0 ? (up ? E - sp * ps : E + sp * ps) : NaN,
      T: isFinite(tpp) && tpp > 0 ? (up ? E + tpp * ps : E - tpp * ps) : NaN
    };
  }

  /* "533" against an entry of 1.35400 means 1.35533. Picks whichever
     rollover of the leading digits lands closest to the entry. */
  function expand(el) {
    if (slMode() !== "price") return;
    var raw = String(el.value).trim(), E = np(entry);
    if (!/^\d+$/.test(raw) || !(E > 0)) return;
    var d = dec(), base = E.toFixed(d), digits = base.replace(".", "");
    /* Only trailing decimals are shorthand. On gold, "2635" is already a
       whole price, not the tail of 2650.00, so leave it alone. */
    if (raw.length > d || raw.length >= digits.length) return;
    var head = digits.slice(0, digits.length - raw.length), dot = base.indexOf("."), best = null;
    [-1, 0, 1].forEach(function (k) {
      var h = String(Number(head) + k);
      if (Number(h) < 0 || h.length > head.length) return;
      while (h.length < head.length) h = "0" + h;
      var joined = h + raw;
      var v = parseFloat(joined.slice(0, dot) + "." + joined.slice(dot));
      if (!isFinite(v)) return;
      if (best === null || Math.abs(v - E) < Math.abs(best - E)) best = v;
    });
    if (best !== null) el.value = best.toFixed(d);
  }

  /* Switching modes converts what is already typed, so nothing is retyped. */
  function applyMode() {
    var pts = slMode() === "points", ps = pointSize(), E = np(entry);
    slLabel.textContent = pts ? "Stop loss, points away" : "Stop loss price";
    tpLabel.textContent = pts ? "Take profit, points away" : "Take profit price";
    if (E > 0) {
      var S = n(sl), T = n(tp);
      if (pts) {
        if (isFinite(S) && S > 0 && Math.abs(S - E) < E) sl.value = Math.round(Math.abs(E - S) / ps);
        if (isFinite(T) && T > 0 && Math.abs(T - E) < E) tp.value = Math.round(Math.abs(T - E) / ps);
      } else {
        var L = levels();
        if (isFinite(L.S)) sl.value = L.S.toFixed(dec());
        if (isFinite(L.T)) tp.value = L.T.toFixed(dec());
      }
    }
    calc();
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        pair: pair.value, balance: balance.value, riskPct: riskPct.value,
        lev: lev.value, mode: slMode(), anchor: anchor
      }));
    } catch (e) { /* private mode or storage disabled - not important */ }
  }

  function restore() {
    var s;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { s = null; }
    if (!s) return;
    if (s.pair && (SPECS[s.pair] || s.pair === "CUSTOM")) pair.value = s.pair;
    if (s.balance) balance.value = s.balance;
    if (s.riskPct) riskPct.value = s.riskPct;
    if (s.lev) lev.value = s.lev;
    if (s.anchor) anchor = s.anchor;
    if (s.mode === "points") $("mPoints").checked = true;
  }

  function spec() {
    if (pair.value === "CUSTOM") {
      var q = qccy.value;
      return { c: n(contract), qu: q === "USD" ? 1 : n(qrate) };
    }
    var s = SPECS[pair.value], e = n(entry), qu;
    if (s.q === "USD") qu = 1;
    else if (s.b === "USD") qu = e > 0 ? 1 / e : NaN;
    else qu = RATES[s.q] || NaN;
    return { c: s.c, qu: qu };
  }

  function syncRisk() {
    var B = n(balance);
    if (B > 0) {
      if (anchor === "pct") {
        var p = n(riskPct);
        if (p > 0) riskUsd.value = (B * p / 100).toFixed(2);
      } else {
        var a = n(riskUsd);
        if (a > 0) riskPct.value = (a / B * 100).toFixed(2);
      }
    }
    var cur = parseFloat(riskPct.value);
    Array.prototype.forEach.call(chips.children, function (c) {
      c.className = Math.abs(parseFloat(c.getAttribute("data-pct")) - cur) < 0.001 ? "chip on" : "chip";
    });
  }

  function onCcy() {
    var q = qccy.value;
    if (q === "USD") {
      rateBox.className = "f hide";
    } else {
      rateBox.className = "f";
      qrateLabel.textContent = "1 " + (q === "OTHER" ? "quote unit" : q) + " = ? USD";
      if (RATES[q]) qrate.value = RATES[q];
    }
    calc();
  }

  function onPair() {
    var custom = pair.value === "CUSTOM";
    customBox.className = custom ? "" : "hide";
    if (!custom) {
      var s = SEED[pair.value], buy = side() === "buy";
      entry.value = s[0];
      var stop = buy ? s[1] : s[2], target = buy ? s[2] : s[1];
      if (slMode() === "points") {
        var ps = pointSize();
        sl.value = Math.round(Math.abs(s[0] - stop) / ps);
        tp.value = Math.round(Math.abs(target - s[0]) / ps);
      } else {
        sl.value = stop;
        tp.value = target;
      }
    }
    calc();
  }

  function calc() {
    var msgs = [], bad = false;
    syncRisk();
    save();
    clearStale();
    var sp = spec(), C = sp.c, QU = sp.qu, lv = levels();
    var E = lv.E, S = lv.S, T = lv.T, B = n(balance),
        RA = n(riskUsd), L = n(lev), dir = side();

    derived.textContent = (slMode() === "points" && isFinite(S) && isFinite(T))
      ? "Stop " + pxs(S) + "   \u00b7   Target " + pxs(T)
      : "";

    if (!(C > 0)) { msgs.push(["err", "Enter how many units make up one lot."]); bad = true; }
    if (!(QU > 0)) { msgs.push(["err", "Enter what one unit of the quote currency is worth in US dollars."]); bad = true; }
    if (!(E > 0)) { msgs.push(["err", "Enter the entry price."]); bad = true; }
    if (!(S > 0) || !(T > 0)) {
      msgs.push(["err", slMode() === "points"
        ? "Enter how many points away the stop and the target sit."
        : "The stop loss and take profit must both be positive prices."]);
      bad = true;
    }
    if (!(B > 0)) { msgs.push(["err", "Enter your current balance."]); bad = true; }
    if (!(RA > 0)) { msgs.push(["err", "Enter how much you are willing to lose on this trade."]); bad = true; }
    if (!(L >= 1)) { msgs.push(["err", "Leverage must be at least 1."]); bad = true; }
    if (!bad && slMode() === "price") {
      if (dir === "buy" && !(S < E && T > E)) { msgs.push(["err", "On a buy, the stop loss sits below the entry and the take profit above it."]); bad = true; }
      if (dir === "sell" && !(S > E && T < E)) { msgs.push(["err", "On a sell, the stop loss sits above the entry and the take profit below it."]); bad = true; }
    }
    if (!bad && RA > B) { msgs.push(["err", "The amount you want to risk is larger than your balance."]); bad = true; }

    /* Does the price belong to the symbol that is selected? */
    if (!bad && pair.value !== "CUSTOM" && RANGE[pair.value]) {
      var band = RANGE[pair.value];
      if (E < band[0] || E > band[1]) {
        var hint = looksLike(E);
        var m = pair.value + " normally trades between " +
          band[0].toLocaleString("en-US") + " and " + band[1].toLocaleString("en-US") +
          ", but the entry you typed is outside that range.";
        m += (hint.length && hint.indexOf(pair.value) === -1)
          ? " That price looks like " + hint.slice(0, 3).join(" or ") + ". Switch the symbol, or correct the price."
          : " Check the price before sizing anything.";
        msgs.push(["err", m]);
        bad = true;
      }
    }
    if (bad) { paint(null, msgs); return; }

    var slDist = Math.abs(E - S), tpDist = Math.abs(T - E);
    var perLot = slDist * C * QU;
    var raw = RA / perLot;
    var lot = Math.floor(raw * 100) / 100;

    if (lot < 0.01) {
      lot = 0.01;
      msgs.push(["warn", "The smallest volume of 0.01 lots already loses " + usd(0.01 * perLot) +
        " at this stop, more than the " + usd(RA) + " you allowed. Move the stop closer, add funds, or skip the trade."]);
    }

    /* A volume this size is never a real trade - it means the inputs disagree. */
    if (lot > MAX_LOT) {
      msgs.push(["err", "This works out to " + lot.toFixed(2) + " lots, far above the " + MAX_LOT +
        "-lot ceiling most brokers place on a single order. A number this large almost always means the stop sits too close to the entry, or the prices do not belong to " +
        symbol() + "."]);
      paint(null, msgs);
      return;
    }

    if (slDist / E < 0.0002) {
      msgs.push(["warn", "The stop is only " + (slDist / E * 100).toFixed(4) +
        "% away from the entry. On most symbols that is inside the spread, and the position size it produces will be far larger than you intend."]);
    }

    var lossUsd = lot * perLot,
        winUsd = lot * tpDist * C * QU,
        rr = tpDist / slDist,
        margin = C * lot * E * QU / L,
        free = B - margin;

    if (margin > B) {
      msgs.push(["err", "Margin of " + usd(margin) + " is more than the whole balance. Raise the leverage or cut the volume."]);
    } else if (margin > B * 0.5) {
      msgs.push(["warn", "Margin takes " + (margin / B * 100).toFixed(0) +
        "% of the balance. A normal swing can margin-call you before the stop is reached."]);
    }
    if (rr < 1) {
      msgs.push(["warn", "You are risking " + usd(lossUsd) + " to make " + usd(winUsd) +
        ". At this ratio you need to win far more often than you lose."]);
    }

    var ps = pointSize();
    var slPts = slDist / ps, tpPts = tpDist / ps, pointVal = lot * C * ps * QU;

    last = { sym: symbol(), dir: dir, lot: lot, E: E, S: S, T: T,
             lossUsd: lossUsd, winUsd: winUsd, rr: rr, margin: margin, free: free,
             slPts: slPts, tpPts: tpPts, pointVal: pointVal };

    paint({ lot: lot, raw: raw, target: RA, lossUsd: lossUsd, winUsd: winUsd,
            rr: rr, margin: margin, free: free,
            slPts: slPts, tpPts: tpPts, pointVal: pointVal }, msgs);
  }

  function paint(o, msgs) {
    var box = $("msgs");
    box.innerHTML = "";
    msgs.forEach(function (m) {
      var p = document.createElement("p");
      p.className = "msg " + m[0];
      p.textContent = m[1];
      box.appendChild(p);
    });

    if (!o) {
      volEl.innerHTML = '0.00<span>lots</span>';
      lastVol = "";
      last = {};
      $("under").textContent = "Complete the fields to get a volume.";
      ["oSl", "oTp", "oRr", "oSlPts", "oTpPts", "oPoint", "oMargin", "oFree"]
        .forEach(function (i) { $(i).textContent = "\u2014"; });
      return;
    }

    var v = o.lot.toFixed(2);
    volEl.innerHTML = v + '<span>lots</span>';
    volEl.title = "Click to copy " + v;
    if (v !== lastVol) {
      volEl.classList.remove("tick");
      void volEl.offsetWidth;
      volEl.classList.add("tick");
      lastVol = v;
    }
    $("under").textContent = "You allowed " + usd(o.target) + ". This volume loses " + usd(o.lossUsd) +
      " if the stop is hit. Exact size " + o.raw.toFixed(4) + " lots, rounded down to the tradable step.";
    $("oSl").textContent = "\u2212" + usd(o.lossUsd);
    $("oTp").textContent = "+" + usd(o.winUsd);
    $("oRr").textContent = "1 : " + o.rr.toFixed(2);
    $("oSlPts").textContent = Math.round(o.slPts).toLocaleString("en-US") + " points";
    $("oTpPts").textContent = Math.round(o.tpPts).toLocaleString("en-US") + " points";
    $("oPoint").textContent = "$" + (o.pointVal < 1 ? o.pointVal.toFixed(4) : o.pointVal.toFixed(2));
    $("oMargin").textContent = usd(o.margin);
    $("oFree").textContent = usd(o.free);
  }

  function flash(btn, text, revert) {
    btn.textContent = text;
    setTimeout(function () { btn.textContent = revert; }, 1400);
  }

  pair.addEventListener("change", onPair);
  qccy.addEventListener("change", onCcy);

  document.querySelectorAll("input[name=side]").forEach(function (e) {
    e.addEventListener("change", function () {
      /* Flipping direction mirrors the levels instead of invalidating them. */
      if (slMode() === "price") { var a = sl.value; sl.value = tp.value; tp.value = a; }
      calc();
    });
  });

  document.querySelectorAll("input[name=slmode]").forEach(function (e) {
    e.addEventListener("change", applyMode);
  });

  riskPct.addEventListener("input", function () { anchor = "pct"; onEdit(); });
  riskUsd.addEventListener("input", function () { anchor = "amt"; onEdit(); });
  [customPair, contract, qrate, balance, entry, sl, tp, lev].forEach(function (e) {
    e.addEventListener("input", onEdit);
  });

  [sl, tp].forEach(function (e) {
    e.addEventListener("change", function () { expand(e); markStale(); });
  });

  /* Enter anywhere in the form is the same as pressing Calculate. */
  [customPair, contract, qrate, balance, riskUsd, riskPct, entry, sl, tp, lev]
    .forEach(function (e) {
      e.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        if (e === sl || e === tp) expand(e);
        calc();
        e.blur();
      });
    });

  $("run").addEventListener("click", function () {
    expand(sl); expand(tp); calc();
  });

  chips.addEventListener("click", function (ev) {
    var b = ev.target;
    if (!b || b.className.indexOf("chip") === -1) return;
    anchor = "pct";
    riskPct.value = b.getAttribute("data-pct");
    calc();
  });

  volEl.addEventListener("click", function () {
    if (!last.lot) return;
    navigator.clipboard.writeText(last.lot.toFixed(2));
    var span = volEl.querySelector("span");
    if (span) {
      span.textContent = "copied";
      setTimeout(function () { span.textContent = "lots"; }, 1200);
    }
  });

  $("copy").addEventListener("click", function () {
    var b = $("copy");
    if (!last.lot) { flash(b, "Nothing to copy", "Copy the plan"); return; }
    var t = [
      last.sym + " " + last.dir.toUpperCase() + "  \u2014  " + last.lot.toFixed(2) + " lots",
      "Entry " + pxs(last.E) + " | SL " + pxs(last.S) + " | TP " + pxs(last.T),
      "Stop loss " + usd(last.lossUsd) + " (" + Math.round(last.slPts) + " pts) | Take profit " +
        usd(last.winUsd) + " (" + Math.round(last.tpPts) + " pts) | SL/TP 1 : " + last.rr.toFixed(2),
      "Margin " + usd(last.margin) + " | Free margin " + usd(last.free)
    ].join("\n");
    navigator.clipboard.writeText(t).then(
      function () { flash(b, "Copied", "Copy the plan"); },
      function () { flash(b, "Copy failed", "Copy the plan"); }
    );
  });

  restore();
  onPair();
  if (slMode() === "points") applyMode();
})();
