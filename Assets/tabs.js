/* Tab switching between the position sizer and the trading plan. */
(function () {
  "use strict";

  var t1 = document.getElementById("tab1"),
      t2 = document.getElementById("tab2"),
      p1 = document.getElementById("panel1"),
      p2 = document.getElementById("panel2");

  if (!t1 || !t2 || !p1 || !p2) return;

  function show(n) {
    t1.setAttribute("aria-selected", n === 1);
    t2.setAttribute("aria-selected", n === 2);
    p1.className = n === 1 ? "" : "hide";
    p2.className = n === 2 ? "" : "hide";
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (history.replaceState) {
      history.replaceState(null, "", n === 2 ? "#plan" : "#sizer");
    }
  }

  t1.addEventListener("click", function () { show(1); });
  t2.addEventListener("click", function () { show(2); });

  if (window.location.hash === "#plan") show(2);
})();
