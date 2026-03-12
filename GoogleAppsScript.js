const SHEET_NAME = 'Reports';

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = [
      'id', 'item_number', 'log_time', 'highway', 'direction', 'mileage', 'lane',
      'damage_condition', 'improvement_method', 'supervision_review',
      'follow_up_method', 'completion_time', 'location_type', 'photo', 'created_at'
    ];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return responseJson({ error: 'Sheet not found' }, 404);

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return responseJson([]); // Only headers or empty
  
  const headers = data.shift();
  
  let reports = data.map(row => {
    let obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });

  // location_type filter
  if (e.parameter.location_type && e.parameter.location_type !== 'all') {
    reports = reports.filter(r => r.location_type === e.parameter.location_type);
  }

  return responseJson(reports);
}

function doPost(e) {
  try {
    // Parse the JSON request body
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    
    if (action === 'create') {
      return createReport(payload.data);
    } else if (action === 'update') {
      return updateReport(payload.id, payload.data);
    } else if (action === 'delete') {
      return deleteReport(payload.id);
    }
    
    return responseJson({ error: 'Invalid action' }, 400);
  } catch (error) {
    return responseJson({ error: error.toString(), request: e.postData.contents }, 500);
  }
}

function createReport(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  const id = new Date().getTime(); // Simple time-based ID
  const createdAt = new Date().toISOString();
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = headers.map(header => {
    if (header === 'id') return id;
    if (header === 'created_at') return createdAt;
    return data[header] !== undefined ? data[header] : '';
  });
  
  sheet.appendRow(rowData);
  
  return responseJson({ id: id, ...data });
}

function updateReport(id, data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  const allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) return responseJson({ error: 'Report not found' }, 404);
  
  const headers = allData[0];
  const idIndex = headers.indexOf('id');
  
  let rowIndex = -1;
  for (let i = 1; i < allData.length; i++) {
    // strict string comparison
    if (String(allData[i][idIndex]) === String(id)) {
      rowIndex = i + 1; // Apps Script ranges are 1-based index
      break;
    }
  }
  
  if (rowIndex === -1) return responseJson({ error: 'Report not found' }, 404);
  
  const rowData = headers.map((header, i) => {
    if (header === 'id') return id;
    if (header === 'created_at') return allData[rowIndex - 1][i]; // preserve existing
    if (data[header] !== undefined) return data[header]; // update new value
    return allData[rowIndex - 1][i]; // preserve existing
  });
  
  sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  return responseJson({ success: true });
}

function deleteReport(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  const allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) return responseJson({ error: 'Report not found' }, 404);
  
  const idIndex = allData[0].indexOf('id');
  
  let rowIndex = -1;
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][idIndex]) === String(id)) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) return responseJson({ error: 'Report not found' }, 404);
  
  sheet.deleteRow(rowIndex);
  return responseJson({ success: true });
}

// Helper to return proper JSON payload and CORS headers
function responseJson(data, status = 200) {
  // text/plain mimetype is used to bypass CORS preflight OPTION request naturally
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
