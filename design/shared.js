/* Shared data and behaviour for the A/B/C direction previews.
   Every fact here comes from 丛动体育's own posters, price table and photos.
   Each page defines window.renderFacility(item, index) -> HTML string. */
(function () {
  "use strict";

  const FACILITIES = [
    { sport: "basketball", name: "篮球馆", en: "Basketball", base: "怀柔基地", img: "082", w: 800, h: 544 },
    { sport: "basketball", name: "篮球馆", en: "Basketball", base: "密云营地", img: "103", w: 800, h: 544 },
    { sport: "football", name: "足球场", en: "Football", base: "怀柔基地", img: "050", w: 800, h: 544, night: "069" },
    { sport: "tennis", name: "网球场", en: "Tennis", base: "怀柔基地", img: "049", w: 800, h: 600 },
    { sport: "badminton", name: "羽毛球", en: "Badminton", base: "密云营地", img: "104", w: 800, h: 544 },
    { sport: "tabletennis", name: "乒乓球", en: "Table tennis", base: "密云营地", img: "122", w: 800, h: 600 },
    { sport: "fitness", name: "健身房", en: "Fitness", base: "密云营地", img: "123", w: 800, h: 528, night: "092" },
    { sport: "football", name: "笼式足球", en: "Cage football", base: "密云营地", img: "124", w: 800, h: 600 },
    { sport: "golf", name: "高尔夫练习", en: "Golf", base: "密云营地", img: "097", w: 800, h: 600, night: "093", note: "练习网 · 推杆果岭" }
  ];

  const SPORTS = [
    ["all", "全部"], ["basketball", "篮球"], ["football", "足球"], ["tennis", "网球"],
    ["badminton", "羽毛球"], ["tabletennis", "乒乓球"], ["fitness", "健身"], ["golf", "高尔夫"]
  ];

  const INQUIRY_TEMPLATE = [
    "【丛动体育 · 咨询】",
    "咨询内容：集训 / 篮球升学规划",
    "称呼和电话：",
    "—— 集训 ——",
    "单位或队伍、人数（含教练）：",
    "计划日期：",
    "意向基地：怀柔基地 / 密云营地",
    "—— 升学规划 ——",
    "学生年级：",
    "方向：小升初 / 初升高"
  ].join("\n");

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function announce(text) {
    const live = $("[data-live]");
    if (live) live.textContent = text;
  }

  /* facilities: cards + filter chips */
  const list = $("[data-facility-list]");
  const chipBar = $("[data-chips]");
  if (list && typeof window.renderFacility === "function") {
    list.innerHTML = FACILITIES.map((item, i) => window.renderFacility(item, i)).join("");
  }
  if (chipBar && list) {
    const showCount = chipBar.hasAttribute("data-show-count");
    chipBar.innerHTML = SPORTS.map(([key, label]) => {
      const n = key === "all" ? FACILITIES.length : FACILITIES.filter(f => f.sport === key).length;
      const count = showCount ? `<span class="count">${String(n).padStart(2, "0")}</span>` : "";
      return `<button class="chip" type="button" data-sport="${key}" aria-pressed="${key === "all"}">${label}${count}</button>`;
    }).join("");
    chipBar.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (!chip) return;
      const sport = chip.dataset.sport;
      $$(".chip", chipBar).forEach(c => c.setAttribute("aria-pressed", String(c === chip)));
      let shown = 0;
      $$(".card", list).forEach(card => {
        const match = sport === "all" || card.dataset.sport === sport;
        card.hidden = !match;
        if (match) shown += 1;
      });
      list.scrollTo({ left: 0 });
      announce(`显示 ${shown} 个场地`);
    });
  }

  /* sticky consult dock appears once most of the hero has scrolled away */
  const hero = $("[data-hero]");
  const dock = $("[data-dock]");
  if (hero && dock) {
    // scroll events already fire at most once per frame, so no extra throttling
    const update = () => {
      const show = hero.getBoundingClientRect().bottom < window.innerHeight * 0.4;
      dock.classList.toggle("is-visible", show);
      dock.setAttribute("aria-hidden", String(!show));
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  /* consult bottom sheet */
  const sheet = $("[data-sheet]");
  $$("[data-open-sheet]").forEach(el => el.addEventListener("click", (event) => {
    if (!sheet || typeof sheet.showModal !== "function") return;
    event.preventDefault();
    sheet.showModal();
  }));
  if (sheet) {
    sheet.addEventListener("click", (event) => { if (event.target === sheet) sheet.close(); });
  }

  const copyBtn = $("[data-copy-template]");
  const copyStatus = $("[data-copy-status]");
  /* execCommand first: WeChat's in-app browser often has no navigator.clipboard.
     The textarea goes inside the dialog because a modal makes the rest of the page inert. */
  function copyText(text, host) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    host.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
    area.remove();
    if (ok || !navigator.clipboard) return Promise.resolve(ok);
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  }
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      copyText(INQUIRY_TEMPLATE, copyBtn.parentNode).then((ok) => {
        if (!copyStatus) return;
        copyStatus.textContent = ok
          ? "已复制咨询模板，打开微信粘贴、补全后发送即可。"
          : "浏览器不允许自动复制，请长按选择下面的文字：\n" + INQUIRY_TEMPLATE;
        copyStatus.style.whiteSpace = ok ? "" : "pre-line";
      });
    });
  }

  /* menu is not part of this preview */
  $$("[data-menu]").forEach(btn => btn.addEventListener("click", () => {
    announce("预览页未包含完整导航，正式版再实现。");
  }));

  /* hero video: autoplay only when motion and data saving allow it */
  const video = $("[data-hero-video]");
  const toggle = $("[data-video-toggle]");
  if (video) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = navigator.connection && navigator.connection.saveData;
    const setState = (playing) => {
      if (!toggle) return;
      toggle.setAttribute("aria-pressed", String(!playing));
      toggle.setAttribute("aria-label", playing ? "暂停背景视频" : "播放背景视频");
      toggle.dataset.state = playing ? "playing" : "paused";
    };
    if (!reduceMotion && !saveData) {
      video.play().then(() => setState(true)).catch(() => setState(false));
    } else {
      setState(false);
    }
    if (toggle) {
      toggle.addEventListener("click", () => {
        if (video.paused) video.play().then(() => setState(true)).catch(() => {});
        else { video.pause(); setState(false); }
      });
    }
  }
})();
