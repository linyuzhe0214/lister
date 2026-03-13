const SHEET_NAME = 'Reports';

// 自動檢查並建立表單與標題列
function ensureSheet() {
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
  return sheet;
}

function doGet(e) {
  const sheet = ensureSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return responseJson([]);
  
  const headers = data.shift();
  const includePhotos = e.parameter.include_photos === 'true';
  
  let reports = data.map(row => {
    let obj = {};
    headers.forEach((header, i) => {
      // If includePhotos is false, return empty string for photo to save bandwidth
      if (header === 'photo' && !includePhotos) {
        obj[header] = ''; 
      } else {
        obj[header] = row[i];
      }
    });
    return obj;
  });

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
    if (action === 'update') return updateReport(payload.id, payload.data);
    if (action === 'delete') return deleteReport(payload.id);
    if (action === 'getPhoto') return getPhoto(payload.id);
    
    return responseJson({ error: 'Invalid action' }, 400);
  } catch (error) {
    return responseJson({ error: error.toString() }, 500);
  }
}

function getPhoto(id) {
  const sheet = ensureSheet();
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idIndex = headers.indexOf('id');
  const photoIndex = headers.indexOf('photo');
  
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][idIndex]) === String(id)) {
      return responseJson({ photo: allData[i][photoIndex] });
    }
  }
  return responseJson({ error: 'Not found' }, 404);
}

function createReport(data) {
  const sheet = ensureSheet();
  const id = new Date().getTime();
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
  const sheet = ensureSheet();
  const allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) return responseJson({ error: 'Report not found' }, 404);
  
  const headers = allData[0];
  const idIndex = headers.indexOf('id');
  let rowIndex = -1;
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][idIndex]) === String(id)) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) return responseJson({ error: 'Report not found' }, 404);
  
  const rowData = headers.map((header, i) => {
    if (header === 'id') return id;
    if (header === 'created_at') return allData[rowIndex - 1][i];
    if (data[header] !== undefined) return data[header];
    return allData[rowIndex - 1][i];
  });
  
  sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  return responseJson({ success: true });
}

function deleteReport(id) {
  const sheet = ensureSheet();
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

function responseJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
