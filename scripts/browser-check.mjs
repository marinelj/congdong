#!/usr/bin/env node
// Drives headless Chrome over the DevTools protocol (Node's built-in WebSocket, no dependencies).
//
//   node scripts/browser-check.mjs video [url]                     play-once / replay / pause in real time
//   node scripts/browser-check.mjs page <url> <width> <height>     console errors, broken images, anchors, overflow
//   node scripts/browser-check.mjs shot <url> <width> <height> <out.png> [--full]
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

async function videoCheck(url) {
  const page = await openPage();
  await goto(page, url, 390, 844);
  const snap = (label) => page.evaluate(`(() => {
    const v = document.querySelector("[data-hero-video]"), t = document.querySelector("[data-video-toggle]");
    return { at: ${JSON.stringify(label)}, state: t.dataset.state, button: t.hidden ? "hidden" : t.textContent.trim(),
      time: Math.round(v.currentTime * 10) / 10, filmVisible: v.classList.contains("is-on"),
      played: sessionStorage.getItem("congdong-hero-played") };
  })()`);
  const click = () => page.evaluate(`document.querySelector("[data-video-toggle]").click()`);
  const log = [];
  await sleep(2500); log.push(await snap("after 2.5s"));
  await click(); await sleep(1000); log.push(await snap("paused for 1s"));
  await click(); await sleep(500); log.push(await snap("resumed"));
  await sleep(10500); log.push(await snap("after the end"));
  // a second visit in the same session must not autoplay, and there is no replay
  await goto(page, url, 390, 844);
  await sleep(2500); log.push(await snap("reload, same session"));
  page.close();
  return log;
}

async function shot(url, width, height, out, full) {
  const page = await openPage();
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
    console.log(await shot(url, Number(w), Number(h), resolve(out), args.includes("--full")));
  } else {
    console.error("usage: browser-check.mjs video [url] | shot <url> <width> <height> <out.png> [--full]");
    process.exitCode = 2;
  }
} finally {
  chrome.kill();
}
