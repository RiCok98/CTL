const CTL_PARTS = ['교수파트', '학습파트', '원격파트'];
const CTL_FIELDS = [
  [1, '사업연도'], [2, '프로그램명'], [3, '사업재원'], [4, '운영 유형'],
  [5, '주관 학과·부서'], [6, '담당자'], [7, '완료 여부'], [8, '예산 편성액 (원)'],
  [13, '신청인원 (명)'], [14, '신청 운영시간'], [15, '이수인원 (명)'], [16, '실제 운영시간'],
  [17, '운영인력 (이름 / 유형 / 소속)'], [18, '지표 구분'], [19, '지표명'],
  [20, '세부요소 / 산출항목'], [21, '단위'], [22, '전년도 실적'], [23, '당해연도 목표'], [24, '당해연도 실적']
];
const CTL_CHOICES = {
  3: ['대학혁신', '대학AID', '대학앵커', '대학교비'],
  4: ['학과주도', '부서주도', '기타'],
  7: ['완료 (O)', '미완료 (X)']
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('CTL 프로그램')
    .addItem('선택한 프로그램 상세 열기·만들기', 'openCtlProgram')
    .addToUi();
}

function openCtlProgram() {
  const book = SpreadsheetApp.getActive();
  const part = book.getActiveSheet();
  const row = part.getActiveCell().getRow();
  const ui = SpreadsheetApp.getUi();
  if (!CTL_PARTS.includes(part.getName()) || row < 5 || row > 503) {
    ui.alert('교수·학습·원격 파트 탭의 5~503행에서 프로그램 행을 선택하세요.');
    return;
  }

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) {
    ui.alert('다른 담당자가 상세 탭을 만드는 중입니다. 잠시 후 다시 시도하세요.');
    return;
  }

  let detail;
  let linked = false;
  try {
    const linkCell = part.getRange(row, 27);
    const savedLink = linkCell.getRichTextValue()?.getLinkUrl();
    const sheetId = savedLink?.match(/#gid=(\d+)$/)?.[1];
    if (sheetId) {
      const existing = book.getSheets().find(sheet => String(sheet.getSheetId()) === sheetId);
      if (existing) book.setActiveSheet(existing);
      else ui.alert('연결된 상세 탭을 찾을 수 없습니다. 삭제된 탭을 복구하거나 새 행에서 시작하세요.');
      return;
    }

    const overview = part.getRange(row, 1, 1, 26);
    const values = overview.getValues()[0];
    const name = String(values[1]).trim();
    if (!name) {
      ui.alert('선택한 행의 프로그램명을 먼저 입력하세요.');
      return;
    }

    const stem = (part.getName() + ' · ' + name).replace(/[\[\]*?/:\\]/g, '-').slice(0, 85);
    let title = stem;
    for (let i = 2; book.getSheetByName(title); i++) title = stem + ' (' + i + ')';
    detail = book.insertSheet(title);

    detail.getRange('A1:E1').merge().setValue(name).setFontSize(16);
    detail.getRange('A1:E1').setBackground('#123d35').setFontColor('#ffffff').setFontWeight('bold');
    detail.getRange('A2').setRichTextValue(ctlLink('← 파트 목록', book.getUrl() + '#gid=' + part.getSheetId()));
    detail.getRange('A3:B3').setValues([['프로그램 정보', '입력값']]);
    detail.getRange('D3:F3').setValues([['지출일', '지출 항목', '금액 (원)']]);
    for (const range of ['A3:B3', 'D3:F3']) {
      detail.getRange(range).setBackground('#226650').setFontColor('#ffffff').setFontWeight('bold');
    }
    const fields = CTL_FIELDS.map(([column, label]) => [label, ctlLiteral(values[column - 1])]);
    detail.getRange(4, 1, fields.length, 2).setValues(fields);
    detail.getRange(4, 2, fields.length, 1).setBackground('#eaf4ec').setWrap(true);
    CTL_FIELDS.forEach(([column], index) => {
      if (CTL_CHOICES[column]) {
        detail.getRange(index + 4, 2).setDataValidation(SpreadsheetApp.newDataValidation()
          .requireValueInList(CTL_CHOICES[column], true).setAllowInvalid(false).build());
      }
    });
    detail.getRange('H3:I5').setValues([
      ['누적 지출액', '=SUM(F4:F)'],
      ['예산 잔액', '=IF(ISNUMBER(B11),B11-I3,"")'],
      ['이전 세부 지출 메모', ctlLiteral(values[9])]
    ]);
    detail.getRange('I3:I4').setNumberFormat('#,##0');
    detail.getRange('I5').setWrap(true);
    const expenseRows = detail.getMaxRows() - 3;
    detail.getRange(4, 4, expenseRows).setNumberFormat('yyyy-mm-dd');
    detail.getRange(4, 6, expenseRows).setNumberFormat('#,##0');
    detail.getRange(4, 6, expenseRows).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).build());
    if (typeof values[8] === 'number' && values[8] !== 0) {
      detail.getRange('E4:F4').setValues([['상세 탭 생성 전 누적 지출', values[8]]]);
    }
    [200, 285, 24, 108, 260, 110, 24, 145, 240].forEach((width, index) => detail.setColumnWidth(index + 1, width));
    detail.setFrozenRows(3);
    detail.setHiddenGridlines(true);

    const reference = "'" + title.replace(/'/g, "''") + "'!";
    const summary = [...overview.getFormulas()[0]];
    values.forEach((value, index) => { if (!summary[index]) summary[index] = ctlLiteral(value); });
    CTL_FIELDS.forEach(([column], index) => {
      const cell = reference + 'B' + (index + 4);
      summary[column - 1] = '=IF(ISBLANK(' + cell + '),"",' + cell + ')';
    });
    summary[8] = '=' + reference + 'I3';
    summary[9] = '=IF(ISBLANK(' + reference + 'I5),"",' + reference + 'I5)';
    linked = true;
    overview.clearDataValidations().setValues([summary]);
    part.getRange('AA4').setValue('프로그램 상세');
    part.setColumnWidth(27, 130);
    linkCell.setRichTextValue(ctlLink('상세 열기', book.getUrl() + '#gid=' + detail.getSheetId()));
    book.setActiveSheet(detail);
  } catch (error) {
    if (detail && !linked) book.deleteSheet(detail);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function ctlLink(label, url) {
  return SpreadsheetApp.newRichTextValue().setText(label).setLinkUrl(url).build();
}

function ctlLiteral(value) {
  return typeof value === 'string' && value.startsWith('=') ? "'" + value : value;
}
