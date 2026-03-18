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
      'follow_up_method', 'completion_time', 'location_type', 'photo', 'created_at',
      'assign_type', 'is_assigned_completed'
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
    if (action === 'bulkDelete') return bulkDelete(payload.ids);
    if (action === 'getPhoto') return getPhoto(payload.id);
    
      return responseJson({ error: 'Invalid action' }, 400);
  } catch (error) {
    return responseJson({ error: error.toString() }, 500);
  }
}

function syncAssignedWorks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ensureSheet();
  // Fetch up to the last header column
  const lastCol = mainSheet.getLastColumn();
  const lastRow = mainSheet.getLastRow();
  if (lastRow === 0 || lastCol === 0) return;
  
  const allData = mainSheet.getRange(1, 1, lastRow, lastCol).getValues();
  
  let assignSheet = ss.getSheetByName('AssignedWorks');
  if (!assignSheet) {
    assignSheet = ss.insertSheet('AssignedWorks');
  }
  
  const headers = allData[0];
  const assignTypeIdx = headers.indexOf('assign_type');
  if (assignTypeIdx === -1) return; // Headers haven't been updated yet
  
  const assignedData = allData.filter((row, i) => {
    if (i === 0) return true; // Keep headers
    // Prevent out of bounds if row is shorter than headers
    const typeVal = row[assignTypeIdx];
    return typeVal !== undefined && typeVal !== null && String(typeVal).trim() !== '';
  });
  
  assignSheet.clear();
  if (assignedData.length > 0) {
    assignSheet.getRange(1, 1, assignedData.length, assignedData[0].length).setValues(assignedData);
    assignSheet.setFrozenRows(1);
    
    // Make completed rows green
    const completedIdx = headers.indexOf('is_assigned_completed');
    if (completedIdx !== -1 && assignedData.length > 1) {
      for (let i = 1; i < assignedData.length; i++) {
        const isCompleted = assignedData[i][completedIdx];
        if (isCompleted === true || String(isCompleted).toLowerCase() === 'true') {
          assignSheet.getRange(i + 1, 1, 1, assignedData[i].length).setBackground('#d4edda'); // light green
        } else {
          assignSheet.getRange(i + 1, 1, 1, assignedData[i].length).setBackground(null);
        }
      }
    }
  }
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
  
  syncAssignedWorks();
  return responseJson({ success: true });
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
  syncAssignedWorks();
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
  syncAssignedWorks();
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
  syncAssignedWorks();
  return responseJson({ success: true });
}

function responseJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
