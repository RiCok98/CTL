"use strict";

(() => {
  const byId = id => document.getElementById(id);
  const configKey = "ctl-google-sheet-config";
  const tabNames = ["교수파트", "학습파트", "원격파트"];
  const labels = ["교원파트", "학습파트", "원격파트"];
  const quoteTab = name => "'" + name.replaceAll("'", "''") + "'";
  let bookId, token, active;
  let records = [];
  let busy = false;
  let loading = false;
  let gis;

  function message(id, value) {
    byId(id).textContent = value;
  }

  function sheetsId(value) {
    const input = value.trim();
    const match = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(input);
    const id = match?.[1] ?? input;
    if (!/^[\w-]{15,120}$/.test(id)) throw new Error("스프레드시트 주소 또는 ID를 확인하세요.");
    return id;
  }

  async function googleApi(path = "", query = {}, body, method = "GET") {
    const endpoint = "https://sheets.googleapis.com/v4/spreadsheets/" + bookId + path;
    const response = await fetch(endpoint + "?" + new URLSearchParams(query), {
      method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (response.status === 401) throw new Error("Google 연결이 만료되었습니다. 다시 연결하세요.");
    if (response.status === 403) {
      const payload = await response.json().catch(() => ({}));
      const reasons = [...(payload.error?.details ?? []), ...(payload.error?.errors ?? [])]
        .map(detail => detail.reason);
      if (reasons.some(reason => ["SERVICE_DISABLED", "accessNotConfigured"].includes(reason))) {
        throw new Error("OAuth 클라이언트 ID를 만든 Google Cloud 프로젝트에서 Google Sheets API를 활성화한 뒤 다시 연결하세요.");
      }
      if (reasons.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT") || reasons.includes("insufficientPermissions") ||
          /insufficient authentication scopes/i.test(payload.error?.message ?? "")) {
        throw new Error("Google 연결을 다시 누르고 권한 화면에서 스프레드시트 액세스를 허용하세요.");
      }
      if (reasons.includes("ORG_RESTRICTION_VIOLATION") || reasons.includes("SECURITY_POLICY_VIOLATED")) {
        throw new Error("Google 조직 정책에서 Sheets API 접근을 차단했습니다. 학교 관리자에게 확인하세요.");
      }
      throw new Error(method === "GET"
        ? "연결한 Google 계정으로 이 시트를 직접 열 수 있는지 확인하세요. 열 수 있다면 Google Cloud 프로젝트의 Sheets API 사용 설정도 확인하세요."
        : "시트 또는 지출 범위를 편집할 권한이 없습니다. 같은 Google 계정의 편집 권한과 범위 보호 설정을 확인하세요.");
    }
    if (!response.ok) throw new Error("Google 시트 요청이 실패했습니다 (" + response.status + ").");
    return response.json();
  }

  function parseRows(metadata, result) {
    const tabs = metadata.sheets.map(sheet => sheet.properties);
    const links = new Map();
    for (const sheet of metadata.sheets) {
      for (const grid of sheet.data ?? []) {
        (grid.rowData ?? []).forEach((row, i) => {
          const cell = row.values?.[0];
          const url = cell?.hyperlink ?? cell?.textFormatRuns?.find(run => run.format?.link?.uri)?.format.link.uri;
          const match = url?.match(/#gid=(\d+)/);
          if (match && url.startsWith("https://docs.google.com/spreadsheets/d/" + bookId + "/")) {
            links.set(sheet.properties.title + ":" + (grid.startRow + i + 1), Number(match[1]));
          }
        });
      }
    }
    return result.valueRanges.flatMap((range, partIndex) => {
      const title = tabNames[partIndex];
      const parent = tabs.find(tab => tab.title === title);
      return (range.values ?? []).flatMap((r, index) => {
        if (typeof r[1] !== "string" || !r[1].trim() || r[1] === "#REF!") return [];
        const row = index + 5;
        const roomId = links.get(title + ":" + row);
        const room = tabs.find(tab => !tabNames.includes(tab.title) &&
          (roomId !== undefined ? tab.sheetId === roomId : tab.title === r[26]));
        return [{
          id: "sheet-" + parent.sheetId + "-" + row,
          name: r[1], year: Number(r[0]) || 0, fund: String(r[2] ?? ""), part: labels[partIndex],
          lead: String(r[3] ?? ""), org: String(r[4] ?? ""), owner: String(r[5] ?? ""),
          completion: r[6] === "완료 (O)" ? "done" : r[6] === "미완료 (X)" ? "pending" : "",
          budget: Number(r[7]) || 0, spent: Number(r[8]) || 0,
          applicants: r[12] ?? null, requestedHours: r[13] ?? null, completions: r[14] ?? null, operatingHours: r[15] ?? null,
          indicatorCategory: String(r[17] ?? ""), indicator: String(r[18] ?? ""), indicatorDetail: String(r[19] ?? ""),
          unit: String(r[20] ?? ""), priorActual: r[21] === "" || r[21] === undefined ? null : Number(r[21]),
          target: Number(r[22]) || 0, actual: Number(r[23]) || 0,
          room, parent, row
        }];
      });
    });
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    message("sheetsStatus", "구글 시트에서 불러오는 중…");
    try {
      const rangeQuery = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE" });
      const metadataQuery = new URLSearchParams({
        fields: "sheets(properties(sheetId,title),data(startRow,rowData(values(hyperlink,textFormatRuns))))"
      });
      for (const name of tabNames) {
        rangeQuery.append("ranges", quoteTab(name) + "!A5:AA503");
        metadataQuery.append("ranges", quoteTab(name) + "!AA5:AA503");
      }
      const [values, tabs, metadata] = await Promise.all([
        googleApi("/values:batchGet", rangeQuery),
        googleApi("", { fields: "sheets(properties(sheetId,title))" }),
        googleApi("", metadataQuery)
      ]);
      const partsMetadata = new Map(metadata.sheets.map(sheet => [sheet.properties.sheetId, sheet.data]));
      tabs.sheets.forEach(sheet => { sheet.data = partsMetadata.get(sheet.properties.sheetId); });
      records = parseRows(tabs, values);
      window.ctlSheetActive = true;
      programs = records;
      storageError = "";
      byId("add").hidden = true;
      byId("sheetsRefresh").hidden = false;
      byId("storageMode").textContent = "구글 스프레드시트 공용 데이터";
      byId("sheetsOpen").textContent = "구글 시트 연결됨";
      render();
      message("sheetsStatus", records.length + "개 프로그램을 불러왔습니다.");
    } catch (error) {
      message("sheetsStatus", error.message);
      throw error;
    } finally {
      loading = false;
    }
  }

  function loadGoogle() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (!gis) gis = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = resolve;
      script.onerror = () => { gis = undefined; reject(new Error("Google 계정 연결 화면을 불러오지 못했습니다.")); };
      document.head.append(script);
    });
    return gis;
  }

  byId("sheetsOpen").onclick = () => {
    byId("sheetsDialog").showModal();
    loadGoogle().catch(error => message("sheetsStatus", error.message));
  };
  byId("sheetsClose").onclick = () => byId("sheetsDialog").close();
  byId("sheetsRefresh").onclick = () => refresh().catch(() => {});
  try {
    const config = JSON.parse(localStorage.getItem(configKey));
    byId("sheetsBook").value = config?.book ?? "";
    byId("sheetsClient").value = config?.client ?? "";
  } catch {}

  byId("sheetsForm").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const id = sheetsId(byId("sheetsBook").value);
      const client = byId("sheetsClient").value.trim();
      if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(client)) throw new Error("OAuth 웹 클라이언트 ID를 확인하세요.");
      await loadGoogle();
      window.google.accounts.oauth2.initTokenClient({
        client_id: client,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        callback: async response => {
          if (!response.access_token) {
            message("sheetsStatus", "Google 계정에서 스프레드시트 접근을 허용했는지 확인하세요.");
            return;
          }
          const previous = { bookId, token };
          bookId = id;
          token = response.access_token;
          try {
            await refresh();
            try { localStorage.setItem(configKey, JSON.stringify({ book: id, client })); } catch {}
          } catch {
            ({ bookId, token } = previous);
          }
        },
        error_callback: () => message("sheetsStatus", "Google 로그인 창을 열지 못했거나 닫았습니다.")
      }).requestAccessToken({ prompt: "" });
    } catch (error) {
      message("sheetsStatus", error.message);
    }
  });

  function displayExpenses(rows = []) {
    byId("sheetsExpenses").replaceChildren(...rows.filter(row => row.some(cell => cell !== "")).map(row => {
      const tr = document.createElement("tr");
      for (let i = 0; i < 3; i++) {
        const td = document.createElement("td");
        td.textContent = row[i] ?? "";
        tr.append(td);
      }
      return tr;
    }));
  }

  async function getExpenses(record) {
    if (!record.room) return;
    const path = "/values/" + encodeURIComponent(quoteTab(record.room.title) + "!D4:F");
    const result = await googleApi(path);
    if (active === record) displayExpenses(result.values);
  }

  window.ctlSheetProgram = id => {
    if (!window.ctlSheetActive) return false;
    active = records.find(record => record.id === id);
    if (!active) return true;
    byId("sheetsProgramTitle").textContent = active.name;
    byId("sheetsProgramInfo").textContent = active.part + " · " + active.fund + " · 예산 " + won(active.budget) + " · 집행 " + won(active.spent);
    byId("sheetsProgramLink").href = "https://docs.google.com/spreadsheets/d/" + bookId + "/edit#gid=" +
      (active.room?.sheetId ?? active.parent.sheetId) + (active.room ? "" : "&range=B" + active.row);
    byId("sheetsExpenseForm").hidden = !active.room;
    byId("sheetsExpenseForm").reset();
    displayExpenses();
    message("sheetsProgramStatus", active.room ? "" : "구글 시트에서 프로그램 상세 탭을 만들면 여기에서 지출을 추가할 수 있습니다.");
    byId("sheetsProgram").showModal();
    getExpenses(active).catch(error => message("sheetsProgramStatus", error.message));
    return true;
  };

  byId("sheetsProgramClose").onclick = () => { if (!busy) byId("sheetsProgram").close(); };
  byId("sheetsProgram").addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  byId("sheetsExpenseForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !active?.room) return;
    const record = active;
    const form = event.currentTarget;
    const values = new FormData(form);
    const item = String(values.get("item") ?? "").trim();
    const amount = Number(values.get("amount"));
    const date = String(values.get("date") ?? "");
    if (!item || !Number.isSafeInteger(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      message("sheetsProgramStatus", "지출일, 항목 및 원 단위 금액을 확인하세요.");
      return;
    }
    busy = true;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    message("sheetsProgramStatus", "지출을 저장하는 중…");
    try {
      const headerRange = encodeURIComponent(quoteTab(record.room.title) + "!D3:F3");
      const header = await googleApi("/values/" + headerRange);
      if (header.values?.[0]?.join("|") !== "지출일|지출 항목|금액 (원)") {
        throw new Error("상세 탭에서 지출 표를 찾을 수 없습니다.");
      }
      const dateSerial = (Date.parse(date + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 86400000;
      // Append a new row by stable sheet ID without shifting the detail form.
      await googleApi(":batchUpdate", {}, { requests: [{ appendCells: {
        sheetId: record.room.sheetId,
        rows: [{ values: [{}, {}, {},
          { userEnteredValue: { numberValue: dateSerial }, userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } },
          { userEnteredValue: { stringValue: item } },
          { userEnteredValue: { numberValue: amount }, userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } }
        ] }],
        fields: "userEnteredValue,userEnteredFormat"
      } }] }, "POST");
      form.reset();
      message("sheetsProgramStatus", "지출을 저장했습니다.");
      try {
        await Promise.all([getExpenses(record), refresh()]);
        const updated = records.find(p => p.room?.sheetId === record.room.sheetId);
        if (updated) byId("sheetsProgramInfo").textContent = updated.part + " · " + updated.fund + " · 예산 " + won(updated.budget) + " · 집행 " + won(updated.spent);
      } catch {
        message("sheetsProgramStatus", "지출은 저장되었습니다. 연결 메뉴에서 최신 기록을 다시 불러오세요.");
      }
    } catch (error) {
      message("sheetsProgramStatus", error.message + " 같은 지출을 다시 입력하기 전에 시트에서 저장 여부를 확인하세요.");
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
})();
