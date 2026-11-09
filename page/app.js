"use strict";

const $ = (id) => document.getElementById(id);
const api = () => window.magpie;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function say(text, bad = false) {
  const m = $("msg");
  m.hidden = !text;
  m.textContent = text || "";
  m.style.borderColor = bad ? "var(--magpie-red, #c53030)" : "";
}

let busy = false;
async function invoke(method, params, opts) {
  const r = await api().invoke(method, params || {}, opts);
  if (r && r.cancelled) throw new Error("已取消");
  return r;
}

function fmtAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function renderJob(job) {
  const box = $("job");
  box.replaceChildren();
  $("job-state").textContent = job?.state || "无";
  $("stop").disabled = !job || job.state !== "running";
  if (!job) {
    box.className = "wb-empty";
    box.textContent = "还没有运行过任务。";
    return;
  }
  box.className = "wb-job";
  const tot = job.totals || {};
  const line = el("div", "wb-job-line");
  line.append(el("span", "", `job ${job.id} · ${job.state}`), el("span", "", `+${tot.credit || 0} 积分 · +${tot.energy || 0} 能量`));
  box.append(line);
  if (job.startedAt) box.append(el("div", "wb-job-line", `${fmtAt(job.startedAt)} 起${job.endedAt ? `，${fmtAt(job.endedAt)} 结束` : ""}`));
  const steps = Array.isArray(job.steps) ? job.steps.slice(-12) : [];
  if (steps.length) {
    const ul = el("ul", "wb-steps");
    for (const s of steps) {
      const li = el("li");
      const mark = s.state === "ok" ? "✓" : s.state === "fail" ? "✗" : s.state === "skip" ? "－" : "…";
      li.append(el("span", s.state === "ok" ? "wb-ok" : s.state === "fail" ? "wb-fail" : s.state === "skip" ? "wb-skip" : "", mark),
        el("span", "wb-task-title", `${s.nickname || s.uid || ""} ${s.leg || ""}`),
        el("span", "wb-task-state", s.detail || s.state || ""));
      ul.append(li);
    }
    box.append(ul);
  }
  const logs = Array.isArray(job.log) ? job.log.slice(-2) : [];
  for (const l of logs) box.append(el("div", "wb-task-state", l));
}

function claimButton(uid, code) {
  const b = el("button", "wb-btn", "领奖");
  b.type = "button";
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await invoke("claim", { uid, code });
      await load();
    } catch (e) {
      say(String(e.message || e), true);
      b.disabled = false;
    }
  });
  return b;
}

function renderAccounts(accounts) {
  const box = $("accounts");
  box.replaceChildren();
  if (!Array.isArray(accounts) || !accounts.length) {
    box.className = "wb-empty";
    box.textContent = "没有可用的 WorkBuddy 国内版账号。先在 magpie 里登录。";
    return;
  }
  box.className = "";
  for (const a of accounts) {
    const acct = el("div", "wb-acct");
    const head = el("div", "wb-acct-head");
    head.append(el("span", "wb-name", a.nickname || a.uid), el("span", "wb-task-state", a.tasksEnabled ? "参与任务" : "已停用"));
    acct.append(head);
    const tasks = a.snapshot && Array.isArray(a.snapshot.tasks) ? a.snapshot.tasks : [];
    const shown = tasks.filter((t) => t.acceptStatus === "completed" || t.acceptStatus === "accepted" || t.acceptStatus === "not_accepted").slice(0, 12);
    if (shown.length) {
      const ul = el("ul", "wb-tasks");
      for (const t of shown) {
        const li = el("li");
        const prog = t.progress && t.progress.target ? `${t.progress.current}/${t.progress.target}` : "";
        const state = t.acceptStatus === "completed" ? "可领奖" : t.acceptStatus === "claimed" ? "已领奖" : t.acceptStatus === "accepted" ? "进行中" : "未接取";
        li.append(el("span", "wb-task-title", `${t.title || t.code}${prog ? ` · ${prog}` : ""}`), el("span", "wb-task-state", state));
        if (t.acceptStatus === "completed") li.append(claimButton(a.uid, t.code));
        ul.append(li);
      }
      acct.append(ul);
    } else {
      acct.append(el("div", "wb-task-state", "暂无任务快照，运行一轮后会刷新。"));
    }
    box.append(acct);
  }
}

function render(s) {
  const accounts = Array.isArray(s?.accounts) ? s.accounts : [];
  $("accounts-count").textContent = `${accounts.length} 个`;
  const st = s?.stats || {};
  $("credits").textContent = String(st.creditsToday || 0);
  $("energy").textContent = String(st.energyToday || 0);
  const sc = s?.scheduler || {};
  $("scheduler").textContent = sc.enabled ? "开" : "关";
  $("sched").checked = !!sc.enabled;
  $("claim").checked = sc.claim !== false;
  renderJob(s?.job || null);
  renderAccounts(accounts);
  if (Array.isArray(s?.engineErrors) && s.engineErrors.length) say(`引擎提示：${s.engineErrors.join("；")}`, true);
}

async function load() {
  if (busy) return;
  busy = true;
  try {
    const s = await invoke("status");
    render(s);
  } catch (e) {
    say(`读取状态失败：${e.message || e}`, true);
  } finally {
    busy = false;
  }
}

async function act(button, fn) {
  if (button) button.disabled = true;
  try {
    await fn();
    await load();
  } catch (e) {
    say(String(e.message || e), true);
  } finally {
    if (button) button.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await api().ready;
  } catch (e) {
    say(`页面初始化失败：${e.message || e}`, true);
    return;
  }

  $("refresh").addEventListener("click", () => act($("refresh"), () => invoke("refresh")));
  $("run").addEventListener("click", () => act($("run"), () => invoke("run", { legs: ["growth", "mp", "buddy", "travel", "night"], claim: true })));
  $("stop").addEventListener("click", () => act($("stop"), () => invoke("cancel")));
  $("sched").addEventListener("change", (e) => act(null, () => invoke("settings", { scheduler: e.target.checked })));
  $("claim").addEventListener("change", (e) => act(null, () => invoke("settings", { claim: e.target.checked })));

  await load();
  // a job's steps change on the engine's tick: poll while one runs, slowly otherwise
  setInterval(() => {
    if (document.hidden || busy) return;
    const running = $("job-state").textContent === "running";
    if (running) load();
  }, 2000);
  setInterval(() => { if (!document.hidden && !busy && $("job-state").textContent !== "running") load(); }, 15000);
});
