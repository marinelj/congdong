#!/usr/bin/env node
// Drives headless Chrome over the DevTools protocol (Node's built-in WebSocket, no dependencies).
//
//   node scripts/browser-check.mjs video [url]                     hero film in real time: plays once, pause, no replay;
//                                                                  opens at the top, autoplay refused, reduced motion, slow network
//   node scripts/browser-check.mjs page <url> <width> <height>     console errors, broken images, anchors, overflow
//   node scripts/browser-check.mjs shot <url> <width> <height> <out.png> [--full] [--reduced-motion]
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
  const listeners = new Map();
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
  };
  const send = (method, params = {}) => new Promise((ok, fail) => {
    pending.set(++id, { resolve: ok, reject: fail });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const once = (method) => new Promise((ok) => listeners.set(method, ok));
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  return { send, once, evaluate, problems, close: () => ws.close() };
}

async function pageCheck(url, width, height) {
  const page = await openPage();
  await goto(page, url, width, height);
  // scroll through the page so lazy images load, then audit
  await page.evaluate(`(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) {
      scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 120));
    }
    scrollTo({ top: 0, behavior: "instant" });
  })()`);
  await sleep(1500);
  const report = await page.evaluate(`(() => {
    const links = [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute("href"));
    return {
      title: document.title,
      images: document.images.length,
      brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
      notYetLoaded: [...document.images].filter((i) => !i.complete).map((i) => i.getAttribute("src")),
      missingAnchors: [...new Set(links)].filter((h) => h.length > 1 && !document.getElementById(h.slice(1))),
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
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

// each scenario opens its own tab, so sessionStorage (the "already played" flag) starts empty
async function videoCheck(url) {
  const log = [];
  const film = (page, scenario, at) => page.evaluate(`(() => {
    const v = document.querySelector("[data-hero-video]"), t = document.querySelector("[data-video-toggle]");
    return { scenario: ${JSON.stringify(scenario)}, at: ${JSON.stringify(at)}, state: t.dataset.state,
      button: t.hidden ? "hidden" : t.textContent.trim(), time: Math.round(v.currentTime * 10) / 10,
      filmVisible: v.classList.contains("is-on"), played: sessionStorage.getItem("congdong-hero-played"),
      scrollY: Math.round(scrollY), address: location.href.replace(location.origin, "") };
  })()`).then((row) => log.push(row));
  const click = (page) => page.evaluate(`document.querySelector("[data-video-toggle]").click()`);
  const done = (page, scenario) => {
    if (page.problems.length) log.push({ scenario, consoleProblems: page.problems });
    page.close();
  };

  let page = await openPage();
  await goto(page, url, 390, 844);
  await sleep(2500); await film(page, "top", "after 2.5s");
  await click(page); await sleep(1000); await film(page, "top", "paused for 1s");
  await click(page); await sleep(500); await film(page, "top", "resumed");
  await sleep(10500); await film(page, "top", "after the end");
  // a second visit in the same session must not autoplay, and there is no replay
  await goto(page, url, 390, 844);
  await sleep(2500); await film(page, "top", "reload, same session");
  done(page, "top");

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

  // a browser that refuses autoplay (iOS Low Power Mode) keeps the night still, with no play button
  page = await openPage();
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("autoplay refused", "NotAllowedError"));` });
  await goto(page, url, 390, 844);
  await sleep(2000); await film(page, "autoplay refused", "after 2s");
  done(page, "autoplay refused");

  page = await openPage();
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await goto(page, url, 390, 844);
  await sleep(2000); await film(page, "reduced motion", "after 2s");
  done(page, "reduced motion");

  // a slow link like the Jupyter tunnel (seconds to first byte, about real-time throughput):
  // the film must still play once it arrives instead of being given up on
  page = await openPage();
  await page.send("Network.enable");
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.send("Network.emulateNetworkConditions", {
    offline: false, latency: 3000, downloadThroughput: 160 * 1024, uploadThroughput: 64 * 1024
  });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.send("Page.navigate", { url });
  const started = Date.now();
  let last = "";
  while (Date.now() - started < 60000) {
    await sleep(500);
    const state = await page.evaluate(`document.querySelector("[data-video-toggle]")?.dataset.state || ""`).catch(() => "");
    if (state && state !== last) await film(page, "slow network", `state changed at ${((Date.now() - started) / 1000).toFixed(1)}s`);
    last = state || last;
    if (state === "ended") break;
  }
  if (last !== "ended") await film(page, "slow network", "gave up waiting after 60s");
  done(page, "slow network");
  return log;
}

async function shot(url, width, height, out, full, reducedMotion) {
  const page = await openPage();
  if (reducedMotion) await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await goto(page, url, width, height);
  await sleep(2500);
  let clip;
  if (full) {
    const h = await page.evaluate("document.documentElement.scrollHeight");
    clip = { x: 0, y: 0, width, height: h, scale: 1 };
  }
  const { data } = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!full, ...(clip ? { clip } : {}) });
  writeFileSync(out, Buffer.from(data, "base64"));
  page.close();
  return out;
}

const [cmd, ...args] = process.argv.slice(2);
const chrome = await launch();
try {
  if (cmd === "video") {
    for (const row of await videoCheck(args[0] || "http://127.0.0.1:4321/")) console.log(JSON.stringify(row));
  } else if (cmd === "page") {
    const [url, w, h] = args;
    console.log(JSON.stringify(await pageCheck(url, Number(w), Number(h)), null, 1));
  } else if (cmd === "shot") {
    const [url, w, h, out] = args;
    console.log(await shot(url, Number(w), Number(h), resolve(out), args.includes("--full"), args.includes("--reduced-motion")));
  } else {
    console.error("usage: browser-check.mjs video [url] | page <url> <width> <height> | shot <url> <width> <height> <out.png> [--full] [--reduced-motion]");
    process.exitCode = 2;
  }
} finally {
  chrome.kill();
}
