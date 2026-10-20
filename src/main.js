/* Homepage behaviour: header state, menu, in-page navigation, facility filter,
   consult dock and sheet, inquiry template, and the play-once hero film. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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

/* menu */
$("[data-menu-open]").addEventListener("click", () => menu.showModal());
$("[data-menu-close]").addEventListener("click", () => menu.close());
menu.addEventListener("click", (event) => { if (event.target === menu) menu.close(); });

/* in-page links: scroll, then move focus to the section for keyboard and screen-reader users */
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || link.hasAttribute("data-open-sheet")) return;
  const target = document.getElementById(link.hash.slice(1));
  if (!target) return;
  event.preventDefault();
  if (menu.open) menu.close();
  target.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
  target.focus({ preventScroll: true });
  history.pushState(null, "", link.hash);
});

/* consult sheet (links fall back to #contact without JS) */
document.addEventListener("click", (event) => {
  const opener = event.target.closest("[data-open-sheet]");
  if (!opener || typeof sheet.showModal !== "function") return;
  event.preventDefault();
  if (menu.open) menu.close();
  sheet.showModal();
});
sheet.addEventListener("click", (event) => { if (event.target === sheet) sheet.close(); });

/* facility filter */
const chipBar = $("[data-chips]");
const facilityList = $("[data-facility-list]");
chipBar.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  const sport = chip.dataset.sport;
  $$(".chip", chipBar).forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
  let shown = 0;
  $$(".card", facilityList).forEach((card) => {
    const match = sport === "all" || card.dataset.sport === sport;
    card.hidden = !match;
    if (match) shown += 1;
  });
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
  "方向：小升初 / 初升高"
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
  button.addEventListener("click", () => {
    const scope = button.closest(".sheet-inner, .contact-card") || document.body;
    const status = $("[data-copy-status]", scope);
    copyText(INQUIRY_TEMPLATE, button.closest("dialog") || document.body).then((ok) => {
      if (!status) return;
      status.style.whiteSpace = ok ? "" : "pre-line";
      status.textContent = ok
        ? "已复制咨询模板，打开微信粘贴、补全后发送即可。"
        : "浏览器不允许自动复制，请长按选择下面的文字：\n" + INQUIRY_TEMPLATE;
    });
  });
});

/* hero film: plays once, then fades back to the night still.
   No autoplay with reduced motion, Save-Data, a slow start, or after it already played this session. */
const video = $("[data-hero-video]");
const toggle = $("[data-video-toggle]");
const toggleLabel = $("[data-video-label]");
const progress = $("[data-video-progress]");
const PLAYED_KEY = "congdong-hero-played";

function playedThisSession() {
  try { return sessionStorage.getItem(PLAYED_KEY) === "1"; } catch { return false; }
}
function rememberPlayed() {
  try { sessionStorage.setItem(PLAYED_KEY, "1"); } catch { /* storage unavailable */ }
}

if (video && toggle) {
  let state = "idle";          // idle | playing | paused | ended
  let pausedByScroll = false;
  let frame = 0;

  // the control only exists while the film is on screen, so it can be paused;
  // once the film has ended there is deliberately no replay
  const LABELS = {
    playing: ["暂停", "暂停宣传片"],
    paused: ["继续播放", "继续播放宣传片"]
  };
  const setState = (next) => {
    state = next;
    const onScreen = next === "playing" || next === "paused";
    toggle.hidden = !onScreen;
    toggle.dataset.state = next;
    if (onScreen) {
      toggleLabel.textContent = LABELS[next][0];
      toggle.setAttribute("aria-label", LABELS[next][1]);
    }
    video.classList.toggle("is-on", onScreen);
    progress.classList.toggle("is-on", onScreen);
  };
  // some webviews (and headless Chrome) stop on the last frame without firing "ended"
  const finish = () => {
    if (state === "ended") return;
    video.pause();
    setState("ended");
    rememberPlayed();
  };
  const reachedEnd = () => video.duration > 0 && video.currentTime >= video.duration - 0.05;
  const tick = () => {
    if (video.duration) progress.style.transform = `scaleX(${video.currentTime / video.duration})`;
    if (reachedEnd()) finish();
    else if (state === "playing") frame = requestAnimationFrame(tick);
  };
  const play = () => {
    if (video.preload !== "auto") {
      video.preload = "auto";
      video.load();
    }
    return video.play().then(() => {
      setState("playing");
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    }, () => { if (state !== "playing") setState("idle"); });
  };
  const pause = () => {
    video.pause();
    setState("paused");
  };

  video.addEventListener("ended", finish);
  video.addEventListener("timeupdate", () => { if (state === "playing" && reachedEnd()) finish(); });
  toggle.addEventListener("click", () => {
    pausedByScroll = false;
    if (state === "playing") pause();
    else play();
  });

  // pause when the hero leaves the screen; finish the single play when it comes back
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting && state === "playing") {
        pause();
        pausedByScroll = true;
      } else if (entry.isIntersecting && pausedByScroll) {
        pausedByScroll = false;
        play();
      }
    }, { threshold: 0.25 }).observe(hero);
  }

  setState("idle");

  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  if (!reduceMotion.matches && !saveData && !playedThisSession()) {
    const giveUp = setTimeout(() => {
      if (state !== "playing") {
        video.pause();
        setState("idle");
      }
    }, 4000);
    play().finally(() => clearTimeout(giveUp));
  }
}
