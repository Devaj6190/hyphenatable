(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const money = (n) =>
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );

  const S = {
    page: "home",
    done: new Set(),
    cur: 0,
    jordanRate: 24.5,
    harperRate: null,
    niaDate: null,
    sent: false,
    gate1: false,
    typed: false,
  };

  const items = [
    {
      tag: "Approve a text",
      kind: "",
      t: "Send Dakota 10 job questions",
      d: "He fixes them in Jobber. We re-check each one.",
      a: "Approve & send",
      act: "send",
      b: "Preview text",
      bact: "goManager",
    },
    {
      tag: "Needs review",
      kind: "decide",
      t: "Jordan Ellis’s pay rate doesn’t match",
      d: "Jobber says $26.00 an hour. His profile says $24.50.",
      a: "Pick a rate",
      act: "jordan",
    },
    {
      tag: "Missing data",
      kind: "missing",
      t: "Harper Nakamura has no Venmo rate",
      d: "She logged 64 hours. Add her rate to price them.",
      a: "Add rate",
      act: "harper",
    },
    {
      tag: "Needs review",
      kind: "decide",
      t: "4 entries weren’t approved at cutoff",
      d: "Approve them now or leave them for next cycle.",
      a: "Approve all 4",
      act: "entries",
      b: "Review",
      bact: "goExc",
    },
    {
      tag: "Needs review",
      kind: "decide",
      t: "Two jobs overlap on Oct 17",
      d: "Sam Ortiz is on Elm St. and Cedar Park at 1 PM.",
      a: "Split the hours",
      act: "overlap",
    },
    {
      tag: "Pending confirmation",
      kind: "",
      t: "Crew lead bonus on Oct 21",
      d: "$150.00 for Jordan Ellis. Keep it on this run?",
      a: "Keep bonus",
      act: "bonus",
      b: "Remove",
      bact: "bonusOff",
    },
    {
      tag: "Pending confirmation",
      kind: "",
      t: "Sam Ortiz worked 6 hours of overtime",
      d: "Paid at 1.5×, which adds $189.00.",
      a: "Confirm",
      act: "ot",
    },
    {
      tag: "Missing data",
      kind: "missing",
      t: "New hire has no start date",
      d: "Nia Patel’s first day is missing from her profile.",
      a: "Add date",
      act: "nia",
    },
  ];

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    $("#toastText").textContent = msg;
    const t = $("#toast");
    t.classList.remove("show");
    void t.offsetWidth;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ---------- rolling numbers ---------- */
  function roll(el, to, fmt) {
    fmt = fmt || ((n) => String(Math.round(n)));
    const from = el.dataset.v !== undefined ? parseFloat(el.dataset.v) : to;
    el.dataset.v = to;
    if (reduce || from === to) {
      el.textContent = fmt(to);
      return;
    }
    const t0 = performance.now(),
      dur = 1000;
    (function f(t) {
      const k = Math.min(1, (t - t0) / dur),
        e = 1 - Math.pow(1 - k, 4);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(f);
    })(t0);
  }

  /* ---------- indicators ---------- */
  function place(ind, el) {
    if (!el || !el.offsetWidth) return;
    ind.style.width = el.offsetWidth + "px";
    ind.style.height = el.offsetHeight + "px";
    ind.style.transform =
      "translate(" + el.offsetLeft + "px," + el.offsetTop + "px)";
  }
  function setNav() {
    $$("#nav a").forEach((a) => {
      if (a.dataset.go === S.page) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    place($("#navInd"), $('#nav a[aria-current="page"]'));
  }

  /* ---------- tabs ---------- */
  function layoutTabs(root) {
    $$(".tabs", root).forEach((t) => {
      const sel = $('[aria-selected="true"]', t),
        pill = $(".pill", t);
      if (!sel) return;
      pill.style.width = sel.offsetWidth + "px";
      pill.style.transform = "translateX(" + sel.offsetLeft + "px)";
    });
  }
  function selectTab(tabs, name) {
    const page = tabs.closest(".page");
    $$('[role="tab"]', tabs).forEach((b) => {
      b.setAttribute(
        "aria-selected",
        b.dataset.tab === name ? "true" : "false",
      );
    });
    layoutTabs(page);
    $$(".panel", page).forEach((p) => {
      const on = p.dataset.panel === name;
      if (on && p.hidden) {
        p.hidden = false;
        p.classList.remove("enter");
        void p.offsetWidth;
        p.classList.add("enter");
      } else if (!on) p.hidden = true;
    });
  }
  $$(".tabs").forEach((t) => {
    t.addEventListener("click", (e) => {
      const b = e.target.closest('[role="tab"]');
      if (b) selectTab(t, b.dataset.tab);
    });
  });

  /* ---------- router ---------- */
  const pages = {};
  $$(".page").forEach((p) => {
    pages[p.dataset.page] = p;
  });
  function show(name, opts) {
    const p = pages[name];
    p.hidden = false;
    $$("[data-s]", p).forEach((el, i) => {
      el.style.setProperty("--i", i);
    });
    p.classList.remove("enter");
    void p.offsetWidth;
    p.classList.add("enter");
    $("#view").scrollTop = 0;
    layoutTabs(p);
    if (opts && opts.tab) selectTab($(".tabs", p), opts.tab);
    if (name === "manager") typeText();
    if (opts && opts.after) setTimeout(opts.after, reduce ? 0 : 320);
  }
  function go(name, opts) {
    if (!pages[name]) return;
    if (name === S.page) {
      if (opts && opts.tab) selectTab($(".tabs", pages[name]), opts.tab);
      if (opts && opts.after) opts.after();
      return;
    }
    const out = pages[S.page];
    S.page = name;
    $("#main").dataset.page = name;
    setNav();
    history.replaceState(null, "", "#" + name);
    if (reduce) {
      out.hidden = true;
      show(name, opts);
      return;
    }
    out.classList.remove("enter");
    out.classList.add("leaving");
    setTimeout(() => {
      out.hidden = true;
      out.classList.remove("leaving");
      show(name, opts);
    }, 190);
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-go]");
    if (a) {
      e.preventDefault();
      go(a.dataset.go);
    }
  });
  addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (pages[h]) go(h);
  });

  /* ---------- magnetic buttons + card spotlight ---------- */
  let magEl = null;
  function resetMag(el) {
    if (el) {
      el.style.setProperty("--tx", "0px");
      el.style.setProperty("--ty", "0px");
    }
  }
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || reduce) return;
    const b = e.target.closest(".btn");
    if (b !== magEl) {
      resetMag(magEl);
      magEl = b;
    }
    if (b && !b.disabled) {
      const r = b.getBoundingClientRect(),
        f = b.classList.contains("wide-btn") ? 0.06 : 0.28;
      b.style.setProperty(
        "--tx",
        ((e.clientX - r.left - r.width / 2) * f).toFixed(1) + "px",
      );
      b.style.setProperty(
        "--ty",
        ((e.clientY - r.top - r.height / 2) * 0.4).toFixed(1) + "px",
      );
    }
    const c = e.target.closest(".card");
    if (c) {
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", e.clientX - r.left + "px");
      c.style.setProperty("--my", e.clientY - r.top + "px");
    }
  });
  document.addEventListener("pointerleave", () => {
    resetMag(magEl);
    magEl = null;
  });

  /* ---------- company switch ---------- */
  $$(".switch button").forEach((b, i) => {
    b.addEventListener("click", () => {
      $$(".switch button").forEach((x) => {
        x.setAttribute("aria-pressed", x === b ? "true" : "false");
      });
      $("#swInd").style.transform = "translateX(" + i * 32 + "px)";
      if (b.dataset.co !== "A")
        toast("Company " + b.dataset.co + " isn’t loaded in this preview");
    });
  });

  /* ---------- home ---------- */
  function nextUndone(from, dir) {
    for (let k = 1; k <= 8; k++) {
      const i = (from + dir * k + 80) % 8;
      if (!S.done.has(i)) return i;
    }
    return -1;
  }
  function fillFocus() {
    const body = $("#qbody");
    if (S.done.size === 8) {
      $("#qCount").textContent = "All done";
      body.innerHTML = S.gate1
        ? '<span class="tag done">Gate 1 approved</span><div><h2 class="q-title">Regular draft is approved</h2><p class="q-desc">Stage 2 starts with commissions. Nothing was submitted.</p></div>'
        : '<span class="tag done">All 8 answered</span><div><h2 class="q-title">Gate 1 is ready for you</h2><p class="q-desc">Look over the regular draft, then approve it.</p></div><div class="actions"><button type="button" class="btn btn-primary" data-act="gate1"><span>Approve regular draft</span></button><button type="button" class="btn btn-ghost" data-go="workbook"><span>Open workbook</span></button></div>';
      return;
    }
    const it = items[S.cur],
      done = S.done.has(S.cur);
    $("#qCount").textContent = S.cur + 1 + " of 8";
    body.innerHTML =
      '<span class="tag ' +
      (done ? "done" : it.kind) +
      '">' +
      (done ? "Resolved" : esc(it.tag)) +
      "</span>" +
      '<div><h2 class="q-title">' +
      esc(it.t) +
      '</h2><p class="q-desc">' +
      esc(it.d) +
      "</p></div>" +
      '<div class="actions">' +
      (done
        ? '<button type="button" class="btn btn-ghost" data-act="skip"><span>Next item</span></button>'
        : '<button type="button" class="btn btn-primary" data-act="' +
          it.act +
          '"><span>' +
          esc(it.a) +
          "</span></button>" +
          (it.b
            ? '<button type="button" class="btn btn-ghost" data-act="' +
              it.bact +
              '"><span>' +
              esc(it.b) +
              "</span></button>"
            : "")) +
      "</div>";
  }
  function renderFocus(dir) {
    const body = $("#qbody");
    if (!dir || reduce) {
      fillFocus();
      return;
    }
    body.classList.add(dir > 0 ? "out-l" : "out-r");
    setTimeout(() => {
      fillFocus();
      body.classList.remove("out-l", "out-r");
      body.classList.add(dir > 0 ? "in-r" : "in-l");
      void body.offsetWidth;
      body.classList.remove("in-r", "in-l");
    }, 180);
  }
  function renderUpNext() {
    const list = $("#upNext"),
      rest = [];
    for (let k = 1; k < 8; k++) {
      const i = (S.cur + k) % 8;
      if (!S.done.has(i)) rest.push(i);
    }
    $("#upWrap").hidden = rest.length === 0;
    list.innerHTML =
      rest
        .slice(0, 3)
        .map(
          (i) =>
            '<button type="button" class="row" data-jump="' +
            i +
            '"><span class="dot ' +
            items[i].kind +
            '"></span><span class="grow">' +
            esc(items[i].t) +
            '</span><svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>',
        )
        .join("") +
      (rest.length > 3
        ? '<span class="label" style="padding-block:10px">+ ' +
          (rest.length - 3) +
          " more</span>"
        : "");
  }
  function renderSeg() {
    const frac = S.done.size / 8;
    const fills = [1, 1, frac, S.gate1 ? 1 : 0, 0, 0, 0, 0];
    const now = S.gate1 ? 4 : S.done.size === 8 ? 3 : 2;
    const seg = $("#seg");
    if (!seg.children.length)
      seg.innerHTML = fills
        .map((_, k) => '<span style="--k:' + k + '"><b></b></span>')
        .join("");
    $$("span", seg).forEach((s, k) => {
      s.classList.toggle("now", k === now);
      $("b", s).style.setProperty(
        "--w",
        (k === now && k !== 2 ? 100 : fills[k] * 100) + "%",
      );
    });
    const names = [
      "Collecting",
      "Checking",
      "Asking",
      "Gate 1 · you approve",
      "Draft filled",
    ];
    $("#stepCaption").textContent =
      "Step " + (now + 1) + " of 8 · " + names[now];
  }
  function updateCounts() {
    const left = 8 - S.done.size;
    roll($("#leftCount"), left);
    $("#homeSub").lastChild.textContent =
      left === 1
        ? " item needs review before Gate 1"
        : " items need review before Gate 1";
    const badge = $("#badge");
    badge.textContent = left;
    badge.classList.toggle("zero", left === 0);
    badge.classList.remove("bump");
    void badge.offsetWidth;
    badge.classList.add("bump");
    $("#ringProg").style.strokeDashoffset = (
      113.1 *
      (1 - S.done.size / 8)
    ).toFixed(1);
    roll($("#ringText"), S.done.size, (n) => Math.round(n) + "/8");
    renderSeg();
    renderUpNext();
    renderWorkbook();
    renderAudit();
    renderManager();
    renderPeople();
  }
  function complete(i, msg) {
    S.done.add(i);
    toast(msg);
    updateCounts();
    if (S.cur === i) {
      const n = nextUndone(i, 1);
      setTimeout(
        () => {
          if (n >= 0) S.cur = n;
          renderFocus(1);
        },
        reduce ? 0 : 380,
      );
    }
  }
  $("#prev").addEventListener("click", () => {
    S.cur = (S.cur + 7) % 8;
    renderFocus(-1);
    renderUpNext();
  });
  $("#next").addEventListener("click", () => {
    S.cur = (S.cur + 1) % 8;
    renderFocus(1);
    renderUpNext();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
    if (
      S.page !== "home" ||
      $("#drawer").classList.contains("open") ||
      /INPUT|TEXTAREA/.test(document.activeElement.tagName)
    )
      return;
    if (e.key === "ArrowRight") $("#next").click();
    if (e.key === "ArrowLeft") $("#prev").click();
  });
  document.addEventListener("click", (e) => {
    const j = e.target.closest("[data-jump]");
    if (j) {
      const i = +j.dataset.jump;
      const dir = i > S.cur ? 1 : -1;
      S.cur = i;
      if (S.page !== "home") go("home");
      renderFocus(dir);
      renderUpNext();
      return;
    }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act;
    const actions = {
      send: () => doSend(),
      goManager: () => go("manager"),
      jordan: () =>
        go("workbook", { tab: "hours", after: () => openDrawer("jordan") }),
      harper: () =>
        go("workbook", { tab: "hours", after: () => openDrawer("harper") }),
      entries: () => complete(3, "4 entries approved"),
      goExc: () => go("workbook", { tab: "exc" }),
      overlap: () => complete(4, "Hours split between both jobs"),
      bonus: () => complete(5, "Bonus kept on this run"),
      bonusOff: () => complete(5, "Bonus removed from this run"),
      ot: () => complete(6, "Overtime confirmed"),
      nia: () => openDrawer("nia"),
      skip: () => {
        S.cur = (S.cur + 1) % 8;
        renderFocus(1);
        renderUpNext();
      },
      gate1: () => {
        S.gate1 = true;
        toast("Regular draft approved");
        renderSeg();
        renderFocus(1);
      },
      fix: () => {
        const i = +b.dataset.item;
        S.cur = i;
        go("home", { after: () => renderFocus(1) });
        renderUpNext();
      },
    };
    if (actions[a]) actions[a]();
  });

  /* ---------- workbook ---------- */
  const crew = [
    { n: "Dakota Reyes", i: "DR", h: 80, ot: 0, rate: "salary", g: 2450 },
    { n: "Jordan Ellis", i: "JE", h: 72.5, ot: 0, rate: "jordan" },
    { n: "Sam Ortiz", i: "SO", h: 80, ot: 6, rate: 21 },
    { n: "Leo Brandt", i: "LB", h: 78, ot: 2, rate: 27.5 },
    { n: "Priya Shah", i: "PS", h: 76, ot: 0, rate: 23 },
    { n: "Owen Clarke", i: "OC", h: 70, ot: 0, rate: 20 },
    { n: "Harper Nakamura", i: "HN", h: 64, ot: 0, rate: "harper" },
    { n: "Nia Patel", i: "NP", h: 68, ot: 0, rate: 22 },
  ];
  function rateOf(c) {
    return c.rate === "jordan"
      ? S.jordanRate
      : c.rate === "harper"
        ? S.harperRate
        : c.rate;
  }
  function grossOf(c) {
    if (c.rate === "salary") return c.g;
    const r = rateOf(c);
    return r == null ? null : c.h * r + c.ot * r * 1.5;
  }
  function buildWorkbook() {
    $("#wbRows").innerHTML = crew
      .map(
        (c, k) =>
          '<div class="lrow" id="wr' +
          k +
          '"><span class="l-idx">' +
          String(k + 1).padStart(2, "0") +
          '</span><span class="l-name">' +
          esc(c.n) +
          '<span class="flag"></span></span>' +
          '<span class="l-n">' +
          c.h.toFixed(1) +
          '</span><span class="l-n">' +
          (c.ot ? c.ot.toFixed(1) : "—") +
          '</span><span class="l-n" id="wrate' +
          k +
          '"></span><span class="l-n wide" id="wg' +
          k +
          '"></span></div>',
      )
      .join("");
  }
  function renderWorkbook() {
    let total = 0,
      missing = 0,
      reg = 0,
      ot = 0;
    crew.forEach((c, k) => {
      const g = grossOf(c),
        r = rateOf(c),
        row = $("#wr" + k),
        flag = $(".flag", row);
      reg += c.h;
      ot += c.ot;
      $("#wrate" + k).textContent =
        c.rate === "salary" ? "salary" : r == null ? "—" : money(r);
      const gEl = $("#wg" + k);
      if (g == null) {
        gEl.innerHTML = '<span class="pending">pending</span>';
        missing++;
      } else {
        roll(gEl, g, money);
        total += g;
      }
      let f = "";
      if (c.rate === "jordan" && !S.done.has(1))
        f =
          '<button type="button" class="chip amber" data-open="jordan">Check rate</button>';
      if (c.rate === "harper" && !S.done.has(2))
        f =
          '<button type="button" class="chip red" data-open="harper">Add rate</button>';
      flag.innerHTML = f;
      row.classList.toggle("flagged", !!f);
    });
    roll($("#wbTotal"), total, money);
    roll($("#sGross"), total, money);
    roll($("#kGross"), total, money);
    $("#sReg").textContent = reg.toFixed(1);
    $("#sOt").textContent = ot.toFixed(1);
    $("#kHours").textContent = (reg + ot).toFixed(1);
    $("#kPeople").textContent = people.length;
    $("#tReg").textContent = reg.toFixed(1) + " hrs";
    $("#tOt").textContent = ot.toFixed(1) + " hrs";
    $("#tPeople").textContent = crew.length - missing + " of " + crew.length;
    $("#venmoNote").textContent = S.done.has(2)
      ? "2 people · rates set"
      : "2 people · 1 missing a rate";
    const vc = $("#venmoChip");
    vc.textContent = S.done.has(2) ? "Ready" : "Check";
    vc.className = "chip " + (S.done.has(2) ? "ok" : "amber");
    const ents = [
      ["Owen Clarke", "Oct 13", "7.5"],
      ["Sam Ortiz", "Oct 15", "8.0"],
      ["Nia Patel", "Oct 19", "6.0"],
      ["Leo Brandt", "Oct 22", "4.5"],
    ];
    $("#excRows").innerHTML =
      '<div class="lrow lhead"><span class="l-idx">#</span><span class="l-name">Entry</span><span class="l-n">Date</span><span class="l-n">Hours</span><span class="l-n wide">Status</span></div>' +
      ents
        .map(
          (e, k) =>
            '<div class="lrow"><span class="l-idx">' +
            String(k + 1).padStart(2, "0") +
            '</span><span class="l-name">' +
            e[0] +
            '</span><span class="l-n">' +
            e[1] +
            '</span><span class="l-n">' +
            e[2] +
            '</span><span class="l-n wide"><span class="chip ' +
            (S.done.has(3) ? 'ok">Approved' : 'amber">Not approved') +
            "</span></span></div>",
        )
        .join("");
  }
  document.addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]");
    if (o) openDrawer(o.dataset.open);
  });
  $("#exportBtn").addEventListener("click", () =>
    toast("Draft download comes next in this preview"),
  );

  /* ---------- drawer ---------- */
  let lastFocus = null,
    choice = 26;
  function openDrawer(mode) {
    const d = $("#dBody");
    lastFocus = document.activeElement;
    if (mode === "jordan") {
      choice = 26;
      d.innerHTML =
        '<span class="tag decide d-s" style="--k:0">Needs review</span><h2 class="d-s" style="--k:1">Which rate is right for Jordan?</h2>' +
        '<div role="radiogroup" aria-label="Rate" class="d-s" style="--k:2;display:flex;flex-direction:column;gap:10px">' +
        '<button type="button" class="choice" role="radio" aria-checked="true" data-rate="26"><span>Jobber</span><strong>$26.00</strong></button>' +
        '<button type="button" class="choice" role="radio" aria-checked="false" data-rate="24.5"><span>His profile</span><strong>$24.50</strong></button></div>' +
        '<p class="label d-s" style="--k:3;margin:0" id="impact">Jobber’s rate adds $108.75 this period.</p>' +
        '<div class="d-s" style="--k:4;margin-top:auto;display:flex;flex-direction:column;gap:10px"><button type="button" class="btn btn-primary wide-btn" id="dSave" style="width:100%"><span>Save</span></button><button type="button" class="link-btn" style="align-self:center" data-askdakota>Not sure? Ask Dakota</button></div>';
    } else if (mode === "harper") {
      d.innerHTML =
        '<span class="tag missing d-s" style="--k:0">Missing data</span><h2 class="d-s" style="--k:1">Harper Nakamura’s hourly rate</h2>' +
        '<p class="label d-s" style="--k:2;margin:0">She logged 64 hours. Paid by Venmo.</p>' +
        '<div class="field d-s" style="--k:3"><label for="harperRate">Rate per hour</label><input id="harperRate" type="number" inputmode="decimal" min="1" step="0.25" placeholder="21.00"><p class="err" id="dErr"></p></div>' +
        '<div class="d-s" style="--k:4;margin-top:auto"><button type="button" class="btn btn-primary wide-btn" id="dSave" style="width:100%"><span>Save rate</span></button></div>';
    } else {
      d.innerHTML =
        '<span class="tag missing d-s" style="--k:0">Missing data</span><h2 class="d-s" style="--k:1">Nia Patel’s start date</h2>' +
        '<div class="field d-s" style="--k:2"><label for="niaDate">First day of work</label><input id="niaDate" type="date" max="2026-10-23"><p class="err" id="dErr"></p></div>' +
        '<div class="d-s" style="--k:3;margin-top:auto"><button type="button" class="btn btn-primary wide-btn" id="dSave" style="width:100%"><span>Save date</span></button></div>';
    }
    $("#dSave").addEventListener("click", () => saveDrawer(mode));
    const dr = $("#drawer");
    dr.inert = false;
    dr.classList.remove("open");
    void dr.offsetWidth;
    dr.classList.add("open");
    $("#scrim").classList.add("on");
    setTimeout(
      () => {
        const f = $("#dBody input") || $("#dBody .choice");
        if (f) f.focus();
      },
      reduce ? 0 : 450,
    );
  }
  function closeDrawer() {
    const dr = $("#drawer");
    if (!dr.classList.contains("open")) return;
    dr.classList.remove("open");
    dr.inert = true;
    $("#scrim").classList.remove("on");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function saveDrawer(mode) {
    if (mode === "jordan") {
      S.jordanRate = choice;
      closeDrawer();
      complete(1, "Jordan’s rate set to " + money(choice));
      return;
    }
    if (mode === "harper") {
      const v = parseFloat($("#harperRate").value);
      if (!(v > 0)) {
        $("#dErr").textContent = "Enter an hourly rate, like 21.00.";
        $("#harperRate").focus();
        return;
      }
      S.harperRate = v;
      closeDrawer();
      complete(2, "Harper’s rate set to " + money(v));
      return;
    }
    const v = $("#niaDate").value;
    if (!v) {
      $("#dErr").textContent = "Pick the date Nia started.";
      $("#niaDate").focus();
      return;
    }
    S.niaDate = v;
    closeDrawer();
    complete(7, "Start date saved for Nia");
  }
  $("#dBody").addEventListener("click", (e) => {
    const c = e.target.closest(".choice");
    if (c) {
      choice = parseFloat(c.dataset.rate);
      $$(".choice").forEach((x) => {
        x.setAttribute("aria-checked", x === c ? "true" : "false");
      });
      $("#impact").textContent =
        choice === 26
          ? "Jobber’s rate adds $108.75 this period."
          : "Keeps this period at $1,776.25 for Jordan.";
    }
    if (e.target.closest("[data-askdakota]")) {
      closeDrawer();
      go("manager");
    }
  });
  $("#closeDrawer").addEventListener("click", closeDrawer);
  $("#scrim").addEventListener("click", closeDrawer);

  /* ---------- company ---------- */
  const people = [
    ["DR", "Dakota Reyes", "Crew manager", "$2,450.00 / period"],
    ["JE", "Jordan Ellis", "Crew lead · North", "jordan"],
    ["HN", "Harper Nakamura", "Laborer · North", "harper"],
    ["SO", "Sam Ortiz", "Laborer · South", "$21.00 / hr"],
    ["LB", "Leo Brandt", "Irrigation tech", "$27.50 / hr"],
    ["PS", "Priya Shah", "Office", "$23.00 / hr"],
    ["OC", "Owen Clarke", "Laborer · South", "$20.00 / hr"],
    ["NP", "Nia Patel", "Laborer · North", "$22.00 / hr"],
    ["MT", "Mia Torres", "Sales", "6% commission"],
    ["AK", "Ava Kim", "Designer", "$25.00 / hr"],
    ["TB", "Theo Baker", "Laborer · South", "$20.00 / hr"],
    ["RG", "Rosa Garcia", "Laborer · North", "$21.00 / hr"],
    ["CW", "Cole Wright", "Crew lead · South", "$24.00 / hr"],
    ["EL", "Eli Lopez", "Laborer · South", "$20.50 / hr"],
  ];
  function personCard(p, k) {
    let rate = p[3],
      flag = "";
    if (rate === "jordan") {
      rate = money(S.jordanRate) + " / hr";
      if (!S.done.has(1))
        flag =
          '<button type="button" class="chip amber" data-open="jordan">Rate?</button>';
    }
    if (rate === "harper") {
      rate = S.harperRate ? money(S.harperRate) + " / hr" : "no rate";
      if (!S.done.has(2))
        flag =
          '<button type="button" class="chip red" data-open="harper">Add rate</button>';
    }
    return (
      '<div class="person stag' +
      (flag ? " flagged" : "") +
      '" style="--k:' +
      k +
      '"><span class="avatar">' +
      p[0] +
      '</span><div><div class="p-name">' +
      esc(p[1]) +
      '</div><div class="p-role">' +
      esc(p[2]) +
      '</div></div><div class="p-rate"><span>' +
      rate +
      "</span>" +
      flag +
      "</div></div>"
    );
  }
  function renderPeople() {
    $("#people").innerHTML = people.slice(0, 6).map(personCard).join("");
    $("#people2").innerHTML = people.slice(6).map(personCard).join("");
    const att = (S.done.has(1) ? 0 : 1) + (S.done.has(2) ? 0 : 1);
    roll($("#coAttention"), att);
    roll($("#coReady"), 14 - att - 1);
  }
  function toggle(btn, panel, onLabel, offLabel, labelEl) {
    const open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    panel.classList.toggle("open", open);
    if (labelEl) labelEl.textContent = open ? onLabel : offLabel;
    else btn.firstChild.textContent = (open ? onLabel : offLabel) + " ";
  }
  $("#peopleToggle").addEventListener("click", (e) =>
    toggle(e.currentTarget, $("#morePeople"), "Show fewer", "Show all 14"),
  );

  /* ---------- audit ---------- */
  const fixes = [
    [1, "Jordan Ellis’s rate doesn’t match Jobber", "Jobber", "06:04"],
    [2, "Harper Nakamura has no rate", "Profile", "06:04"],
    [3, "4 time entries not approved", "Jobber", "06:05"],
    [4, "Two jobs overlap on Oct 17", "Jobber", "06:05"],
    [7, "New hire has no start date", "Profile", "06:03"],
  ];
  const passedBase = [
    ["Every entry has a person", "Jobber", "06:02"],
    ["Overtime counted by week", "Rules", "06:02"],
    ["Hours close to last cycle", "Rules", "06:03"],
    ["No duplicate people", "Profile", "06:03"],
    ["Salary periods prorated", "Rules", "06:03"],
    ["Pay period dates line up", "Rules", "06:04"],
    ["Every job has a client", "Jobber", "06:04"],
    ["Crew sizes match clock-ins", "Jobber", "06:05"],
    ["No negative hours", "Jobber", "06:05"],
    ["Commission rates on file", "Profile", "06:05"],
    ["Direct deposit details on file", "Profile", "06:06"],
    ["Rates within company range", "Rules", "06:06"],
    ["No time after pay cutoff", "Jobber", "06:06"],
  ];
  const meta = (src, t) => '<span class="meta">' + src + " · " + t + "</span>";
  function renderAudit() {
    const open = fixes.filter((f) => !S.done.has(f[0]));
    const passed = 18 - open.length;
    roll($("#passed"), passed);
    roll($("#okCount"), passed);
    roll($("#openCount"), open.length);
    $("#barOk").style.flexGrow = passed;
    $("#barOpen").style.flexGrow = open.length;
    $("#passLabel").textContent = passed + " passed checks";
    const resolved = fixes
      .filter((f) => S.done.has(f[0]))
      .map((f) => [
        f[1]
          .replace("doesn’t match", "matches")
          .replace("has no rate", "has a rate")
          .replace("not approved", "approved")
          .replace("overlap", "no longer overlap")
          .replace("has no start date", "has a start date"),
        f[2],
        f[3],
        "Resolved",
      ]);
    $("#passItems").innerHTML = resolved
      .concat(passedBase.map((p) => p.concat("Passed")))
      .map(
        (r, k) =>
          '<div class="passrow stag" style="--k:' +
          k +
          '"><span>' +
          esc(r[0]) +
          '</span><span class="right">' +
          meta(r[1], r[2]) +
          '<span class="chip ok">' +
          r[3] +
          "</span></span></div>",
      )
      .join("");
    $("#fixes").innerHTML = open.length
      ? open
          .map(
            (f, k) =>
              '<div class="fix" style="--k:' +
              k +
              '"><span style="flex:1;min-width:0">' +
              esc(f[1]) +
              "</span>" +
              meta(f[2], f[3]) +
              '<button type="button" class="btn btn-ghost" style="height:36px;padding-inline:16px;font-size:14px" data-act="fix" data-item="' +
              f[0] +
              '"><span>Fix</span></button></div>',
          )
          .join("")
      : '<div class="fix ok"><span style="flex:1">Nothing left to fix.</span>' +
        meta("Rules", "06:06") +
        "</div>";
  }
  $("#passToggle").addEventListener("click", (e) => {
    const b = e.currentTarget,
      open = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", open ? "true" : "false");
    $("#passList").classList.toggle("open", open);
  });

  /* ---------- manager ---------- */
  const msg =
    "Hi Dakota — 10 jobs need a quick fix in Jobber before payroll. Tap the list, fix each one, then tap “I updated it.”";
  let typing = null;
  function typeText() {
    const el = $("#bubbleText");
    if (S.typed || reduce) {
      el.textContent = msg;
      $("#caret").hidden = true;
      S.typed = true;
      return;
    }
    clearInterval(typing);
    el.textContent = "";
    $("#caret").hidden = false;
    let n = 0;
    setTimeout(() => {
      typing = setInterval(() => {
        n += 2;
        el.textContent = msg.slice(0, n);
        if (n >= msg.length) {
          clearInterval(typing);
          S.typed = true;
          setTimeout(() => ($("#caret").hidden = true), 900);
        }
      }, 22);
    }, 500);
  }
  function renderManager() {
    const st = $("#sendStatus"),
      btn = $("#sendBtn");
    st.classList.toggle("sent", S.sent);
    $("#sendStatusText").textContent = S.sent
      ? "Sent · waiting on Dakota"
      : "Not sent";
    btn.disabled = S.sent;
    btn.firstElementChild.textContent = S.sent ? "Sent" : "Approve & send";
    $("#waiting").hidden = !S.sent;
    $("#sysline").hidden = !S.sent;
  }
  function doSend() {
    if (S.sent) return;
    S.sent = true;
    complete(0, "Text sent to Dakota");
  }
  $("#sendBtn").addEventListener("click", doSend);
  $("#editBtn").addEventListener("click", () =>
    toast("Editing the text comes next in this preview"),
  );
  const jobs = [
    ["Maple Ct. mow", "No crew"],
    ["Hillside Dr. hedge trim", "0 hours"],
    ["Oakridge HOA cleanup", "No end time"],
    ["Birch Ln. irrigation", "Wrong job type"],
    ["Cedar Park mulch", "2 of 3 clocked in"],
    ["Elm St. aeration", "Entered twice"],
    ["Willow Way leaves", "No end time"],
    ["Pine Ridge sod", "6 hrs over estimate"],
    ["Aspen Ct. mow", "Visit not closed"],
    ["Laurel Ave. shrubs", "No client"],
  ];
  const jobRow = (j, k) =>
    '<div class="job stag" style="--k:' +
    k +
    '"><span>' +
    esc(j[0]) +
    '</span><span class="muted">' +
    esc(j[1]) +
    "</span></div>";
  $("#jobs").innerHTML = jobs.slice(0, 4).map(jobRow).join("");
  $("#jobs2").innerHTML = jobs.slice(4).map(jobRow).join("");
  $("#jobsToggle").addEventListener("click", (e) =>
    toggle(
      e.currentTarget,
      $("#moreJobs"),
      "Show fewer",
      "6 more",
      $("#jobsLabel"),
    ),
  );

  /* ---------- boot ---------- */
  buildWorkbook();
  const start = (location.hash || "").slice(1);
  if (pages[start] && start !== "home") {
    pages.home.hidden = true;
    S.page = start;
    $("#main").dataset.page = start;
  }
  fillFocus();
  updateCounts();
  requestAnimationFrame(() => {
    setNav();
    show(S.page);
  });
  addEventListener("resize", () => {
    setNav();
    layoutTabs(pages[S.page]);
  });
  if (document.fonts)
    document.fonts.ready.then(() => {
      setNav();
      layoutTabs(pages[S.page]);
    });
})();
