/* Homepage behaviour: header state, menu, in-page navigation and the current-section marker,
   facility filter, consult dock and sheet, inquiry template, section reveals, and the hero film
   that repeats with a hold on its last frame. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const glide = () => (reduceMotion.matches ? "auto" : "smooth");

const liveRegion = $("[data-live]");
const announce = (text) => { if (liveRegion) liveRegion.textContent = text; };

const header = $("[data-header]");
const hero = $("[data-hero]");
const dock = $("[data-dock]");
const menu = $("[data-menu]");
const sheet = $("[data-sheet]");
const contact = $("#contact");

/* header turns solid once the page scrolls; the dock shows between the hero and the
   contact section (which already shows the phone number and QR code) */
function onScroll() {
  header.classList.toggle("is-solid", window.scrollY > 24);
  if (dock && hero) {
    const pastHero = hero.getBoundingClientRect().bottom < window.innerHeight * 0.4;
    const atContact = contact.getBoundingClientRect().top < window.innerHeight * 0.85;
    const show = pastHero && !atContact;
    dock.classList.toggle("is-visible", show);
    dock.setAttribute("aria-hidden", String(!show));
  }
}
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", onScroll);
onScroll();

/* dialogs (menu, consult sheet) play a short exit before closing; Esc, the backdrop and the
   close buttons all come through here. Resolves once the dialog is closed. */
function closeDialog(dialog) {
  if (!dialog.open) return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    const onEnd = (event) => { if (event.target === dialog) finish(); };
    const finish = () => {
      if (finished) return;
      finished = true;
      dialog.removeEventListener("animationend", onEnd);
      dialog.classList.remove("is-closing");
      dialog.close();
      resolve();
    };
    if (reduceMotion.matches) return finish();
    dialog.classList.add("is-closing");
    dialog.addEventListener("animationend", onEnd);
    setTimeout(finish, 350); // in case the exit animation never runs
  });
}
[menu, sheet].forEach((dialog) => {
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDialog(dialog); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(dialog); });
});

/* menu */
$("[data-menu-open]").addEventListener("click", () => menu.showModal());
$("[data-menu-close]").addEventListener("click", () => closeDialog(menu));

/* in-page links: scroll, then move focus to the section for keyboard and screen-reader users.
   The address keeps no #section, so a reload or a copied link opens at the top. */
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || link.hasAttribute("data-open-sheet")) return;
  const target = document.getElementById(link.hash.slice(1));
  if (!target) return;
  event.preventDefault();
  closeDialog(menu).then(() => {
    target.scrollIntoView({ behavior: glide(), block: "start" });
    target.focus({ preventScroll: true });
  });
});

/* the desktop navigation and the phone menu mark the section being read */
const navLinks = $$(".nav-desktop a, .menu-nav a");
const navSections = [...new Set(navLinks.map((a) => a.hash))]
  .map((hash) => document.getElementById(hash.slice(1)))
  .filter(Boolean);
if ("IntersectionObserver" in window) {
  const reading = new Set();
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => (entry.isIntersecting ? reading.add(entry.target) : reading.delete(entry.target)));
    const current = navSections.find((section) => reading.has(section));
    navLinks.forEach((a) => {
      if (current && a.hash === `#${current.id}`) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }, { rootMargin: "-40% 0px -55% 0px" }); // a thin band a little above the middle of the screen
  navSections.forEach((section) => spy.observe(section));
}

/* consult sheet (links fall back to #contact without JS) */
document.addEventListener("click", (event) => {
  const opener = event.target.closest("[data-open-sheet]");
  if (!opener || typeof sheet.showModal !== "function") return;
  event.preventDefault();
  closeDialog(menu).then(() => sheet.showModal());
});
$("form", sheet).addEventListener("submit", (event) => {
  event.preventDefault();
  closeDialog(sheet);
});

/* facility filter: the chosen chip slides into view, the matching cards fade in, and the
   list's top stays in view when the filter shortens it */
const chipBar = $("[data-chips]");
const facilityList = $("[data-facility-list]");
chipBar.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip || chip.getAttribute("aria-pressed") === "true") return;
  const sport = chip.dataset.sport;
  $$(".chip", chipBar).forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
  const bar = chipBar.getBoundingClientRect();
  const box = chip.getBoundingClientRect();
  chipBar.scrollBy({ left: box.left - bar.left - (bar.width - box.width) / 2, behavior: glide() });

  let shown = 0;
  $$(".card", facilityList).forEach((card) => {
    const match = sport === "all" || card.dataset.sport === sport;
    card.hidden = !match;
    if (!match) return;
    shown += 1;
    card.classList.add("is-in"); // cards brought back by the filter skip the scroll reveal
    card.classList.remove("is-shown");
    void card.offsetWidth; // restart the fade
    card.classList.add("is-shown");
  });
  const barBottom = chipBar.closest(".chips-bar").getBoundingClientRect().bottom;
  const listTop = facilityList.getBoundingClientRect().top;
  if (listTop < barBottom) window.scrollBy({ top: listTop - barBottom, behavior: glide() });
  announce(`显示 ${shown} 个场地`);
});

/* inquiry template: execCommand first because WeChat's in-app browser often lacks
   navigator.clipboard; the textarea goes inside any open dialog, which makes the rest inert */
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
  "篮球水平（是否在校队训练）：",
  "方向：小升初 / 初升高（争取高中入学 / 冲刺篮球传统学校 / 运动员等级认证）"
].join("\n");

function copyText(text, host) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
  host.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  area.remove();
  if (ok || !navigator.clipboard) return Promise.resolve(ok);
  return navigator.clipboard.writeText(text).then(() => true, () => false);
}

$$("[data-copy-template]").forEach((button) => {
  let reset = 0;
  button.addEventListener("click", () => {
    const scope = button.closest(".sheet-inner, .contact-card") || document.body;
    const status = $("[data-copy-status]", scope);
    copyText(INQUIRY_TEMPLATE, button.closest("dialog") || document.body).then((ok) => {
      button.classList.toggle("is-copied", ok);
      clearTimeout(reset);
      if (ok) reset = setTimeout(() => button.classList.remove("is-copied"), 2400);
      if (!status) return;
      status.style.whiteSpace = ok ? "" : "pre-line";
      status.textContent = ok
        ? "已复制咨询模板，打开微信粘贴、补全后发送即可。"
        : "浏览器不允许自动复制，请长按选择下面的文字：\n" + INQUIRY_TEMPLATE;
    });
  });
});

/* sections ease in as they scroll into view; whatever is already on screen, and everything
   when motion is reduced, simply shows */
const REVEAL = [
  ".section-head", ".module", ".partners-inner", ".stats li", ".included > *", ".facility-list .card",
  ".base", ".map", ".rooms", ".food > *", ".study-grid > *", ".paths-kicker", ".path", ".paths-note",
  ".study-cta", ".contact-grid > *"
].join(", ");
if (!reduceMotion.matches && "IntersectionObserver" in window) {
  const reveal = new IntersectionObserver((entries) => {
    let delay = 0;
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.style.setProperty("--reveal-delay", `${delay}ms`);
      delay += 70; // things that arrive together come in one after another
      el.classList.add("is-in");
      reveal.unobserve(el);
      // once shown, hand the element back its own transitions
      const settle = (event) => {
        if (event.target !== el) return; // a child's own transition
        el.removeEventListener("transitionend", settle);
        el.classList.remove("reveal");
        el.style.removeProperty("--reveal-delay");
      };
      el.addEventListener("transitionend", settle);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  $$(REVEAL).forEach((el) => {
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add("reveal");
    reveal.observe(el);
  });
}

/* hero film: plays by itself and repeats for as long as the page is open. After each run the
   last frame stays up for HOLD_MS, then the film starts again from the top. There are no controls.
   It only runs while at least a quarter of the hero is on screen and the tab is visible, and it
   waits for the network however slow it is. With reduced motion, Save-Data, or a browser that
   refuses autoplay (e.g. iOS Low Power Mode) the night still simply stays. */
const HOLD_MS = 10000;
const video = $("[data-hero-video]");

if (video) {
  let wanted = !reduceMotion.matches && !(navigator.connection && navigator.connection.saveData);
  const inWeChat = /MicroMessenger/i.test(navigator.userAgent);
  const landscape = window.matchMedia("(orientation: landscape)");
  let phase = "idle";        // idle | playing | holding
  let starting = false;      // a play() request is in flight
  let holdLeft = HOLD_MS;    // what remains of the hold, kept while the hero is off screen
  let holdTimer = 0;
  let holdSince = 0;

  // "on screen" means at least a quarter of the hero, the same line the observer below uses
  const heroShare = () => {
    const box = hero.getBoundingClientRect();
    return Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0)) / box.height;
  };
  let inView = heroShare() >= 0.25;
  const onStage = () => inView && !document.hidden;

  const setPhase = (next) => {
    phase = next;
    hero.dataset.film = next;
    video.classList.toggle("is-on", next !== "idle");
  };
  // the cut made for the screen's current shape (the inline script in index.html picks the first one)
  const cut = () => $(`source[data-shape="${landscape.matches ? "wide" : "tall"}"]`, video).src;

  // WeChat's in-app browser may only let a video start from its bridge callback
  const requestPlay = () => new Promise((resolve, reject) => {
    if (inWeChat && window.WeixinJSBridge) {
      window.WeixinJSBridge.invoke("getNetworkType", {}, () => video.play().then(resolve, reject));
    } else {
      video.play().then(resolve, reject);
    }
  });
  const play = () => {
    if (starting) return;
    starting = true;
    requestPlay().then(() => {
      starting = false;
      if (!onStage()) {        // on a slow network the visitor may have scrolled on before it started
        video.pause();
        return;
      }
      setPhase("playing");
      requestAnimationFrame(watchEnd);
    }, () => {
      // refused (e.g. iOS Low Power Mode) or interrupted: back to the still; a later chance retries
      starting = false;
      if (video.paused) setPhase("idle");
    });
  };
  const start = () => {
    if (!video.getAttribute("src")) video.src = cut();
    video.currentTime = 0;
    play();
  };

  // the hold counts down only while the hero is on screen
  const runHold = () => {
    if (holdTimer) return;
    holdSince = Date.now();
    holdTimer = setTimeout(() => {
      holdTimer = 0;
      holdLeft = HOLD_MS;
      start();
    }, holdLeft);
  };
  const pauseHold = () => {
    if (!holdTimer) return;
    clearTimeout(holdTimer);
    holdTimer = 0;
    holdLeft = Math.max(0, holdLeft - (Date.now() - holdSince));
  };
  const hold = () => {
    if (phase !== "playing") return;
    video.pause();
    if (!video.ended) video.currentTime = video.duration; // rest exactly on the last frame
    setPhase("holding");
    holdLeft = HOLD_MS;
    if (onStage()) runHold();
  };

  // some webviews (and headless Chrome) stop on the last frame without firing "ended"
  const reachedEnd = () => video.duration > 0 && video.currentTime >= video.duration - 0.05;
  const watchEnd = () => {
    if (phase !== "playing" || video.paused) return;
    if (reachedEnd()) hold();
    else requestAnimationFrame(watchEnd);
  };
  video.addEventListener("ended", hold);
  video.addEventListener("pause", () => { if (reachedEnd()) hold(); });

  const update = () => {
    if (!wanted) return;
    const on = onStage();
    if (phase === "idle") {
      if (on && !starting) start();
    } else if (phase === "playing") {
      if (!on) video.pause();
      else if (video.paused) play();
    } else if (on) {
      runHold();
    } else {
      pauseHold();
    }
  };

  setPhase("idle");
  update();             // the page opens at the top, so there is no need to wait for the observer
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.intersectionRatio >= 0.25;
      update();
    }, { threshold: 0.25 }).observe(hero);
  }
  document.addEventListener("visibilitychange", update);

  // a turned phone gets the cut made for its new shape, picking up where the film was
  landscape.addEventListener("change", () => {
    if (!wanted || !video.getAttribute("src")) return;
    const next = cut();
    if (video.currentSrc === next) return;
    const at = video.currentTime;
    const resume = phase === "playing" && !video.paused;
    video.src = next;
    video.addEventListener("loadedmetadata", () => {
      if (phase === "holding") video.currentTime = video.duration;
      else if (phase === "playing") {
        video.currentTime = at;
        if (resume) play();
      } else update();
    }, { once: true });
  });

  // turning on "reduce motion" while the page is open stops the film for good
  reduceMotion.addEventListener("change", () => {
    if (!reduceMotion.matches) return;
    wanted = false;
    pauseHold();
    video.pause();
    setPhase("idle");
  });

  // WeChat's bridge can arrive after the first attempt was refused
  if (wanted && inWeChat && !window.WeixinJSBridge) {
    document.addEventListener("WeixinJSBridgeReady", () => { if (phase === "idle") update(); }, false);
  }
}
