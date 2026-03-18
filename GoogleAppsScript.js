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

function ensureAssignSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('AssignedWorks');
  if (!sheet) {
    sheet = ss.insertSheet('AssignedWorks');
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
      // If includePhotos is false, return empty string for photo to save bandwidth
      if (header === 'photo' && !includePhotos) {
        obj[header] = ''; 
      } else {
        obj[header] = row[i];
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
    if (action === 'update') return updateReport(payload.id, payload.data);
    if (action === 'delete') return deleteReport(payload.id);
    if (action === 'bulkDelete') return bulkDelete(payload.ids);
    if (action === 'getPhoto') return getPhoto(payload.id);
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
    if (header === 'created_at') return allData[rowIndex - 1][i] || ''; // Prevent undefined
    if (data[header] !== undefined) return data[header];
    const prevVal = allData[rowIndex - 1][i];
    return prevVal !== undefined ? prevVal : ''; // Prevent undefined causing setValues error
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
  // Also delete assignment
  deleteAssignment(id);
  
  return responseJson({ success: true });
}

function responseJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
