ㄏation_type', 'photo', 'coordinates', 'created_at'
  ];

if (!sheet) {
  sheet = ss.insertSheet(SHEET_NAME);
  sheet.appendRow(targetHeaders);
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();
  return sheet;
}

// Read first row (up to 50 columns to be safe)
const currentHeaders = sheet.getRange(1, 1, 1, 50).getValues()[0];
const currentHeadersLower = currentHeaders.map(h => String(h).toLowerCase().trim());

const missingHeaders = targetHeaders.filter(h => {
  const target = h.toLowerCase();
  if (target === 'coordinates') {
    return currentHeadersLower.indexOf('coordinates') === -1 &&
      currentHeadersLower.indexOf('coordinate') === -1 &&
      currentHeadersLower.indexOf('座標') === -1;
  }
  return currentHeadersLower.indexOf(target) === -1;
});

if (missingHeaders.length > 0) {
  // Find first truly empty column in row 1
  let firstEmptyCol = 1;
  while (firstEmptyCol <= 50 && currentHeaders[firstEmptyCol - 1] !== "") {
    firstEmptyCol++;
  }
  sheet.getRange(1, firstEmptyCol, 1, missingHeaders.length).setValues([missingHeaders]);
  SpreadsheetApp.flush();
}
return sheet;
}

function ensureAssignSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('AssignedWorks');
  if (!sheet) {
    sheet = ss.insertSheet('AssignedWorks');
    sheet.appendRow(['id', 'assign_type', 'is_assigned_completed', 'created_at']);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(['id', 'assign_type', 'is_assigned_completed', 'created_at']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doGet(e) {
  const sheet = ensureSheet();
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) return responseJson([]);

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data.shift();
  const includePhotos = e.parameter.include_photos === 'true';

  let reports = data.map(row => {
    let obj = {};
    headers.forEach((header, i) => {
      const h = String(header).toLowerCase().trim();
      // If includePhotos is false, return empty string for photo to save bandwidth
      if (h === 'photo' && !includePhotos) {
        obj[h] = '';
      } else {
        // Only set value if current obj value is empty or undefined, 
        // prioritizing non-empty values from duplicate columns
        if (obj[h] === undefined || obj[h] === '') {
          obj[h] = row[i] !== undefined ? row[i] : '';
        } else if (row[i] !== undefined && row[i] !== '') {
          // If we already have a value but found another non-empty one, overwrite it
          // This ensures if a new column was added later, it takes precedence if it has data
          obj[h] = row[i];
        }
      }
    });
    return obj;
  });

  // Join AssignedWorks
  const assignSheet = ensureAssignSheet();
  const assignLastRow = assignSheet.getLastRow();
  if (assignLastRow > 1) {
    const assignData = assignSheet.getRange(2, 1, assignLastRow - 1, assignSheet.getLastColumn()).getValues();
    const headersAssign = assignSheet.getRange(1, 1, 1, assignSheet.getLastColumn()).getValues()[0];
    const idIdx = headersAssign.indexOf('id');
    const typeIdx = headersAssign.indexOf('assign_type');
    const compIdx = headersAssign.indexOf('is_assigned_completed');

    const assignMap = {};
    assignData.forEach(row => {
      assignMap[String(row[idIdx])] = {
        assign_type: row[typeIdx],
        is_assigned_completed: row[compIdx] === true || String(row[compIdx]).toLowerCase() === 'true'
      };
    });

    reports.forEach(r => {
      if (assignMap[String(r.id)]) {
        r.assign_type = assignMap[String(r.id)].assign_type;
        r.is_assigned_completed = assignMap[String(r.id)].is_assigned_completed;
      }
    });
  }

  if (e.parameter.location_type && e.parameter.location_type !== 'all') {
    reports = reports.filter(r => r.location_type === e.parameter.location_type);
  }

  return responseJson(reports);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    if (action === 'create') return createReport(payload.data);
    if (action === 'update') {
      ensureSheet(); // Make sure sheet has all columns before updating
      return updateReport(payload.id, payload.data);
    }
    if (action === 'delete') return deleteReport(payload.id);
    if (action === 'bulkDelete') return bulkDelete(payload.ids);
    if (action === 'getPhoto') return getPhoto(payload.id);
    if (action === 'getPhotos') return getPhotos(payload.ids);
    if (action === 'assign') return assignWork(payload.id, payload.data);
    if (action === 'deleteAssignment') return deleteAssignment(payload.id);

    return responseJson({ error: 'Invalid action' }, 400);
  } catch (error) {
    return responseJson({ error: error.toString() }, 500);
  }
}

function assignWork(id, data) {
  const sheet = ensureAssignSheet();
  const allData = sheet.getDataRange().getValues();
  let rowIndex = -1;
  const headers = allData[0];
  const idIndex = headers.indexOf('id');

  if (allData.length > 1) {
    for (let i = 1; i < allData.length; i++) {
      if (String(allData[i][idIndex]) === String(id)) {
        rowIndex = i + 1;
        break;
      }
    }
  }

  if (rowIndex === -1) {
    const rowData = headers.map(header => {
      if (header === 'id') return id;
      if (header === 'created_at') return new Date().toISOString();
      return data[header] !== undefined ? data[header] : '';
    });
    sheet.appendRow(rowData);
    const compIdx = headers.indexOf('is_assigned_completed');
    if (data.is_assigned_completed === true || String(data.is_assigned_completed).toLowerCase() === 'true') {
      sheet.getRange(sheet.getLastRow(), 1, 1, headers.length).setBackground('#d4edda');
    }
  } else {
    const rowData = headers.map((header, i) => {
      if (header === 'id') return id;
      if (data[header] !== undefined) return data[header];
      return allData[rowIndex - 1][i] !== undefined ? allData[rowIndex - 1][i] : '';
    });
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    const compIdx = headers.indexOf('is_assigned_completed');
    if (rowData[compIdx] === true || String(rowData[compIdx]).toLowerCase() === 'true') {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setBackground('#d4edda');
    } else {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setBackground(null);
    }
  }

  if (data.completion_time !== undefined) {
    try {
      const reportSheet = ensureSheet();
      const reportData = reportSheet.getDataRange().getValues();
      const reportHeaders = reportData[0];
      const reportIdIdx = reportHeaders.indexOf('id');
      const compTimeIdx = reportHeaders.indexOf('completion_time');

      if (compTimeIdx !== -1) {
        let reportRowIdx = -1;
        for (let i = 1; i < reportData.length; i++) {
          if (String(reportData[i][reportIdIdx]) === String(id)) {
            reportRowIdx = i + 1;
            break;
          }
        }

        if (reportRowIdx !== -1) {
          reportSheet.getRange(reportRowIdx, compTimeIdx + 1).setValue(data.completion_time);
        }
      }
    } catch (e) {
      console.error('Failed to sync completion_time to Reports sheet', e);
    }
  }

  return responseJson({ success: true, assign_type: data.assign_type, is_assigned_completed: data.is_assigned_completed });
}

function deleteAssignment(id) {
  const sheet = ensureAssignSheet();
  const allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) return responseJson({ success: true });

  const idIndex = allData[0].indexOf('id');
  let rowIndex = -1;
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][idIndex]) === String(id)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex !== -1) {
    sheet.deleteRow(rowIndex);
  }

  return responseJson({ success: true });
}

function bulkDelete(ids) {
  const sheet = ensureSheet();
  const allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) return responseJson({ success: true });

  const idIndex = allData[0].indexOf('id');
  const idsToDelete = ids.map(id => String(id));

  // To avoid index shifting issues, we delete from bottom to top
  for (let i = allData.length - 1; i >= 1; i--) {
    if (idsToDelete.indexOf(String(allData[i][idIndex])) !== -1) {
      sheet.deleteRow(i + 1);
    }
  }

  // Optional: Also bulk delete from AssignedWorks if desired, but user said deleting assignment doesn't delete record. 
  // We'll leave the assigned record intact or dangling, which is fine since join handles it.

  return responseJson({ success: true });
}

function getPhoto(id) {
  const sheet = ensureSheet();
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idIndex = headers.findIndex(h => String(h).toLowerCase().trim() === 'id');
  const photoIndex = headers.findIndex(h => String(h).toLowerCase().trim() === 'photo');

  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][idIndex]) === String(id)) {
      return responseJson({ photo: allData[i][photoIndex] });
    }
  }
  return responseJson({ error: 'Not found' }, 404);
}

function getPhotos(ids) {
  const sheet = ensureSheet();
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idIndex = headers.findIndex(h => String(h).toLowerCase().trim() === 'id');
  const photoIndex = headers.findIndex(h => String(h).toLowerCase().trim() === 'photo');

  if (idIndex === -1 || photoIndex === -1) return responseJson({ error: 'Columns not found' }, 500);

  const idsStrings = (ids || []).map(String);
  const result = {};

  // Optimization: Single pass through data
  for (let i = 1; i < allData.length; i++) {
    const rowId = String(allData[i][idIndex]);
    if (idsStrings.indexOf(rowId) !== -1) {
      result[rowId] = allData[i][photoIndex] || '';
    }
  }
  return responseJson(result);
}

function createReport(data) {
  const sheet = ensureSheet();
  const id = new Date().getTime();
  const createdAt = new Date().toISOString();

  // Get headers directly from row 1 to be safe (up to 50 columns)
  const headersRow = sheet.getRange(1, 1, 1, 50).getValues()[0];
  const headers = headersRow.filter(h => h !== "");

  const rowData = headers.map(header => {
    const h = String(header).toLowerCase().trim();
    if (h === 'id') return id;
    if (h === 'created_at') return createdAt;

    // Check both original and lowercase keys in the data object
    let val = data[header];
    if (val === undefined) val = data[h];

    // Explicitly fallback for coordinates and location_type if header matches loosely
    if (h === 'coordinates' || h === 'coordinate' || h === '座標' || h.includes('座標')) {
      val = data['coordinates'] || data['_force_coordinates'] || val;
    }
    if (val === undefined && h.includes('location')) val = data['location_type'];

    return (val !== undefined && val !== null) ? val : '';
  });

  sheet.appendRow(rowData);
  return responseJson({ id: id, ...data });
}

function updateReport(id, data) {
  const sheet = ensureSheet();
  const allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) return responseJson({ error: 'Report not found' }, 404);

  // Read headers from row 1 (up to 50 columns)
  const headersRow = sheet.getRange(1, 1, 1, 50).getValues()[0];
  // Build a map: lowercased header → column index (1-based) so we never mismatch allData vs headers
  const headerColMap = {}; // { lowercase_header: colIndex1Based }
  const headerList = []; // [ { raw, lower, col } ]
  for (let c = 0; c < headersRow.length; c++) {
    const raw = headersRow[c];
    if (raw === '' || raw === null || raw === undefined) continue;
    const lower = String(raw).toLowerCase().trim();
    headerColMap[lower] = c + 1; // 1-based
    headerList.push({ raw: raw, lower: lower, col: c + 1 });
  }

  const idCol = headerColMap['id'];
  if (!idCol) return responseJson({ error: 'ID column not found' }, 500);

  // Find the target row using allData (idCol - 1 for 0-based index)
  let rowIndex = -1;
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][idCol - 1]) === String(id)) {
      rowIndex = i + 1; // 1-based sheet row
      break;
    }
  }
  if (rowIndex === -1) return responseJson({ error: 'Report not found' }, 404);

  // Read the existing row directly from sheet to avoid allData column-count mismatch
  const totalCols = headerList[headerList.length - 1].col;
  const existingRow = sheet.getRange(rowIndex, 1, 1, totalCols).getValues()[0];

  // Build the updated row
  const rowData = new Array(totalCols);
  headerList.forEach(function (hdr) {
    const c0 = hdr.col - 1; // 0-based index into rowData / existingRow
    const h = hdr.lower;
    const existing = existingRow[c0] !== undefined ? existingRow[c0] : '';

    // Fields that must not change on update
    if (h === 'id') { rowData[c0] = id; return; }
    if (h === 'created_at') { rowData[c0] = existing; return; }
    if (h === 'log_time') { rowData[c0] = existing; return; }

    // Resolve submitted value
    let val = data[hdr.raw];
    if (val === undefined) val = data[h];

    // Explicit coordinates handling
    if (h === 'coordinates' || h === 'coordinate' || h.includes('座標') || h.includes('coordinate')) {
      const submitted = data['coordinates'] !== undefined ? data['coordinates']
        : data['_force_coordinates'] !== undefined ? data['_force_coordinates']
          : val;
      // If a non-empty value was submitted, always write it
      if (submitted !== undefined && submitted !== null && String(submitted).trim() !== '') {
        rowData[c0] = String(submitted).trim();
      } else {
        // Submitted empty — preserve existing value to avoid accidental clear
        rowData[c0] = existing;
      }
      return;
    }

    // Photo: never overwrite with empty
    if (h === 'photo') {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        rowData[c0] = val;
      } else {
        rowData[c0] = existing;
      }
      return;
    }

    // All other fields
    if (val !== undefined && val !== null) {
      rowData[c0] = val;
    } else {
      rowData[c0] = existing;
    }
  });

  // Write each field individually.
  // Photo is SKIPPED unless a new photo is explicitly submitted,
  // because the existing base64 photo may exceed the 50000 char cell limit.
  const submittedPhoto = data['photo'] || data['Photo'] || '';
  const hasNewPhoto = submittedPhoto && String(submittedPhoto).trim().length > 0;

  headerList.forEach(function (hdr) {
    const h = hdr.lower;
    const c0 = hdr.col - 1;
    if (h === 'photo') {
      if (hasNewPhoto) {
        sheet.getRange(rowIndex, hdr.col).setValue(submittedPhoto);
      }
      // else: leave existing photo untouched
      return;
    }
    const cellVal = rowData[c0];
    sheet.getRange(rowIndex, hdr.col).setValue(cellVal !== undefined ? cellVal : '');
  });

  SpreadsheetApp.flush();
  return responseJson({ success: true });
}


function deleteReport(id) {
  const sheet = ensureSheet();
  const allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) return responseJson({ error: 'Report not found' }, 404);

  const idIndex = allData[0].findIndex(h => String(h).toLowerCase().trim() === 'id');
  let rowIndex = -1;
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][idIndex]) === String(id)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) return responseJson({ error: 'Report not found' }, 404);

  sheet.deleteRow(rowIndex);
  // Also delete assignment
  deleteAssignment(id);

  return responseJson({ success: true });
}

function responseJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────
// 測試函數：在 GAS 編輯器選擇後按 ▶ 執行
// ─────────────────────────────────────────────

// 步驟 1：先跑這個，取得第一筆資料的真實 id
function testGetFirstId() {
  const sheet = ensureSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) { Logger.log('No data rows found'); return; }
  const headers = data[0];
  const idIdx = headers.findIndex(h => String(h).toLowerCase().trim() === 'id');
  const coordIdx = headers.findIndex(h => String(h).toLowerCase().trim() === 'coordinates');
  Logger.log('First row id: ' + data[1][idIdx]);
  Logger.log('Current coordinates: ' + data[1][coordIdx]);
  Logger.log('Headers: ' + JSON.stringify(headers));
}

// 步驟 2：把 TEST_ID 換成步驟 1 取得的 id，然後執行
function testUpdateCoordinates() {
  const TEST_ID = 'TEST_ID'; // ← 換成真實 id（數字也可以字串傳入）
  const TEST_COORDS = '24.123456, 120.654321';

  const result = updateReport(TEST_ID, {
    coordinates: TEST_COORDS,
    _force_coordinates: TEST_COORDS
  });

  Logger.log('Result: ' + result.getContent());

  // 驗證是否真的寫進去了
  const sheet = ensureSheet();
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idIdx = headers.findIndex(h => String(h).toLowerCase().trim() === 'id');
  const coordIdx = headers.findIndex(h => String(h).toLowerCase().trim() === 'coordinates');

  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][idIdx]) === String(TEST_ID)) {
      Logger.log('✅ Row found. coordinates column value: [' + allData[i][coordIdx] + ']');
      Logger.log('coordinates column index (0-based): ' + coordIdx);
      break;
    }
  }
}
