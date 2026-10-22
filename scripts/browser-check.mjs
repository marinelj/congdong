#!/usr/bin/env node
// Drives headless Chrome over the DevTools protocol (Node's built-in WebSocket, no dependencies).
//
//   node scripts/browser-check.mjs video [url]                     hero film in real time: plays, rests on the night still 10 s,
//                                                                  starts again; no controls; off screen, turned sideways,
//                                                                  opens at the top, autoplay refused, WeChat (iOS bridge, Android canvas,
//                                                                  refused video, silent bridge), reduced motion, slow network
//   node scripts/browser-check.mjs ui [url] [out-prefix]           menu, consult sheet, facility filter, current-section marker, dock
//   node scripts/browser-check.mjs page <url> <width> <height>     console errors, broken images, anchors, overflow, small touch targets
//   node scripts/browser-check.mjs shot <url> <width> <height> <out.png> [--full] [--reduced-motion] [--wait=<ms>]
//   node scripts/browser-check.mjs shots <url> <width> <height> <out-prefix> [--reduced-motion]
//                                                                  one screenshot per screenful, scrolled like a visitor would
//
// Uses a throwaway profile under .cache/chrome-profile so it never touches your own Chrome data.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const profile = resolve(ROOT, ".cache/chrome-profile");
  mkdirSync(profile, { recursive: true });
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--no-first-run", "about:blank"
  ], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return proc;
    } catch { await sleep(100); }
  }
  proc.kill();
  throw new Error("Chrome did not start");
}

async function openPage() {
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();   // once(): the next event of a kind
  const handlers = new Map();    // on(): every event of a kind
  const problems = [];
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: ok, reject: fail } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
      return;
    }
    if (msg.method === "Runtime.exceptionThrown") {
      problems.push("exception: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    } else if (msg.method === "Log.entryAdded" && ["error", "warning"].includes(msg.params.entry.level)) {
      problems.push(`${msg.params.entry.level}: ${msg.params.entry.text} ${msg.params.entry.url || ""}`.trim());
    } else if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
      problems.push(`console.${msg.params.type}: ` + msg.params.args.map((a) => a.value ?? a.description).join(" "));
    }
    if (msg.method && listeners.has(msg.method)) {
      listeners.get(msg.method)(msg.params);
      listeners.delete(msg.method);
    }
    if (msg.method && handlers.has(msg.method)) handlers.get(msg.method).forEach((fn) => fn(msg.params));
  };
  const send = (method, params = {}) => new Promise((ok, fail) => {
    pending.set(++id, { resolve: ok, reject: fail });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const once = (method) => new Promise((ok) => listeners.set(method, ok));
  const on = (method, fn) => handlers.set(method, [...(handlers.get(method) || []), fn]);
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  // closing shuts the tab too, so earlier scenarios don't keep playing the film in the background
  const close = () => {
    ws.close();
    fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {});
  };
  return { send, once, on, evaluate, problems, close };
}

// scroll through the page so lazy images load and every section has revealed itself
const SCROLL_THROUGH = `(async () => {
  for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.6) {
    scrollTo({ top: y, behavior: "instant" });
    await new Promise((r) => setTimeout(r, 150));
  }
  scrollTo({ top: 0, behavior: "instant" });
})()`;

async function pageCheck(url, width, height) {
  const page = await openPage();
  await goto(page, url, width, height);
  await page.evaluate(SCROLL_THROUGH);
  await sleep(1500);
  const report = await page.evaluate(`(() => {
    const links = [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute("href"));
    const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("alt") || "").trim().replace(/\\s+/g, " ").slice(0, 18);
    // touch targets under 44 px on either side (phones only; text links inside sentences don't count)
    const small = innerWidth >= 960 ? [] : [...document.querySelectorAll("a[href], button, summary")]
      .filter((el) => !el.closest("dialog:not([open])") && !el.closest("p, li > span, dd"))
      .map((el) => [el, el.getBoundingClientRect()])
      .filter(([el, r]) => r.width > 0 && r.height > 0 && r.bottom + scrollY > 0 && getComputedStyle(el).visibility !== "hidden" && (r.width < 44 || r.height < 44))
      .map(([el, r]) => el.tagName.toLowerCase() + "." + (el.classList[0] || "") + ' "' + label(el) + '" ' + Math.round(r.width) + "x" + Math.round(r.height));
    return {
      title: document.title,
      images: document.images.length,
      brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
      notYetLoaded: [...document.images].filter((i) => !i.complete).map((i) => i.getAttribute("src")),
      missingAnchors: [...new Set(links)].filter((h) => h.length > 1 && !document.getElementById(h.slice(1))),
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      stillHidden: [...document.querySelectorAll(".reveal:not(.is-in)")].length,
      smallTouchTargets: small,
      fontsLoaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family)
    };
  })()`);
  report.consoleProblems = page.problems;
  page.close();
  return report;
}

async function goto(page, url, width, height) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: width < 900 });
  const loaded = page.once("Page.loadEventFired");
  await page.send("Page.navigate", { url });
  await loaded;
}

// polls a page expression until it is truthy; resolves to the seconds it took (or null on timeout)
async function waitFor(page, expression, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await page.evaluate(expression).catch(() => false)) return (Date.now() - started) / 1000;
    await sleep(100);
  }
  return null;
}

// each scenario opens its own tab
async function videoCheck(url) {
  const log = [];
  // source is "video", or "canvas" where JSMpeg draws the film (WeChat); time and paused are the video's
  const film = (page, scenario, at) => page.evaluate(`(() => {
    const v = document.querySelector("[data-hero-video]"), hero = document.querySelector("[data-hero]");
    const c = document.querySelector(".hero-media canvas"), onCanvas = hero.dataset.filmSource === "canvas";
    const shown = onCanvas ? c : v;
    return { scenario: ${JSON.stringify(scenario)}, at: ${JSON.stringify(at)}, phase: hero.dataset.film,
      source: hero.dataset.filmSource, time: onCanvas ? null : Math.round(v.currentTime * 10) / 10,
      paused: onCanvas ? null : v.paused, filmVisible: !!shown && shown.classList.contains("is-on"),
      cut: onCanvas ? (c && c.width > 300 ? (c.width > c.height ? "16x9" : "9x16") : "none")
        : (v.currentSrc.match(/hero-loop-(\\d+x\\d+)/) || [])[1] || "none",
      controls: document.querySelectorAll("[data-video-toggle], .hero-play, .hero-progress, video[controls]").length,
      scrollY: Math.round(scrollY), address: location.href.replace(location.origin, "") };
  })()`).then((row) => log.push(row));
  const phaseIs = (phase) => `document.querySelector("[data-hero]").dataset.film === "${phase}"`;
  // whether the picture changes over ms milliseconds, from two small screenshots of the screen
  const moving = async (page, ms = 800) => {
    const [width, height] = await page.evaluate("[innerWidth, innerHeight]");
    const clip = { x: 0, y: 0, width, height, scale: 0.25 };
    const before = (await page.send("Page.captureScreenshot", { format: "png", clip })).data;
    await sleep(ms);
    return before !== (await page.send("Page.captureScreenshot", { format: "png", clip })).data;
  };
  // the film files a page downloads, without Vite's content hash (and without the dev server's
  // ?url lookups, which only return a file's address)
  const fetched = (page) => {
    const files = new Set();
    page.on("Network.requestWillBeSent", ({ request }) => {
      if (/[?&]url\b/.test(request.url)) return;
      const name = (request.url.match(/(hero-loop-[^/?#]+|jsmpeg[^/?#]+)/) || [])[1];
      if (name) files.add(name.replace(/-[\w-]{8}(\.\w+)$/, "$1"));
    });
    return files;
  };
  const ANDROID_WECHAT = "Mozilla/5.0 (Linux; Android 14; 23127PN0CC Build/UKQ1.230804.001; wv) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.103 Mobile Safari/537.36 XWEB/1300333 MMWEBSDK/20241103 " +
    "MicroMessenger/8.0.55.2780(0x28003737) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64";
  const IPHONE_WECHAT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50";
  const LANDSCAPE = { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: "landscapePrimary", angle: 90 } };
  const PORTRAIT = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: "portraitPrimary", angle: 0 } };
  const REFUSE_VIDEO = `HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("autoplay refused", "NotAllowedError"));`;
  const done = (page, scenario) => {
    if (page.problems.length) log.push({ scenario, consoleProblems: page.problems });
    page.close();
  };

  // plays, fades back to the night still for 10 s, then starts again from the top, with no controls anywhere
  let page = await openPage();
  await goto(page, url, 390, 844);
  const startedIn = await waitFor(page, phaseIs("playing"), 15000);
  await film(page, "loop", `playing ${startedIn}s after load`);
  const runFor = await waitFor(page, phaseIs("holding"), 15000);
  await film(page, "loop", `holding after ${runFor}s of film`);
  await sleep(5000); await film(page, "loop", "5s into the hold");
  const heldFor = await waitFor(page, phaseIs("playing"), 15000);
  await film(page, "loop", `playing again after a ${(5 + heldFor).toFixed(1)}s hold`);
  await sleep(2000); await film(page, "loop", "2s into the second run");
  // every time the page opens the film starts again
  await goto(page, url, 390, 844);
  await sleep(2500); await film(page, "loop", "opened again in the same tab");
  done(page, "loop");

  // off screen: the film pauses, and the hold only counts down while the hero is on screen
  page = await openPage();
  await goto(page, url, 390, 844);
  await waitFor(page, phaseIs("playing"), 15000);
  await sleep(2000);
  await page.evaluate(`scrollTo({ top: innerHeight * 1.5, behavior: "instant" })`);
  await sleep(1500); await film(page, "off screen", "scrolled away for 1.5s while playing");
  await page.evaluate(`scrollTo({ top: 0, behavior: "instant" })`);
  await sleep(1000); await film(page, "off screen", "back at the top for 1s");
  await waitFor(page, phaseIs("holding"), 15000);
  await sleep(3000);
  await page.evaluate(`scrollTo({ top: innerHeight * 1.5, behavior: "instant" })`);
  await sleep(6000); await film(page, "off screen", "3s into the hold, then away for 6s");
  await page.evaluate(`scrollTo({ top: 0, behavior: "instant" })`);
  const rest = await waitFor(page, phaseIs("playing"), 15000);
  await film(page, "off screen", `back: restarted ${rest}s later (7s of hold were left)`);
  done(page, "off screen");

  // turning the phone swaps to the wide cut and carries on from the same moment; turned back
  // during the hold, the still stays up and the next run is the tall cut
  page = await openPage();
  await goto(page, url, 390, 844);
  await waitFor(page, phaseIs("playing"), 15000);
  await sleep(3000); await film(page, "turned sideways", "portrait, 3s in");
  await page.send("Emulation.setDeviceMetricsOverride", LANDSCAPE);
  await sleep(1500); await film(page, "turned sideways", "1.5s after turning to landscape");
  await waitFor(page, phaseIs("holding"), 15000);
  await sleep(2000);
  await page.send("Emulation.setDeviceMetricsOverride", PORTRAIT);
  await sleep(2000); await film(page, "turned sideways", "turned back 2s into the hold, 2s later");
  const tallAt = await waitFor(page, phaseIs("playing"), 15000);
  await film(page, "turned sideways", `playing again ${tallAt}s later (6s of hold were left)`);
  done(page, "turned sideways");

  // an address with a #section still opens at the top, without the #section, and the film plays
  page = await openPage();
  await goto(page, new URL("#training", url).href, 390, 844);
  await sleep(2500); await film(page, "opened with #training", "after 2.5s");
  done(page, "opened with #training");

  // menu links leave the address alone, and a reload starts at the top again
  page = await openPage();
  await goto(page, url, 390, 844);
  await page.evaluate(`document.querySelector('a[href="#training"]').click()`);
  await page.evaluate(`scrollTo({ top: document.getElementById("training").offsetTop, behavior: "instant" })`);
  await sleep(500); await film(page, "link, then reload", "at 集训 after clicking its link");
  const reloaded = page.once("Page.loadEventFired");
  await page.send("Page.reload");
  await reloaded;
  await sleep(500); await film(page, "link, then reload", "after reload");
  done(page, "link, then reload");

  // a browser that refuses autoplay (iOS Low Power Mode) keeps the night still, with no controls
  page = await openPage();
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: REFUSE_VIDEO });
  await goto(page, url, 390, 844);
  await sleep(2000); await film(page, "autoplay refused", "after 2s");
  done(page, "autoplay refused");

  // WeChat on iOS: autoplay is refused except from the WeixinJSBridge callback
  page = await openPage();
  await page.send("Emulation.setUserAgentOverride", { userAgent: IPHONE_WECHAT });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    const realPlay = HTMLMediaElement.prototype.play;
    let insideBridge = false;
    HTMLMediaElement.prototype.play = function () {
      return insideBridge ? realPlay.call(this) : Promise.reject(new DOMException("autoplay refused", "NotAllowedError"));
    };
    setTimeout(() => {
      window.WeixinJSBridge = { invoke: (name, args, callback) => setTimeout(() => { insideBridge = true; callback({}); insideBridge = false; }, 50) };
      document.dispatchEvent(new Event("WeixinJSBridgeReady"));
    }, 1500);` });
  await goto(page, url, 390, 844);
  await sleep(4000); await film(page, "WeChat", "4s after opening");
  const wechatHold = await waitFor(page, phaseIs("holding"), 15000);
  const wechatAgain = wechatHold === null ? null : await waitFor(page, phaseIs("playing"), 15000);
  await film(page, "WeChat", `restarted after the hold (through the bridge): ${wechatAgain !== null}`);
  done(page, "WeChat");

  // WeChat on Android never starts a video by itself: JSMpeg draws the film on a canvas, the MP4
  // is never fetched, and it holds, starts again, and pauses off screen the same way
  page = await openPage();
  await page.send("Network.enable");
  let files = fetched(page);
  await page.send("Emulation.setUserAgentOverride", { userAgent: ANDROID_WECHAT });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: REFUSE_VIDEO });
  await goto(page, url, 390, 844);
  const drawnIn = await waitFor(page, phaseIs("playing"), 30000);
  await film(page, "WeChat on Android", `playing ${drawnIn}s after load, picture moving: ${await moving(page)}`);
  const canvasRun = await waitFor(page, phaseIs("holding"), 20000);
  const held = Date.now();
  // the canvas fades out to the night still (no screenshot comparison here: once the fade is over
  // Chrome redraws the shade a level off in places)
  const fadedIn = await waitFor(page, `getComputedStyle(document.querySelector(".hero-media canvas")).opacity === "0"`, 3000);
  await film(page, "WeChat on Android", `holding after ${canvasRun}s of film, faded to the still in ${fadedIn}s`);
  await waitFor(page, phaseIs("playing"), 15000);
  const rerun = Date.now();
  await film(page, "WeChat on Android", `playing again after a ${((rerun - held) / 1000).toFixed(1)}s hold, ` +
    `picture moving: ${await moving(page)}`);
  await sleep(1200);
  await page.evaluate(`scrollTo({ top: innerHeight * 1.5, behavior: "instant" })`);
  await sleep(4000);
  await page.evaluate(`scrollTo({ top: 0, behavior: "instant" })`);
  await waitFor(page, phaseIs("holding"), 20000);
  await film(page, "WeChat on Android", `second run took ${((Date.now() - rerun) / 1000).toFixed(1)}s ` +
    `with 4s of it off screen (about 14.6 when it pauses)`);
  log.push({ scenario: "WeChat on Android", fetched: [...files] });
  done(page, "WeChat on Android");

  // turning the phone brings the canvas the wide cut, from the top; turned back during the hold,
  // the still stays up for the rest of it and the next run is the tall cut
  page = await openPage();
  await page.send("Network.enable");
  files = fetched(page);
  await page.send("Emulation.setUserAgentOverride", { userAgent: ANDROID_WECHAT });
  await goto(page, url, 390, 844);
  await waitFor(page, phaseIs("playing"), 30000);
  await sleep(2000);
  await page.send("Emulation.setDeviceMetricsOverride", LANDSCAPE);
  const canvasIs = (shape) => `(() => { const c = document.querySelector(".hero-media canvas");
    return ${phaseIs("playing")} && c && c.width > 300 && ${shape === "wide" ? "c.width > c.height" : "c.height > c.width"}; })()`;
  const wideIn = await waitFor(page, canvasIs("wide"), 30000);
  await film(page, "WeChat on Android, turned", `wide cut playing ${wideIn}s after turning, picture moving: ${await moving(page)}`);
  await waitFor(page, phaseIs("holding"), 20000);
  await sleep(2000);
  await page.send("Emulation.setDeviceMetricsOverride", PORTRAIT);
  await sleep(2000); await film(page, "WeChat on Android, turned", "turned back 2s into the hold, 2s later");
  const tallIn = await waitFor(page, canvasIs("tall"), 30000);
  await film(page, "WeChat on Android, turned", `tall cut playing ${tallIn}s later (6s of hold were left)`);
  log.push({ scenario: "WeChat on Android, turned", fetched: [...files] });
  done(page, "WeChat on Android, turned");

  // WeChat refusing the video even through its bridge (a stricter iOS build): the canvas takes over
  page = await openPage();
  await page.send("Network.enable");
  files = fetched(page);
  await page.send("Emulation.setUserAgentOverride", { userAgent: IPHONE_WECHAT });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: REFUSE_VIDEO + `
    window.WeixinJSBridge = { invoke: (name, args, callback) => setTimeout(() => callback({}), 50) };` });
  await goto(page, url, 390, 844);
  const tookOver = await waitFor(page, phaseIs("playing"), 30000);
  await film(page, "WeChat refuses the video", `playing ${tookOver}s after load, picture moving: ${await moving(page)}`);
  log.push({ scenario: "WeChat refuses the video", fetched: [...files] });
  done(page, "WeChat refuses the video");

  // a WeChat whose bridge never answers (e.g. the desktop app) mustn't keep the film waiting
  page = await openPage();
  await page.send("Emulation.setUserAgentOverride", { userAgent: IPHONE_WECHAT });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.WeixinJSBridge = { invoke() {} };` });
  await goto(page, url, 390, 844);
  const silent = await waitFor(page, phaseIs("playing"), 15000);
  await film(page, "WeChat bridge silent", `playing ${silent}s after load`);
  done(page, "WeChat bridge silent");

  page = await openPage();
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await goto(page, url, 390, 844);
  await sleep(2000); await film(page, "reduced motion", "after 2s");
  done(page, "reduced motion");

  // a slow link like the Jupyter tunnel (seconds to first byte, about real-time throughput):
  // the film must still start once it arrives instead of being given up on
  page = await openPage();
  await page.send("Network.enable");
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.send("Network.emulateNetworkConditions", {
    offline: false, latency: 3000, downloadThroughput: 160 * 1024, uploadThroughput: 64 * 1024
  });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.send("Page.navigate", { url });
  const slow = await waitFor(page, phaseIs("playing"), 60000);
  await film(page, "slow network", slow === null ? "gave up waiting after 60s" : `playing ${slow.toFixed(1)}s after navigating`);
  done(page, "slow network");
  return log;
}

async function shot(url, width, height, out, full, reducedMotion, wait = 2500) {
  const page = await openPage();
  if (reducedMotion) await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await goto(page, url, width, height);
  await sleep(wait);
  let clip;
  if (full) {
    await page.evaluate(SCROLL_THROUGH);
    await sleep(1500);
    const h = await page.evaluate("document.documentElement.scrollHeight");
    clip = { x: 0, y: 0, width, height: h, scale: 1 };
  }
  const { data } = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!full, ...(clip ? { clip } : {}) });
  writeFileSync(out, Buffer.from(data, "base64"));
  page.close();
  return out;
}

// interactions: menu, consult sheet, facility filter, current-section marker, dock; with an
// out-prefix it also saves the open menu and sheet on a phone held upright and sideways
async function uiCheck(url, prefix) {
  const log = [];
  const page = await openPage();
  const state = (at) => page.evaluate(`(() => {
    const menu = document.querySelector("[data-menu]"), sheet = document.querySelector("[data-sheet]");
    const dock = document.querySelector("[data-dock]"), cta = document.querySelector(".header-cta");
    return { at: ${JSON.stringify(at)}, menuOpen: menu.open, sheetOpen: sheet.open,
      pageLocked: getComputedStyle(document.documentElement).overflow === "hidden",
      focus: document.activeElement.id || document.activeElement.className || document.activeElement.tagName,
      scrollY: Math.round(scrollY), hash: location.hash,
      current: [...document.querySelectorAll('.nav-desktop a[aria-current="true"]')].map((a) => a.textContent).join(),
      chip: document.querySelector('.chip[aria-pressed="true"]').textContent,
      cards: document.querySelectorAll(".facility-list .card:not([hidden])").length,
      announced: document.querySelector("[data-live]").textContent,
      dock: getComputedStyle(dock).display === "none" ? "none" : dock.classList.contains("is-visible") ? "shown" : "tucked away",
      headerButton: getComputedStyle(cta).display !== "none" };
  })()`).then((row) => log.push(row));
  const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const key = async (k, code) => {
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: code === "Escape" ? 27 : 0 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: code === "Escape" ? 27 : 0 });
  };
  const tap = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  };
  const snap = async (name) => {
    if (!prefix) return;
    const { data } = await page.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${prefix}-${name}.png`, Buffer.from(data, "base64"));
  };

  await goto(page, url, 390, 844);
  await sleep(800);
  await click("[data-menu-open]"); await sleep(600); await state("menu opened"); await snap("menu");
  await key("Escape", "Escape"); await sleep(500); await state("Esc pressed");
  await click("[data-menu-open]"); await sleep(600);
  await click('.menu-nav a[href="#facilities"]'); await sleep(1800); await state("menu link 场地设施 tapped");
  await click('.chip[data-sport="golf"]'); await sleep(900); await state("chip 高尔夫 tapped");
  await click('.chip[data-sport="all"]'); await sleep(900); await state("chip 全部 tapped");
  await page.evaluate(`scrollTo({ top: document.getElementById("stay").offsetTop, behavior: "instant" })`);
  await sleep(500); await state("scrolled to 住宿餐饮");
  await click("[data-dock] a"); await sleep(600); await state("dock button tapped"); await snap("sheet");
  await click(".sheet-close"); await sleep(500); await state("sheet close button tapped");
  await click("[data-dock] a"); await sleep(600);
  await tap(195, 60); await sleep(500); await state("tapped the backdrop above the sheet");
  await page.evaluate(`scrollTo({ top: document.getElementById("contact").offsetTop, behavior: "instant" })`);
  await sleep(500); await state("scrolled to 联系我们");

  await goto(page, url, 844, 390);
  await sleep(800); await state("phone turned sideways");
  await click("[data-menu-open]"); await sleep(600); await snap("menu-landscape");
  await key("Escape", "Escape"); await sleep(500);
  await click(".header-cta"); await sleep(600); await state("header button tapped (sideways)"); await snap("sheet-landscape");
  await key("Escape", "Escape"); await sleep(500);

  await goto(page, url, 1440, 900);
  for (const id of ["training", "facilities", "bases", "stay", "study", "contact"]) {
    await page.evaluate(`scrollTo({ top: document.getElementById("${id}").offsetTop + 200, behavior: "instant" })`);
    await sleep(400); await state(`desktop: inside #${id}`);
  }
  if (page.problems.length) log.push({ consoleProblems: page.problems });
  page.close();
  return log;
}

// what a visitor sees: one screenful at a time, after everything has loaded and revealed
async function shots(url, width, height, prefix, reducedMotion) {
  const page = await openPage();
  if (reducedMotion) await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await goto(page, url, width, height);
  await sleep(2500);
  await page.evaluate(SCROLL_THROUGH);
  await sleep(1500);
  const total = await page.evaluate("document.documentElement.scrollHeight");
  const files = [];
  for (let y = 0, i = 0; y < total; y += height, i++) {
    await page.evaluate(`scrollTo({ top: ${y}, behavior: "instant" })`);
    await sleep(400);
    const { data } = await page.send("Page.captureScreenshot", { format: "png" });
    const file = `${prefix}-${String(i).padStart(2, "0")}.png`;
    writeFileSync(file, Buffer.from(data, "base64"));
    files.push(file);
  }
  if (page.problems.length) files.push(...page.problems.map((p) => `console: ${p}`));
  page.close();
  return files;
}

const [cmd, ...args] = process.argv.slice(2);
const chrome = await launch();
try {
  if (cmd === "video") {
    for (const row of await videoCheck(args[0] || "http://127.0.0.1:4321/")) console.log(JSON.stringify(row));
  } else if (cmd === "ui") {
    for (const row of await uiCheck(args[0] || "http://127.0.0.1:4321/", args[1] && resolve(args[1]))) console.log(JSON.stringify(row));
  } else if (cmd === "page") {
    const [url, w, h] = args;
    console.log(JSON.stringify(await pageCheck(url, Number(w), Number(h)), null, 1));
  } else if (cmd === "shot") {
    const [url, w, h, out] = args;
    const wait = args.find((a) => a.startsWith("--wait="));
    console.log(await shot(url, Number(w), Number(h), resolve(out), args.includes("--full"), args.includes("--reduced-motion"),
      wait ? Number(wait.slice(7)) : undefined));
  } else if (cmd === "shots") {
    const [url, w, h, prefix] = args;
    for (const line of await shots(url, Number(w), Number(h), resolve(prefix), args.includes("--reduced-motion"))) console.log(line);
  } else {
    console.error("usage: browser-check.mjs video [url] | page <url> <width> <height> | shot <url> <width> <height> <out.png> [--full] [--reduced-motion] [--wait=<ms>] | shots <url> <width> <height> <out-prefix> [--reduced-motion]");
    process.exitCode = 2;
  }
} finally {
  chrome.kill();
}
