/** @OnlyCurrentDoc */
function setupCtlWebApp() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!sheet) throw new Error('CTL 시트의 확장 프로그램 메뉴에서 연 프로젝트에서 실행하세요.');
  PropertiesService.getScriptProperties().setProperty('CTL_BOOK_ID', sheet.getId());
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('CTL 예산·성과 대시보드');
}

function readCtlDashboard() {
  const id = PropertiesService.getScriptProperties().getProperty('CTL_BOOK_ID');
  if (!id) throw new Error('편집기에서 setupCtlWebApp을 한 번 실행해 주세요.');
  const book = SpreadsheetApp.openById(id);
  const parts = ['교수파트', '학습파트', '원격파트'];
  const programs = [];
  for (const part of parts) {
    const tab = book.getSheetByName(part);
    if (!tab) throw new Error(part + ' 탭을 찾을 수 없습니다. 탭 이름을 확인하세요.');
    const end = Math.min(503, tab.getLastRow());
    if (end < 5) continue;
    const rows = tab.getRange(5, 1, end - 4, 26).getValues();
    rows.forEach((r, index) => {
      if (String(r[1]).trim()) programs.push({
        part: part, year: String(r[0]), name: String(r[1]), fund: String(r[2]), status: String(r[6]),
        budget: Number(r[7]) || 0, spent: Number(r[8]) || 0, category: String(r[17]),
        indicator: String(r[18]), detail: String(r[19]), unit: String(r[20]),
        prior: r[21] === '' ? null : Number(r[21]),
        target: r[22] === '' ? null : Number(r[22]),
        actual: r[23] === '' ? null : Number(r[23]),
        url: book.getUrl() + '#gid=' + tab.getSheetId() + '&range=B' + (index + 5)
      });
    });
  }
  return { programs: programs, url: book.getUrl() };
}
