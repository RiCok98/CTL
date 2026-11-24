"use strict";
const $ = id => document.getElementById(id);
const thisYear = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Seoul" }).format());
const parts = ["교원파트", "학습파트", "원격파트"];
const leads = ["학과주도", "부서주도", "기타"];
const key = "ctl-programs-v1";
const sample = [
  ["신입생 학습전략 워크숍", "대학혁신지원사업", 12000000, 9800000, 200, 218, "명"],
  ["교수법 연구공동체", "대학혁신지원사업", 18000000, 12700000, 15, 12, "팀"],
  ["학습 튜터링", "교비", 14000000, 11200000, 120, 130, "명"],
  ["AI 활용 교수법 특강", "교비", 7000000, 4300000, 80, 58, "명"],
  ["지역 연계 프로젝트", "RISE 사업", 25000000, 17600000, 10, 7, "팀"],
  ["학습성과 공유회", "RISE 사업", 6000000, 3900000, 100, 104, "명"]
].map(([name, fund, budget, spent, target, actual, unit], i) => ({
  id: "sample-" + i, name, fund, budget, spent, target, actual, unit, year: thisYear, owner: "", part: [parts[1], parts[0], parts[1], parts[0], parts[2], parts[2]][i], lead: leads[i % 2], org: ""
}));
let programs = sample;
let editing;
let shared = false;
let accountName = "";
let saving = false;
let legacy = [];
let view = "dashboard";
let storageError = "";
try {
  const stored = JSON.parse(localStorage.getItem(key));
  if (Array.isArray(stored)) {
    programs = stored.map(p => ({ part: "", lead: "", org: "", ...p }));
    legacy = programs.filter(p => {
      const example = sample.find(item => item.id === p.id);
      return !example || Object.keys(p).some(field => !["part", "lead", "org"].includes(field) && p[field] !== example[field]);
    });
  }
} catch {
  storageError = "저장된 데이터를 읽을 수 없습니다.";
}
const number = value => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(value);
const won = value => number(value) + "원";
const pct = (value, base) => base ? (100 * value / base).toFixed(1).replace(/\.0$/, "") + "%" : "—";
const status = p => p.target <= 0 ? "neutral" : p.actual >= p.target ? "ok" : "pending";
const labels = { neutral: "목표 미설정", ok: "달성", pending: "미달" };
const esc = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const sum = (items, field) => items.reduce((total, p) => total + p[field], 0);

function selectOptions(select, first, values, defaultValue = "") {
  const previous = select.options.length ? select.value : defaultValue;
  select.replaceChildren(new Option(first, ""), ...values.map(value => new Option(value, value)));
  select.value = values.map(String).includes(previous) ? previous : "";
}
function filteredPrograms() {
  const query = $("query").value.trim().toLocaleLowerCase("ko-KR");
  return programs.filter(p =>
    (!$("year").value || p.year === Number($("year").value)) &&
    (!$("fund").value || p.fund === $("fund").value) &&
    (!$("part").value || p.part === $("part").value) &&
    (!$("lead").value || p.lead === $("lead").value) &&
    (!$("statusFilter").value || status(p) === $("statusFilter").value) &&
    (!query || [p.name, p.fund, p.owner, p.org].some(value => value.toLocaleLowerCase("ko-KR").includes(query)))
  );
}
function fundingPrograms() {
  return programs.filter(p => (!$("fundYear").value || p.year === Number($("fundYear").value)) &&
    (!$("fundPart").value || p.part === $("fundPart").value) &&
    (!$("fundLead").value || p.lead === $("fundLead").value));
}
function groups(items) {
  return Array.from(Map.groupBy(items, p => p.fund), ([fund, items]) => ({
    fund, items, budget: sum(items, "budget"), spent: sum(items, "spent"),
    reached: items.filter(p => status(p) === "ok").length,
    tracked: items.filter(p => p.target > 0).length
  }));
}
function render() {
  const years = [...new Set([thisYear, ...programs.map(p => p.year)])].sort((a, b) => b - a);
  const funds = [...new Set(programs.map(p => p.fund))].sort((a, b) => a.localeCompare(b, "ko"));
  selectOptions($("year"), "전체 연도", years, String(thisYear));
  selectOptions($("fundYear"), "전체 연도", years, String(thisYear));
  selectOptions($("fund"), "전체 재원", funds);
  for (const id of ["part", "fundPart"]) selectOptions($(id), "전체 파트", parts);
  for (const id of ["lead", "fundLead"]) selectOptions($(id), "전체 운영 유형", leads);
  $("fundOptions").replaceChildren(...funds.map(fund => new Option(fund)));
  const selectedYear = view === "funding" ? $("fundYear").value : $("year").value;
  $("yearBadge").textContent = selectedYear ? selectedYear + " 사업연도" : "전체 사업연도";
  const messages = [storageError, shared && programs.some(p => p.local) ?
    "이 브라우저의 기존 프로그램은 ‘로컬’로 표시됩니다. 파트와 운영 유형을 지정하고 저장하면 팀에 공유됩니다." : "", programs.some(p => p.id.startsWith("sample-")) ?
    "예시 데이터가 포함되어 있습니다. 프로그램 목록에서 수정하거나 삭제할 수 있습니다." : ""].filter(Boolean);
  $("notice").textContent = messages.join(" ");
  $("notice").hidden = !messages.length;

  const items = filteredPrograms();
  const budget = sum(items, "budget");
  const spent = sum(items, "spent");
  const tracked = items.filter(p => p.target > 0);
  const reached = tracked.filter(p => status(p) === "ok").length;
  const cards = [
    ["▤", "프로그램", number(items.length) + "개", new Set(items.map(p => p.fund)).size + "개 재원"],
    ["₩", "총 편성액", won(budget), "잔액 " + won(budget - spent)],
    ["↗", "예산 집행률", pct(spent, budget), "집행액 " + won(spent)],
    ["◎", "목표 달성 프로그램", pct(reached, tracked.length), tracked.length ? reached + "개 달성 / " + tracked.length + "개 목표 설정" : "목표 설정 프로그램 없음"]
  ];
  $("stats").innerHTML = cards.map(([icon, label, value, detail]) =>
    `<article class="card"><span class="symbol" aria-hidden="true">${icon}</span><p>${label}</p><strong>${value}</strong><small>${detail}</small></article>`
  ).join("");
  $("fundBars").innerHTML = groups(items).map(g =>
    `<div><div class="barlabel"><b>${esc(g.fund)}</b><span>${won(g.spent)} / ${won(g.budget)} · ${pct(g.spent, g.budget)}</span></div><div class="track"><div class="fill" style="width:${g.budget ? Math.min(100, g.spent / g.budget * 100) : 0}%"></div></div></div>`
  ).join("") || '<p class="empty">표시할 재원이 없습니다.</p>';

  const pending = tracked.filter(p => status(p) === "pending").sort((a,b) => a.actual / a.target - b.actual / b.target);
  $("pendingCount").textContent = pending.length > 4 ? "전체 " + pending.length + "개 중 하위 4개" : pending.length + "개";
  $("pending").innerHTML = pending.slice(0, 4).map(p =>
    `<button type="button" data-edit="${esc(p.id)}"><span>${esc(p.name)}</span><strong>${pct(p.actual, p.target)}</strong></button>`
  ).join("") || '<p class="empty">목표 미달 프로그램이 없습니다.</p>';
  $("count").textContent = "· " + items.length + "개";
  $("rows").innerHTML = items.map(p =>
    `<tr><td><button class="edit" type="button" data-edit="${esc(p.id)}">${esc(p.name)}</button><br><small class="hint">${p.year}${p.owner ? " · " + esc(p.owner) : ""}${p.local ? " · 로컬" : ""}</small></td><td>${esc(p.part || "미분류")}</td><td>${esc(p.lead || "미분류")}${p.org ? "<br><small class=hint>" + esc(p.org) + "</small>" : ""}</td><td>${esc(p.fund)}</td><td>${won(p.budget)}</td><td>${won(p.spent)}</td><td>${pct(p.spent,p.budget)}</td><td>${number(p.target)} / ${number(p.actual)} ${esc(p.unit)}</td><td>${pct(p.actual,p.target)}</td><td><span class="status ${status(p)}">${labels[status(p)]}</span></td></tr>`
  ).join("") || '<tr><td colspan="10">조건에 맞는 프로그램이 없습니다.</td></tr>';
  $("fundRows").innerHTML = groups(fundingPrograms()).map(g =>
    `<tr><td><button class="edit" data-fund="${esc(g.fund)}">${esc(g.fund)}</button></td><td>${g.items.length}개</td><td>${won(g.budget)}</td><td>${won(g.spent)}</td><td>${won(g.budget-g.spent)}</td><td>${pct(g.spent,g.budget)}</td><td>${g.reached} / ${g.tracked}개</td></tr>`
  ).join("") || '<tr><td colspan="7">등록된 프로그램이 없습니다.</td></tr>';
}
function setView(next) {
  view = next;
  const heading = {
    dashboard: ["대시보드", "CTL 운영 대시보드", "재원별 프로그램의 예산 집행과 목표 달성 현황을 확인하세요."],
    programs: ["프로그램", "프로그램 관리", "프로그램을 등록하고 편성액, 집행액 및 성과를 업데이트하세요."],
    funding: ["재원별 현황", "재원별 현황", "재원별 예산 잔액과 목표 달성 프로그램 수를 확인하세요."]
  }[next];
  $("crumb").textContent = "운영관리 / " + heading[0];
  $("title").textContent = heading[1];
  $("subtitle").textContent = heading[2];
  $("stats").hidden = $("overview").hidden = next !== "dashboard";
  $("programPanel").hidden = next === "funding";
  $("fundPanel").hidden = next !== "funding";
  document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === next));
  render();
}
function openEdit(id) {
  editing = programs.find(p => p.id === id);
  const record = editing || { name: "", fund: $("fund").value, year: Number(view === "funding" ? $("fundYear").value : $("year").value) || thisYear, part: $(view === "funding" ? "fundPart" : "part").value, lead: $(view === "funding" ? "fundLead" : "lead").value, org: "", budget: 0, spent: 0, target: 0, actual: 0, unit: "", owner: accountName };
  for (const input of $("form").querySelectorAll("[name]")) input.value = record[input.name] ?? "";
  $("dialogTitle").textContent = editing ? "프로그램 수정" : "프로그램 등록";
  $("remove").hidden = !editing;
  $("formError").hidden = true;
  $("dialog").showModal();
}
function setFormError(message) {
  $("formError").textContent = message;
  $("formError").hidden = false;
}
function clearLegacy(id) {
  legacy = legacy.filter(p => p.id !== id);
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(stored)) localStorage.setItem(key, JSON.stringify(stored.filter(p => p.id !== id)));
  } catch {}
}
async function persist(record, deleted = false) {
  if (saving) return false;
  saving = true;
  const buttons = $("form").querySelectorAll("button");
  buttons.forEach(button => { button.disabled = true; });
  try {
    if (shared && !(deleted && record.local)) {
      const response = await fetch("/api/programs/" + encodeURIComponent(record.id), {
        method: deleted ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json", ...(record.version ?
          { "If-Match": record.version } : { "If-None-Match": "*" }) },
        body: deleted ? undefined : JSON.stringify(record)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      record = result;
    }
    const next = programs.filter(p => p.id !== record.id);
    if (!deleted) {
      const position = programs.findIndex(p => p.id === record.id);
      next.splice(position === -1 ? next.length : position, 0, record);
    }
    if (shared) clearLegacy(record.id);
    else localStorage.setItem(key, JSON.stringify(next));
    programs = next;
    storageError = "";
    $("dialog").close();
    return true;
  } catch (error) {
    setFormError(shared ? error.message || "공유 저장에 실패했습니다." : "브라우저에 저장할 수 없습니다.");
    return false;
  } finally {
    saving = false;
    buttons.forEach(button => { button.disabled = false; });
  }
}
$("dialog").addEventListener("cancel", event => { if (saving) event.preventDefault(); });
$("form").addEventListener("submit", async event => {
  event.preventDefault();
  const p = Object.fromEntries([...new FormData(event.currentTarget)].map(([key, value]) => [key, value.trim()]));
  if (!p.name || !p.fund || !p.unit || !p.owner || !parts.includes(p.part) || !leads.includes(p.lead)) {
    setFormError("프로그램명, 재원, 성과 단위, 담당자, 파트와 운영 유형을 입력하세요.");
    return;
  }
  for (const field of ["year", "budget", "spent", "target", "actual"]) p[field] = Number(p[field]);
  p.id = editing?.id ?? crypto.randomUUID();
  p.version = editing?.version;
  if (await persist(p)) {
    if (view === "funding") {
      $("year").value = $("fundYear").value;
      $("query").value = "";
      $("statusFilter").value = "";
    }
    for (const [id, value] of [["year", p.year], ["fund", p.fund], ["part", p.part], ["lead", p.lead]]) {
      if ($(id).value && $(id).value !== String(value)) $(id).value = "";
    }
    if (!editing) { $("query").value = ""; $("statusFilter").value = ""; }
    setView(view === "funding" ? "programs" : view);
  }
});
$("remove").onclick = async () => {
  if (editing && confirm(editing.name + " 프로그램을 삭제할까요?") &&
      await persist(editing, true)) render();
};
$("add").onclick = () => openEdit();
$("close").onclick = $("cancel").onclick = () => $("dialog").close();
document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.view) setView(button.dataset.view);
  if (button.dataset.edit) openEdit(button.dataset.edit);
  if (button.dataset.fund) {
    $("fund").value = button.dataset.fund;
    $("year").value = $("fundYear").value;
    $("part").value = $("fundPart").value;
    $("lead").value = $("fundLead").value;
    $("query").value = "";
    $("statusFilter").value = "";
    setView("programs");
  }
});
$("query").addEventListener("input", render);
for (const id of ["year", "fund", "part", "lead", "statusFilter", "fundYear", "fundPart", "fundLead"]) $(id).addEventListener("change", render);
function csvCell(value) {
  let raw = String(value);
  if (typeof value === "string" && /^[\s]*[=+@-]|^[\t\r\n]/.test(raw)) raw = "'" + raw;
  return '"' + raw.replaceAll('"','""') + '"';
}
$("export").onclick = () => {
  const rows = [["사업연도","프로그램","파트","운영 유형","주관 학과·부서명","재원","담당자","편성액","집행액","잔액","집행률","목표값","실적값","단위","달성률","상태"]];
  const items = view === "funding" ? fundingPrograms() : filteredPrograms();
  for (const p of items) rows.push([p.year,p.name,p.part,p.lead,p.org,p.fund,p.owner,p.budget,p.spent,p.budget-p.spent,pct(p.spent,p.budget),p.target,p.actual,p.unit,pct(p.actual,p.target),labels[status(p)]]);
  const file = new Blob(["\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "CTL-프로그램현황.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
async function initialize() {
  try {
    const response = await fetch("/api/programs", { headers: { Accept: "application/json" } });
    if (response.status === 404 && !response.headers.get("Content-Type")?.includes("application/json")) {
      $("storageMode").textContent = "데이터는 이 브라우저에 저장됩니다.";
    } else {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      shared = true;
      accountName = (result.name || "").slice(0, 80);
      const ids = new Set(result.programs.map(p => p.id));
      const local = legacy.filter(p => !ids.has(p.id))
        .map(p => ({ ...p, local: true }));
      programs = [...result.programs, ...local];
      $("storageMode").textContent = "프로그램은 CTL 팀과 공유됩니다.";
    }
    $("add").disabled = false;
  } catch {
    programs = [];
    $("storageMode").textContent = "공유 저장소 연결 실패";
    storageError = "공유 저장소를 불러오지 못했습니다. 사이트에 로그인한 뒤 새로고침하세요.";
  }
  render();
}
initialize();
