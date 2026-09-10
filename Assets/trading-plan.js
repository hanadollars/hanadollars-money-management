/* Trading plan.

   Two risk rules, two different arithmetics.

   Fixed stake (linear):
     net wins = (target - capital) / (loss x R)
     trades at win rate w = (target - capital) / (loss x (w(1+R) - 1))
     break-even win rate = 1 / (1 + R)

   Percentage of balance (compounding). Growth is additive in logs:
     up = ln(1 + f*R)      one winner
     dn = ln(1 - f)        one loser, negative
     net wins = ln(target/capital) / up
     trades at win rate w = ln(target/capital) / (w*up + (1-w)*dn)
     break-even win rate = -dn / (up - dn)                              */
(function () {
  "use strict";

  var $ = function (i) { return document.getElementById(i); };
  var cap = $("pCap"), tgt = $("pTarget"), hor = $("pHorizon"), unit = $("pUnit"),
      amtIn = $("pLossAmt"), pctIn = $("pLossPctIn"), rr = $("pRr"),
      winEl = $("pWin"), modeEl = $("pMode");

  if (!cap || !winEl) return;

  var WEEKS_PER_MONTH = 4.345;
  var PLANS_KEY = "hanadollars.plans.v1";
  var mode = "amt", lastWin = "", store = {};

  function n(el) { var v = parseFloat(el.value); return isFinite(v) ? v : NaN; }

  function usd(v) {
    if (!isFinite(v)) return "\u2014";
    var big = Math.abs(v) >= 10000;
    return "$" + v.toLocaleString("en-US", {
      minimumFractionDigits: big ? 0 : 2,
      maximumFractionDigits: big ? 0 : 2
    });
  }

  function months() {
    var h = n(hor);
    if (!(h > 0)) return NaN;
    return unit.value === "w" ? h / WEEKS_PER_MONTH : unit.value === "y" ? h * 12 : h;
  }

  /* Only one of the two risk boxes is ever active. */
  function setMode(m) {
    mode = m;
    if (m === "amt") {
      pctIn.value = ""; pctIn.className = "off"; amtIn.className = "";
    } else {
      amtIn.value = ""; amtIn.className = "off"; pctIn.className = "";
    }
    modeEl.innerHTML = m === "amt"
      ? "<b>Using the fixed amount.</b> Every loss stays the same size no matter how the account grows, so the balance climbs in a straight line."
      : "<b>Using the percentage.</b> The loss grows with the account and shrinks after a drawdown, so the balance compounds and the goal arrives sooner.";
  }

  function calc() {
    var msgs = [], bad = false;
    var C = n(cap), TG = n(tgt), M = months(), R = n(rr);
    var L = mode === "amt" ? n(amtIn) : NaN;
    var f = mode === "pct" ? n(pctIn) / 100 : NaN;

    if (!(C > 0)) { msgs.push(["err", "Enter the capital you have now."]); bad = true; }
    if (!(TG > 0)) { msgs.push(["err", "Enter the amount you want to reach."]); bad = true; }
    if (!(M > 0)) { msgs.push(["err", "Enter how long you give yourself."]); bad = true; }
    if (!(R > 0)) { msgs.push(["err", "Enter the reward you aim for per 1 risked."]); bad = true; }
    if (mode === "amt" && !(L > 0)) { msgs.push(["err", "Enter the amount you accept to lose per trade."]); bad = true; }
    if (mode === "pct" && (!(f > 0) || f >= 1)) { msgs.push(["err", "The percentage must be between 0 and 100."]); bad = true; }
    if (!bad && TG <= C) { msgs.push(["err", "The target has to be larger than the capital you start with."]); bad = true; }
    if (!bad && mode === "amt" && L >= C) { msgs.push(["err", "One losing trade would take your whole account. Lower the amount you risk per trade."]); bad = true; }
    if (bad) { paint(null, msgs); return; }

    var weeks = M * WEEKS_PER_MONTH,
        P = TG - C,
        o = { C: C, TG: TG, M: M, R: R, P: P, weeks: weeks, mode: mode };

    if (mode === "amt") {
      o.L = L;
      o.W = L * R;
      o.netWins = P / o.W;
      o.be = 1 / (1 + R);
      o.Nfor = function (w) { var e = w * (1 + R) - 1; return e > 0 ? P / (L * e) : Infinity; };
      o.streak = C - 10 * L;
      o.lossPctTxt = (L / C * 100).toFixed(2) + "% of capital now";
      o.winTxt = "+" + usd(o.W);
      o.lossTxt = "\u2212" + usd(L);
      o.eqAt = function (m) { return C + P * m / M; };
      o.riskAt = function () { return L; };
    } else {
      var up = Math.log(1 + f * R), dn = Math.log(1 - f), lnG = Math.log(TG / C);
      o.f = f; o.up = up; o.dn = dn; o.lnG = lnG;
      o.netWins = lnG / up;
      o.be = -dn / (up - dn);
      o.Nfor = function (w) { var g = w * up + (1 - w) * dn; return g > 0 ? lnG / g : Infinity; };
      o.streak = C * Math.pow(1 - f, 10);
      o.lossPctTxt = (f * 100).toFixed(2) + "% of the balance, always";
      o.winTxt = "+" + usd(C * f * R) + " \u2192 " + usd(TG * f * R);
      o.lossTxt = "\u2212" + usd(C * f) + " \u2192 " + usd(TG * f);
      o.eqAt = function (m) { return C * Math.pow(TG / C, m / M); };
      o.riskAt = function (m) { return o.eqAt(m) * f; };
    }

    o.perMonth = o.netWins / M;
    o.perWeek = o.netWins / weeks;

    if (o.perWeek <= 1) { o.verdict = "Comfortable pace"; o.vcolor = "#4cc09a"; }
    else if (o.perWeek <= 3) { o.verdict = "Demanding and realistic"; o.vcolor = "#4cc09a"; }
    else if (o.perWeek <= 7) { o.verdict = "Aggressive"; o.vcolor = "#e2c078"; }
    else if (o.perWeek <= 15) { o.verdict = "Very few sustain this"; o.vcolor = "#ef8577"; }
    else { o.verdict = "Fantasy territory"; o.vcolor = "#ef8577"; }

    var lp = mode === "amt" ? L / C * 100 : f * 100;
    if (lp > 2) {
      msgs.push(["warn", "Each loss costs " + lp.toFixed(1) + "% of the account. Ten in a row leave " +
        usd(Math.max(0, o.streak)) + ". Most professionals keep this at or below 2%."]);
    }
    if (o.streak <= 0) {
      msgs.push(["err", "Ten losses in a row would wipe the account out completely at this size."]);
    }
    if (R < 1) {
      msgs.push(["warn", "Your target is smaller than your stop, so you need to win " +
        (o.be * 100).toFixed(0) + "% of trades just to stand still. Raising the reward ratio is usually easier than raising accuracy."]);
    }
    if (o.perWeek > 7) {
      msgs.push(["warn", "This needs " + o.perWeek.toFixed(1) +
        " net winning trades every week. Extend the deadline, raise the risk per trade, or lower the target."]);
    }

    o.under = mode === "amt"
      ? "Every winner banks " + usd(o.W) + " and every loser costs " + usd(L) + ". You need " +
        Math.ceil(o.netWins) + " more wins than losses to turn " + usd(C) + " into " + usd(TG) + "."
      : "Risking " + (f * 100).toFixed(2) + "% each time, a winner is worth " + usd(C * f * R) +
        " today and " + usd(TG * f * R) + " once you reach the target. Because the size grows with the account, the goal needs fewer wins than a fixed stake would.";

    store = o;
    paint(o, msgs);
  }

  function paint(o, msgs) {
    var box = $("pMsgs");
    box.innerHTML = "";
    msgs.forEach(function (m) {
      var p = document.createElement("p");
      p.className = "msg " + m[0];
      p.textContent = m[1];
      box.appendChild(p);
    });

    if (!o) {
      winEl.innerHTML = '&mdash;<span>net wins</span>';
      lastWin = "";
      $("pVerdict").innerHTML = "";
      $("pUnder").textContent = "Complete the fields to see what the goal demands.";
      ["pPerWin", "pPerLoss", "pPerMonth", "pPerWeek", "pProfit", "pLossPct", "pStreak", "pBe"]
        .forEach(function (i) { $(i).textContent = "\u2014"; });
      $("pScen").innerHTML = ""; $("pChart").innerHTML = ""; $("pMile").innerHTML = "";
      return;
    }

    var v = String(Math.ceil(o.netWins));
    winEl.innerHTML = v + '<span>net wins</span>';
    winEl.style.color = o.vcolor;
    if (v !== lastWin) {
      winEl.classList.remove("tick");
      void winEl.offsetWidth;
      winEl.classList.add("tick");
      lastWin = v;
    }
    $("pVerdict").innerHTML = '<span class="verdict" style="color:' + o.vcolor +
      ';border-color:' + o.vcolor + '">' + o.verdict + '</span>';
    $("pUnder").textContent = o.under;

    $("pPerWin").textContent = o.winTxt;
    $("pPerLoss").textContent = o.lossTxt;
    $("pPerMonth").textContent = o.perMonth.toFixed(1) + " wins / month";
    $("pPerWeek").textContent = o.perWeek.toFixed(1) + " wins / week";
    $("pProfit").textContent = usd(o.P);
    $("pLossPct").textContent = o.lossPctTxt;
    $("pStreak").textContent = usd(Math.max(0, o.streak));
    $("pBe").textContent = (o.be * 100).toFixed(1) + "%";

    scenarios(o);
    chart(o);
    milestones(o);
  }

  function scenarios(o) {
    var rows = "";
    [0.35, 0.40, 0.45, 0.50, 0.55, 0.60].forEach(function (w) {
      var N = o.Nfor(w);
      if (!isFinite(N) || N <= 0) {
        rows += '<tr><td>' + (w * 100).toFixed(0) +
          '%</td><td colspan="4" style="text-align:right;color:#ef8577">never reaches the target</td></tr>';
        return;
      }
      rows += '<tr><td>' + (w * 100).toFixed(0) + '%</td><td>' + Math.ceil(N) +
        '</td><td style="color:#4cc09a">' + Math.round(N * w) +
        '</td><td style="color:#ef8577">' + Math.round(N * (1 - w)) +
        '</td><td>' + (N / o.weeks).toFixed(1) + '</td></tr>';
    });
    $("pScen").innerHTML = rows;
  }

  /* Trades needed against win rate, with the break-even asymptote marked. */
  function chart(o) {
    var W = 560, H = 200, PL = 54, PR = 14, PT = 14, PB = 32;
    var be = o.be, x0 = be + 0.015, x1 = Math.max(0.72, be + 0.30);
    if (x0 >= x1 || !isFinite(be)) { $("pChart").innerHTML = ""; return; }

    var ref = o.Nfor(Math.min(x1 - 0.02, be + 0.17));
    var maxY = Math.min(o.Nfor(x0), Math.max(ref * 2.2, 10));
    if (!isFinite(maxY) || maxY <= 0) maxY = 100;

    function X(w) { return PL + (W - PL - PR) * ((w - x0) / (x1 - x0)); }
    function Y(v) { return PT + (H - PT - PB) * (1 - Math.min(v, maxY) / maxY); }

    var d = "", started = false, i, w, v;
    for (i = 0; i <= 100; i++) {
      w = x0 + (x1 - x0) * i / 100;
      v = o.Nfor(w);
      if (!isFinite(v) || v > maxY) continue;
      d += (started ? "L" : "M") + X(w).toFixed(1) + " " + Y(v).toFixed(1) + " ";
      started = true;
    }

    var grid = "", g, val, y;
    for (g = 0; g <= 3; g++) {
      val = maxY * g / 3; y = Y(val);
      grid += '<line x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (W - PR) +
        '" y2="' + y.toFixed(1) + '" stroke="rgba(255,255,255,.08)"/>';
      grid += '<text x="' + (PL - 8) + '" y="' + (y + 4).toFixed(1) +
        '" text-anchor="end" fill="#93aaab" font-size="11" font-family="IBM Plex Mono, monospace">' +
        Math.round(val) + '</text>';
    }

    var ticks = "", t, wv;
    for (t = 0; t <= 4; t++) {
      wv = x0 + (x1 - x0) * t / 4;
      ticks += '<text x="' + X(wv).toFixed(1) + '" y="' + (H - 10) +
        '" text-anchor="middle" fill="#93aaab" font-size="11" font-family="IBM Plex Mono, monospace">' +
        (wv * 100).toFixed(0) + '%</text>';
    }

    var half = "";
    if (0.5 >= x0 && 0.5 <= x1 && isFinite(o.Nfor(0.5)) && o.Nfor(0.5) <= maxY) {
      half = '<circle cx="' + X(0.5).toFixed(1) + '" cy="' + Y(o.Nfor(0.5)).toFixed(1) + '" r="4" fill="#c9a14a"/>' +
        '<text x="' + (X(0.5) + 9).toFixed(1) + '" y="' + (Y(o.Nfor(0.5)) - 6).toFixed(1) +
        '" fill="#e2c078" font-size="11.5" font-family="IBM Plex Sans, sans-serif">' +
        Math.ceil(o.Nfor(0.5)) + ' trades at 50%</text>';
    }

    $("pChart").innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' +
      '<title>Trades needed to reach the target at each win rate</title>' + grid +
      '<line x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (H - PB) +
      '" stroke="#ef8577" stroke-width="1.5" stroke-dasharray="4 4"/>' +
      '<text x="' + (PL + 8) + '" y="' + (PT + 13) +
      '" fill="#ef8577" font-size="11.5" font-family="IBM Plex Sans, sans-serif">break even ' +
      (be * 100).toFixed(0) + '%</text>' +
      '<path d="' + d.trim() + '" fill="none" stroke="#c9a14a" stroke-width="2.5" stroke-linejoin="round"/>' +
      half + ticks +
      '<text x="' + PL + '" y="14" fill="#93aaab" font-size="11" font-family="IBM Plex Sans, sans-serif">trades needed</text>' +
      '</svg>';
  }

  function milestones(o) {
    var rows = "", M = Math.round(o.M), step = Math.max(1, Math.ceil(M / 6)), m;
    for (m = step; m < M; m += step) {
      rows += '<tr><td>Month ' + m + '</td><td>' + usd(o.eqAt(m)) + '</td><td>' +
        Math.round(o.netWins * m / o.M) + '</td><td style="color:#93aaab">' +
        usd(o.riskAt(m)) + '</td></tr>';
    }
    rows += '<tr><td>Month ' + M + '</td><td style="color:#4cc09a">' + usd(o.TG) + '</td><td>' +
      Math.ceil(o.netWins) + '</td><td style="color:#93aaab">' + usd(o.riskAt(o.M)) + '</td></tr>';
    $("pMile").innerHTML = rows;
  }


  /* ---------- saved plans -------------------------------------------------
     Every plan is a snapshot of the inputs plus the headline figures, kept
     in this browser. Loading one puts the inputs back and recalculates.   */

  function readPlans() {
    try { return JSON.parse(localStorage.getItem(PLANS_KEY) || "[]"); }
    catch (e) { return []; }
  }

  function writePlans(list) {
    try { localStorage.setItem(PLANS_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }

  function planLabel(r) {
    return r.name || (usd(r.cap) + " \u2192 " + usd(r.target));
  }

  function renderPlans() {
    var list = readPlans(), box = $("pSaved"), wrap = $("pSavedWrap");
    if (!box || !wrap) return;
    wrap.style.display = list.length ? "" : "none";
    box.innerHTML = "";

    list.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "plan";

      var left = document.createElement("div");
      var t = document.createElement("p");
      t.className = "t";
      t.textContent = planLabel(r);
      var m = document.createElement("p");
      m.className = "m";
      m.textContent = r.months + " mo \u00b7 " + Math.ceil(r.netWins) + " net wins \u00b7 " +
        r.perWeek.toFixed(1) + "/wk \u00b7 risk " +
        (r.riskMode === "amt" ? usd(r.riskValue) : r.riskValue + "%") +
        " at 1:" + r.rr + " \u00b7 " + r.savedAt;
      left.appendChild(t); left.appendChild(m);

      var btns = document.createElement("div");
      btns.className = "btns";
      var load = document.createElement("button");
      load.type = "button"; load.className = "mini"; load.textContent = "Load";
      load.addEventListener("click", function () { loadPlan(r.id); });
      var del = document.createElement("button");
      del.type = "button"; del.className = "mini"; del.textContent = "Delete";
      del.addEventListener("click", function () { deletePlan(r.id); });
      btns.appendChild(load); btns.appendChild(del);

      row.appendChild(left); row.appendChild(btns);
      box.appendChild(row);
    });
  }

  function savePlan() {
    var btn = $("pSave");
    if (!store.netWins) {
      btn.textContent = "Nothing to save";
      setTimeout(function () { btn.textContent = "Save plan"; }, 1400);
      return;
    }
    var list = readPlans();
    var d = new Date();
    list.unshift({
      id: String(Date.now()),
      name: $("pName").value.trim(),
      savedAt: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
               "-" + String(d.getDate()).padStart(2, "0"),
      cap: store.C, target: store.TG,
      horizon: $("pHorizon").value, unit: unit.value, months: store.M.toFixed(0),
      riskMode: store.mode,
      riskValue: store.mode === "amt" ? store.L : +(store.f * 100).toFixed(2),
      rr: store.R,
      netWins: store.netWins, perWeek: store.perWeek, perMonth: store.perMonth, be: store.be
    });
    if (list.length > 50) list = list.slice(0, 50);

    if (writePlans(list)) {
      $("pName").value = "";
      btn.textContent = "Saved";
    } else {
      btn.textContent = "Could not save";
    }
    setTimeout(function () { btn.textContent = "Save plan"; }, 1400);
    renderPlans();
  }

  function loadPlan(id) {
    var r = readPlans().filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    cap.value = r.cap;
    tgt.value = r.target;
    hor.value = r.horizon;
    unit.value = r.unit;
    rr.value = r.rr;
    setMode(r.riskMode);
    if (r.riskMode === "amt") amtIn.value = r.riskValue; else pctIn.value = r.riskValue;
    $("pName").value = r.name || "";
    calc();
    document.getElementById("panel2").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function deletePlan(id) {
    writePlans(readPlans().filter(function (x) { return x.id !== id; }));
    renderPlans();
  }

  function exportPlans() {
    var list = readPlans();
    if (!list.length) return;
    var blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hanadollars-trading-plans.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  amtIn.addEventListener("input", function () { if (mode !== "amt") setMode("amt"); calc(); });
  pctIn.addEventListener("input", function () { if (mode !== "pct") setMode("pct"); calc(); });
  amtIn.addEventListener("focus", function () { if (mode !== "amt" && amtIn.value === "") setMode("amt"); });
  pctIn.addEventListener("focus", function () { if (mode !== "pct" && pctIn.value === "") setMode("pct"); });
  [cap, tgt, hor, rr].forEach(function (e) { e.addEventListener("input", calc); });
  unit.addEventListener("change", calc);

  $("pCopy").addEventListener("click", function () {
    var b = $("pCopy");
    if (!store.netWins) {
      b.textContent = "Nothing to copy";
      setTimeout(function () { b.textContent = "Copy"; }, 1400);
      return;
    }
    var risk = store.mode === "amt" ? usd(store.L) + " fixed" : (store.f * 100).toFixed(2) + "% of balance";
    var t = [
      usd(store.C) + " \u2192 " + usd(store.TG) + " in " + store.M.toFixed(0) + " months",
      "Risking " + risk + " per trade at 1:" + store.R,
      "Net wins needed: " + Math.ceil(store.netWins),
      "Average pace: " + store.perMonth.toFixed(1) + " wins per month, " + store.perWeek.toFixed(1) + " per week",
      "Break-even win rate: " + (store.be * 100).toFixed(1) + "%"
    ].join("\n");
    navigator.clipboard.writeText(t).then(function () {
      b.textContent = "Copied";
      setTimeout(function () { b.textContent = "Copy"; }, 1400);
    }, function () {
      b.textContent = "Copy failed";
      setTimeout(function () { b.textContent = "Copy"; }, 1400);
    });
  });

  $("pSave").addEventListener("click", savePlan);
  $("pExport").addEventListener("click", exportPlans);
  $("pName").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") savePlan();
  });

  setMode("amt");
  calc();
  renderPlans();
})();
