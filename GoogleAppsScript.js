const SHEET_NAME = 'Reports';

// 自動檢查並建立表單與標題列
function ensureSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  const targetHeaders = [
    'id', 'item_number', 'log_time', 'highway', 'direction', 'mileage', 'lane',
    'damage_condition', 'improvement_method', 'supervision_review',
    'follow_up_method', 'completion_time', 'location_type', 'photo', 'coordinates', 'created_at'
  ];

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(targetHeaders);
    sheet.setFrozenRows(1);
  }
  
  // Check for missing headers and add them (case-insensitive)
  const lastCol = sheet.getLastColumn();
  if (lastCol > 0) {
    const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const currentHeadersLower = currentHeaders.map(h => String(h).toLowerCase());
    const missingHeaders = targetHeaders.filter(h => currentHeadersLower.indexOf(h.toLowerCase()) === -1);
    
    if (missingHeaders.length > 0) {
      sheet.getRange(1, lastCol + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    }
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
    
    // Debug Logger: Write raw payload to a new sheet to trace what the backend receives
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let debugSheet = ss.getSheetByName('DebugLogs');
      if (!debugSheet) {
        debugSheet = ss.insertSheet('DebugLogs');
        debugSheet.appendRow(['Timestamp', 'Action', 'Payload']);
      }
      debugSheet.appendRow([new Date().toISOString(), action, JSON.stringify(payload)]);
    } catch (logErr) {
      // Ignore logging errors
    }
    
    if (action === 'create') return createReport(payload.data);
    if (action === 'update') return updateReport(payload.id, payload.data);
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
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = headers.map(header => {
    const h = String(header).toLowerCase().trim();
    if (h === 'id') return id;
    if (h === 'created_at') return createdAt;
    return (data[header] !== undefined ? data[header] : (data[h] !== undefined ? data[h] : ''));
  });
  sheet.appendRow(rowData);
  return responseJson({ id: id, ...data });
}

function updateReport(id, data) {
  const sheet = ensureSheet();
  const allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) return responseJson({ error: 'Report not found' }, 404);
  
  const headers = allData[0];
  const idIndex = headers.findIndex(h => String(h).toLowerCase().trim() === 'id');
  if (idIndex === -1) return responseJson({ error: 'ID column not found' }, 500);
  
  let rowIndex = -1;
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][idIndex]) === String(id)) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) return responseJson({ error: 'Report not found' }, 404);
  
  const rowData = headers.map((header, i) => {
    const h = String(header).toLowerCase().trim();
    if (h === 'id') return id;
    if (h === 'created_at') return allData[rowIndex - 1][i] !== undefined ? allData[rowIndex - 1][i] : ''; 
    if (h === 'log_time') return allData[rowIndex - 1][i] !== undefined ? allData[rowIndex - 1][i] : ''; 
    
    // Check both original and lowercase keys in the data object
    let val = data[header];
    if (val === undefined) val = data[h];
    
    // Explicitly fallback for coordinates and location_type if header matches loosely
    if (val === undefined && h.includes('coordinate')) val = data['coordinates'];
    if (val === undefined && h.includes('location')) val = data['location_type'];
    
    if (val !== undefined && val !== null) {
      // Don't overwrite photo with empty string if it already has data
      if (h === 'photo' && String(val).trim() === '' && allData[rowIndex - 1][i]) {
        return allData[rowIndex - 1][i];
      }
      // Don't overwrite coordinates with empty string if it already has data
      if (h.includes('coordinate') && String(val).trim() === '' && allData[rowIndex - 1][i]) {
        return allData[rowIndex - 1][i];
      }
      return val;
    }
    
    return allData[rowIndex - 1][i] !== undefined ? allData[rowIndex - 1][i] : '';
  });
  
  sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
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
