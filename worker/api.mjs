const prefix = "programs/";
const parts = ["교원파트", "학습파트", "원격파트"];
const leads = ["학과주도", "부서주도", "기타"];
const textLimits = { name: 100, fund: 60, unit: 20, owner: 80, org: 80 };
const maxNumbers = { budget: 999999999999, spent: 999999999999, target: 999999999, actual: 999999999 };
const counts = ["applicants", "completions"];
const hours = ["requestedHours", "operatingHours"];
const teacherTypes = ["산학전담", "강의전담", "교육전담", "일반전임교원", "직원"];
const required = ["name", "fund", "unit", "owner"];

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function validateOperations(record) {
  return counts.every(field => record[field] == null ||
    (Number.isInteger(record[field]) && record[field] >= 0 && record[field] <= 999999999)) &&
    hours.every(field => record[field] == null ||
      (Number.isFinite(record[field]) && record[field] >= 0 && record[field] <= 999999)) &&
    (record.teachers === undefined || (Array.isArray(record.teachers) && record.teachers.length <= 30 &&
      record.teachers.every(teacher => teacher && typeof teacher.name === "string" &&
        teacher.name.trim().length > 0 && teacher.name.trim().length <= 80 && teacherTypes.includes(teacher.type) &&
        (teacher.affiliation === undefined || (typeof teacher.affiliation === "string" && teacher.affiliation.trim().length <= 80)))));
}
const optionalText = (value, limit) => value === undefined ||
  (typeof value === "string" && value.trim().length <= limit);
function validateAdditionalIndicators(indicators) {
  return indicators === undefined || (Array.isArray(indicators) && indicators.length <= 15 &&
    indicators.every(i => i && typeof i.indicator === "string" && i.indicator.trim() &&
      typeof i.unit === "string" && i.unit.trim() && optionalText(i.indicator, 100) &&
      optionalText(i.unit, 20) && optionalText(i.id, 80) && optionalText(i.indicatorCategory, 60) && optionalText(i.indicatorDetail, 120) && optionalText(i.indicatorNote, 500) &&
      [i.target, i.actual].every(value => Number.isFinite(value) && value >= 0 && value <= 999999999) &&
      (i.priorActual == null || (Number.isFinite(i.priorActual) && i.priorActual >= 0 && i.priorActual <= 999999999))));
}
function validateMonitoring(record) {
  return validateAdditionalIndicators(record.extraIndicators) && (record.completion === undefined || ["", "done", "pending", "in_progress"].includes(record.completion)) &&
    optionalText(record.indicator, 100) && optionalText(record.indicatorCategory, 60) && optionalText(record.indicatorDetail, 120) && optionalText(record.indicatorNote, 500) &&
    (record.priorActual == null || (Number.isFinite(record.priorActual) && record.priorActual >= 0 && record.priorActual <= 999999999)) &&
    (record.expenses === undefined || (Array.isArray(record.expenses) && record.expenses.length <= 30 &&
      record.expenses.every(expense => expense && typeof expense.name === "string" &&
        expense.name.trim().length > 0 && expense.name.trim().length <= 100 &&
        Number.isSafeInteger(expense.amount) && expense.amount >= 0 && expense.amount <= 999999999999)));
}
function validate(record) {
  if (!record || !parts.includes(record.part) || !leads.includes(record.lead) ||
      !Number.isInteger(record.year) || record.year < 1900 || record.year > 9999) return false;
  return Object.entries(textLimits).every(([field, max]) =>
    typeof record[field] === "string" && record[field].trim().length <= max &&
    (!required.includes(field) || record[field].trim().length > 0)) &&
    Object.entries(maxNumbers).every(([field, max]) =>
      Number.isFinite(record[field]) && record[field] >= 0 && record[field] <= max) &&
    Number.isInteger(record.budget) && Number.isInteger(record.spent) && validateOperations(record) && validateMonitoring(record);
}

export async function api(request, env, path) {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (!userId) return json({ error: "ChatGPT 계정으로 로그인하세요." }, 401);

  if (path === "/api/programs" && request.method === "GET") {
    const programs = [];
    let cursor;
    do {
      const page = await env.BUCKET.list({ prefix, cursor, limit: 100, include: ["customMetadata"] });
      const active = page.objects.filter(object => object.customMetadata?.deleted !== "1");
      for (let offset = 0; offset < active.length; offset += 20) {
        const objects = await Promise.all(active.slice(offset, offset + 20).map(object => env.BUCKET.get(object.key)));
        for (const object of objects) {
          if (object && object.customMetadata?.deleted !== "1") programs.push({ ...await object.json(), version: object.etag });
        }
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    const encoded = request.headers.get("oai-authenticated-user-full-name");
    let name = request.headers.get("oai-authenticated-user-email") || "";
    if (encoded) {
      try {
        name = request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8"
          ? decodeURIComponent(encoded) : encoded;
      } catch {}
    }
    return json({ programs, name });
  }

  const match = /^\/api\/programs\/([a-z0-9-]{1,80})$/.exec(path);
  if (!match || !["PUT", "DELETE"].includes(request.method)) return json({ error: "요청을 찾을 수 없습니다." }, 404);
  const id = match[1];
  const version = request.headers.get("If-Match");
  const creating = request.headers.get("If-None-Match") === "*";
  if ((!creating && !/^[a-f0-9]{32}$/.test(version || "")) || (creating && request.method === "DELETE")) {
    return json({ error: "프로그램 버전이 필요합니다." }, 400);
  }
  const key = prefix + id;
  const current = creating ? null : await env.BUCKET.head(key);
  if (!creating && (!current || current.customMetadata?.deleted === "1" || current.etag !== version)) {
    return json({ error: "다른 담당자가 이 프로그램을 변경했습니다. 화면을 새로고침한 뒤 다시 시도하세요." }, 409);
  }
  let record;
  const deleted = request.method === "DELETE";
  if (!deleted) {
    const body = await request.text();
    if (body.length > 96000) return json({ error: "입력 내용이 너무 깁니다." }, 413);
    let input;
    try { input = JSON.parse(body); } catch { return json({ error: "입력 형식이 올바르지 않습니다." }, 400); }
    if (!validate(input)) return json({ error: "파트, 운영 유형, 담당자와 프로그램 항목을 확인하세요." }, 400);
    if (input.lead === "학과주도" && !input.org.trim()) return json({ error: "주관 학과명을 입력하세요." }, 400);
    record = { id, part: input.part, lead: input.lead, year: input.year, updatedAt: new Date().toISOString() };
    for (const field of Object.keys(textLimits)) record[field] = input[field].trim();
    for (const field of Object.keys(maxNumbers)) record[field] = input[field];
    for (const field of [...counts, ...hours]) record[field] = input[field] ?? null;
    record.completion = input.completion || "in_progress";
    record.extraIndicators = (input.extraIndicators ?? []).map(i => ({
      id: i.id, indicator: i.indicator.trim(), unit: i.unit.trim(), indicatorCategory: i.indicatorCategory?.trim() ?? "",
      indicatorDetail: i.indicatorDetail?.trim() ?? "", indicatorNote: i.indicatorNote?.trim() ?? "", target: i.target, actual: i.actual, priorActual: i.priorActual ?? null
    }));
    record.indicator = input.indicator?.trim() ?? "";
    record.indicatorCategory = input.indicatorCategory?.trim() ?? "";
    record.indicatorNote = input.indicatorNote?.trim() ?? "";
    record.indicatorDetail = input.indicatorDetail?.trim() ?? "";
    record.priorActual = input.priorActual ?? null;
    record.expenses = (input.expenses ?? []).map(({ name, amount }) => ({ name: name.trim(), amount }));
    record.teachers = (input.teachers ?? []).map(({ name, type, affiliation }) => ({ name: name.trim(), type, affiliation: affiliation?.trim() ?? "" }));
  }
  const stored = await env.BUCKET.put(key, JSON.stringify(record ?? { id }), {
    onlyIf: creating ? { etagDoesNotMatch: "*" } : { etagMatches: version },
    customMetadata: { deleted: deleted ? "1" : "0" }
  });
  if (!stored) return json({ error: "다른 담당자가 이 프로그램을 변경했습니다. 화면을 새로고침한 뒤 다시 시도하세요." }, 409);
  return json(deleted ? { id } : { ...record, version: stored.etag });
}
