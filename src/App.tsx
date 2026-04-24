import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, Filter, Search, ArrowUpDown, Download, X } from 'lucide-react';
import { format } from 'date-fns';
import { Report } from './types';
import { ReportForm } from './components/ReportForm';
import { ReportList } from './components/ReportList';
import { SearchableDropdown } from './components/SearchableDropdown';

export default function App() {
  const [reports, setReports] = useState<Report[]>([]);
  const photoCache = useRef<Map<number, string>>(new Map());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'reports' | 'assignments'>('reports');
  const [filter, setFilter] = useState<'all' | 'mainline' | 'ramp'>('all');
  const [sortBy, setSortBy] = useState<'dateDesc' | 'dateAsc' | 'mileageAsc' | 'mileageDesc'>('dateDesc');
  const [filterHighway, setFilterHighway] = useState<string>('all');
  const [filterDamage, setFilterDamage] = useState<string>('all');
  const [filterAssignType, setFilterAssignType] = useState<string>('all');
  const [mileageStart, setMileageStart] = useState<string>('');
  const [mileageEnd, setMileageEnd] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // VITE_GAS_URL will be provided in .env
  const GAS_URL = import.meta.env.VITE_GAS_URL || '';

  // Load from cache initially
  // Only fetch once on mount — filter switching is instant via useMemo
  useEffect(() => {
    const cachedData = localStorage.getItem('reports_cache');
    if (cachedData) {
      try {
        setReports(JSON.parse(cachedData));
        setLoading(false);
      } catch (e) {
        console.error('Failed to parse cache');
      }
    }
    console.log("GAS_URL Status:", GAS_URL ? "Configured" : "NOT CONFIGURED! Check .env");
    fetchReports();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchReports = async () => {
    if (!GAS_URL) {
      setLoading(false);
      return;
    }
    try {
      // If we already have cached data, don't show full loading spinner
      if (reports.length === 0) {
        const cachedData = localStorage.getItem('reports_cache');
        if (cachedData) {
          try {
            setReports(JSON.parse(cachedData));
            setLoading(false);
          } catch (e) {}
        } else {
          setLoading(true);
        }
      }
      
      const timestamp = new Date().getTime();
      const res = await fetch(`${GAS_URL}?location_type=all&include_photos=false&_t=${timestamp}`);
      const data = await res.json();
      const reportData = Array.isArray(data) ? data : [];
      
      setReports(reportData);
      try {
        localStorage.setItem('reports_cache', JSON.stringify(reportData));
      } catch (e) {
        console.warn('localStorage quota exceeded, clearing cache');
        localStorage.removeItem('reports_cache');
      }
      preloadPhotos(reportData);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const getReportPhoto = async (id: number): Promise<string> => {
    if (!GAS_URL) return '';
    // 先查 cache，有就直接回傳，不再發請求
    if (photoCache.current.has(id)) {
      return photoCache.current.get(id)!;
    }
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getPhoto', id }),
      });
      const data = await res.json();
      const photo = data.photo || '';
      if (photo) photoCache.current.set(id, photo);
      return photo;
    } catch (error) {
      console.error('Failed to fetch photo:', error);
      return '';
    }
  };

  // Batch preload photos in background using idle time
  const preloadPhotos = useCallback((reportData: Report[]) => {
    if (!GAS_URL) return;
    const idsToPreload = reportData
      .filter(r => r.id && !r.photo && !photoCache.current.has(r.id))
      .map(r => r.id!);
    if (idsToPreload.length === 0) return;

    // Load in smaller batches to avoid hitting GAS quotas or slowing down UI
    const BATCH_SIZE = 10;
    let batchIdx = 0;
    const loadBatch = () => {
      const batch = idsToPreload.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE);
      if (batch.length === 0) return;
      fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getPhotos', ids: batch }),
      })
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            Object.entries(data).forEach(([id, photo]) => {
              if (photo) photoCache.current.set(Number(id), photo as string);
            });
          }
          batchIdx++;
          if (batchIdx * BATCH_SIZE < idsToPreload.length) {
            if ('requestIdleCallback' in window) {
              (window as any).requestIdleCallback(loadBatch);
            } else {
              setTimeout(loadBatch, 100);
            }
          }
        })
        .catch(() => { /* silent */ });
    };

    // Start first batch after a short delay to let UI settle
    setTimeout(() => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(loadBatch);
      } else {
        loadBatch();
      }
    }, 500);
  }, [GAS_URL]);

  // Step 1: Filter by location_type (mainline/ramp/all) — instant, no API call
  const typeFilteredReports = useMemo(() => {
    if (filter === 'all') return reports;
    return reports.filter(r => r.location_type === filter);
  }, [reports, filter]);

  // Step 2: Filter by active tab
  const tabFilteredReports = useMemo(() => {
    if (activeTab === 'assignments') {
      return typeFilteredReports.filter(r => !!r.assign_type);
    }
    return typeFilteredReports;
  }, [typeFilteredReports, activeTab]);

  const uniqueHighways = useMemo(() => Array.from(new Set(tabFilteredReports.map(r => r.highway))).filter(Boolean).map(String), [tabFilteredReports]);
  const uniqueDamages = useMemo(() => Array.from(new Set(tabFilteredReports.map(r => r.damage_condition))).filter(Boolean).map(String), [tabFilteredReports]);
  const uniqueAssignTypes = useMemo(() => Array.from(new Set(reports.map(r => r.assign_type))).filter(Boolean).map(String) as string[], [reports]);

  // Helper function to parse mileage string (e.g. "174k+000", "181") into a number for precise sorting and filtering
  const parseMileage = (m: string | number) => {
    if (m === null || m === undefined || m === '') return 0;
    const strM = String(m);
    const match = strM.match(/(\d+)[kK]\+?(\d+)?/);
    if (match) {
      return parseInt(match[1] || '0') * 1000 + parseInt(match[2] || '0');
    }
    
    // If it's just a number like "181", treat it as "181k+000" (181000)
    const pureNumberMatch = strM.match(/^\d+$/);
    if (pureNumberMatch) {
      return parseInt(strM, 10) * 1000;
    }

    return parseFloat(strM.replace(/[^\d.]/g, '')) || 0;
  };

  const uniqueMileages = useMemo(() => Array.from(new Set<string>(tabFilteredReports.map(r => r.mileage)))
    .filter(Boolean)
    .sort((a, b) => parseMileage(a) - parseMileage(b)), 
  [tabFilteredReports]);

  const filteredAndSortedReports = useMemo(() => {
    let result = [...tabFilteredReports];

    if (filterHighway !== 'all') {
      result = result.filter(r => r.highway === filterHighway);
    }

    if (filterDamage !== 'all') {
      result = result.filter(r => r.damage_condition === filterDamage);
    }

    if (mileageStart.trim() !== '' || mileageEnd.trim() !== '') {
      const startParam = mileageStart.trim() ? parseMileage(mileageStart) : -99999999;
      const endParam = mileageEnd.trim() ? parseMileage(mileageEnd) : 99999999;
      result = result.filter(r => {
        const m = parseMileage(r.mileage);
        return m >= startParam && m <= endParam;
      });
    }

    if (startDate || endDate) {
      result = result.filter(r => {
        try {
          const reportDate = format(new Date(r.log_time), 'yyyy-MM-dd');
          const isAfterStart = startDate ? reportDate >= startDate : true;
          const isBeforeEnd = endDate ? reportDate <= endDate : true;
          return isAfterStart && isBeforeEnd;
        } catch {
          return true;
        }
      });
    }

    if (activeTab === 'assignments' && filterAssignType !== 'all') {
      result = result.filter(r => r.assign_type === filterAssignType);
    }

    if (globalSearch.trim() !== '') {
      const searchLower = globalSearch.toLowerCase();
      result = result.filter(r => 
        (r.highway && String(r.highway).toLowerCase().includes(searchLower)) ||
        (r.direction && String(r.direction).toLowerCase().includes(searchLower)) ||
        (r.damage_condition && String(r.damage_condition).toLowerCase().includes(searchLower)) ||
        (r.improvement_method && String(r.improvement_method).toLowerCase().includes(searchLower)) ||
        (r.mileage && String(r.mileage).toLowerCase().includes(searchLower)) ||
        (r.lane && String(r.lane).toLowerCase().includes(searchLower))
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'dateDesc') {
        return new Date(b.log_time).getTime() - new Date(a.log_time).getTime();
      } else if (sortBy === 'dateAsc') {
        return new Date(a.log_time).getTime() - new Date(b.log_time).getTime();
      } else if (sortBy === 'mileageAsc') {
        return parseMileage(a.mileage) - parseMileage(b.mileage);
      } else if (sortBy === 'mileageDesc') {
        return parseMileage(b.mileage) - parseMileage(a.mileage);
      }
      return 0;
    });

    return result;
  }, [tabFilteredReports, filterHighway, filterDamage, filterAssignType, mileageStart, mileageEnd, startDate, endDate, sortBy, globalSearch, activeTab]);

  const handleQuickUpdate = async (id: number, updates: Partial<Report>) => {
    if (!GAS_URL) return;
    const originalReports = [...reports];
    const targetReport = reports.find(r => r.id === id);
    if (!targetReport) return;
    
    // For assigning works
    const isAssignAction = updates.assign_type !== undefined || updates.is_assigned_completed !== undefined;
    const updatedReport = { ...targetReport, ...updates };
    const newReports = reports.map(r => r.id === id ? updatedReport : r);
    setReports(newReports);

    try {
      const payload = isAssignAction 
        ? { 
            action: 'assign', 
            id, 
            data: { 
              assign_type: updatedReport.assign_type, 
              is_assigned_completed: updatedReport.is_assigned_completed,
              ...(updates.completion_time !== undefined ? { completion_time: updates.completion_time } : {})
            } 
          }
        : { action: 'update', id, data: updates };

      const res = await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      
      // With mode: 'no-cors', the response is opaque. We assume success unless an exception occurs.
      try { localStorage.setItem('reports_cache', JSON.stringify(newReports)); } catch (e) { localStorage.removeItem('reports_cache'); }
    } catch (err: any) {
      console.error('Failed to update report:', err);
      alert('更新失敗：' + (err.message || '請重新整理網頁再試一次'));
      setReports(originalReports);
    }
  };

  const handleAddReport = async (data: Report) => {
    if (!GAS_URL) {
      alert('請先在 .env 設定您的 Google Apps Script 網址 (VITE_GAS_URL)');
      return;
    }
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      const isEditing = !!editingReport;
      
      // Optimistic Update: Add to UI immediately
      const tempId = Date.now();
      const optimisticData = isEditing 
        ? reports.map(r => r.id === editingReport.id ? { ...data, id: editingReport.id } : r)
        : [{ ...data, id: tempId, log_time: data.log_time || new Date().toISOString() }, ...reports];
      
      setReports(optimisticData);
      setIsFormOpen(false);
      // 編輯完成後留在對應的 location_type 頁面
      if (data.location_type === 'ramp' || data.location_type === 'mainline') {
        setFilter(data.location_type);
      }

      let dataToSend: any = {};
      if (isEditing) {
        // 找出有修改的欄位 (Diff)
        for (const key in data) {
          if (Object.prototype.hasOwnProperty.call(data, key)) {
            const k = key as keyof Report;
            if (data[k] !== editingReport[k]) {
              dataToSend[k] = data[k];
            }
          }
        }
        // 照片特別處理：如果一樣就不送
        const cachedPhoto = photoCache.current.get(editingReport.id!);
        if (cachedPhoto && data.photo === cachedPhoto) {
          delete dataToSend.photo;
        }
        // 如果有送 coordinates，附加上 force 確保後端吃到
        if (dataToSend.coordinates !== undefined) {
          dataToSend._force_coordinates = dataToSend.coordinates;
        }
      } else {
        dataToSend = { ...data };
      }

      const payload = isEditing 
        ? { action: 'update', id: editingReport.id, data: dataToSend }
        : { action: 'create', data: dataToSend };

      // Save submitted data for post-fetch merge
      const submittedId = isEditing ? editingReport.id : null;
      const submittedData = { ...dataToSend };

      console.log("Submitting Payload:", { action: payload.action, changedFields: Object.keys(dataToSend) });

      fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      
      setEditingReport(null);
      // Update local storage immediately with the optimistic/new data
      try { localStorage.setItem('reports_cache', JSON.stringify(optimisticData)); } catch (e) { localStorage.removeItem('reports_cache'); }
      
      // GAS backend takes 1-3s to commit the write. Fetching immediately returns stale data.
      await new Promise(resolve => setTimeout(resolve, isEditing ? 5000 : 2000));
      
      // Fetch fresh data, then merge back submitted fields if server returned stale empty values
      await fetchReports();
      if (submittedId !== null) {
        setReports(prev => prev.map(r => {
          if (r.id !== submittedId) return r;
          // For each submitted field, if server returned empty but we submitted a value, keep submitted value
          const merged = { ...r };
          (Object.keys(submittedData) as (keyof Report)[]).forEach(key => {
            const submitted = submittedData[key];
            if (submitted !== undefined && submitted !== '' && (r[key] === undefined || r[key] === '')) {
              (merged as any)[key] = submitted;
            }
          });
          return merged;
        }));
      }
    } catch (error: any) {
      console.error('Failed to save report:', error);
      alert('儲存失敗：' + (error.message || '請確認網路狀態與 Google Apps Script 是否部署為最新版本'));
      fetchReports(); // Revert on failure
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditReport = (report: Report) => {
    setEditingReport(report);
    setIsFormOpen(true);
  };

  const handleDeleteReport = async (id: number) => {
    setDeletingReportId(id);
  };

  const confirmDelete = async () => {
    if (deletingReportId === null || !GAS_URL) return;
    
    // Optimistic Delete
    const originalReports = [...reports];
    const isAssignmentDelete = activeTab === 'assignments';

    if (isAssignmentDelete) {
      setReports(reports.map(r => r.id === deletingReportId ? { ...r, assign_type: undefined, is_assigned_completed: false } : r));
    } else {
      setReports(reports.filter(r => r.id !== deletingReportId));
    }
    const currentId = deletingReportId;
    setDeletingReportId(null);

    try {
      const actionName = isAssignmentDelete ? 'deleteAssignment' : 'delete';
      const res = await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: actionName, id: currentId }),
      });
      localStorage.setItem('reports_cache', JSON.stringify(reports.filter(r => r.id !== deletingReportId)));
    } catch (error) {
      console.error('Failed to delete report:', error);
      alert('刪除失敗');
      setReports(originalReports); // Revert
    }
  };

  const handleBulkDelete = async (ids: number[]) => {
    if (!GAS_URL) return;
    
    // Optimistic Delete
    const originalReports = [...reports];
    setReports(reports.filter(r => !ids.includes(r.id!)));

    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'bulkDelete', ids }),
      });
      const remainingReports = reports.filter(r => !ids.includes(r.id!));
      localStorage.setItem('reports_cache', JSON.stringify(remainingReports));
    } catch (error) {
      console.error('Failed to bulk delete reports:', error);
      alert('批次刪除失敗');
      setReports(originalReports); // Revert
    }
  };

  const exportToHTML = async () => {
    if (filteredAndSortedReports.length === 0) {
      alert('沒有資料可供匯出');
      return;
    }

    setIsExporting(true);
    try {
      const missingPhotoIds = filteredAndSortedReports.filter(r => !r.photo && r.id).map(r => r.id!);
      let photoMap: Record<string, string> = {};

      if (missingPhotoIds.length > 0 && GAS_URL) {
        try {
          const res = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'getPhotos', ids: missingPhotoIds }),
          });
          const data = await res.json();
          if (data && !data.error) {
            photoMap = data;
          }
        } catch (e) {
          console.error('Failed to pre-fetch photos for export', e);
        }
      }

      const exportData = filteredAndSortedReports.map(report => ({
        ...report,
        photo: report.photo || (report.id ? photoMap[String(report.id)] : '') || ''
      }));

      const title = `巡查紀錄匯出_${format(new Date(), 'yyyyMMdd_HHmm')}`;
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; font-size: 14px; }
    th { background-color: #f8f9fa; font-weight: bold; }
    .photo-cell { width: 120px; text-align: center; }
    .photo-cell img { max-width: 100px; max-height: 80px; border-radius: 4px; border: 1px solid #eee; }
    @media print {
      .no-print { display: none; }
      table { border: 1px solid #000; }
      th, td { border: 1px solid #000; }
    }
  </style>
</head>
<body>
  <h1>國道巡查紀錄報表</h1>
  <p>產生時間：${format(new Date(), 'yyyy/MM/dd HH:mm')}</p>
  <div class="no-print" style="margin-bottom: 20px;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer;">列印 / 轉存 PDF</button>
  </div>
  <table>
    <thead>
      <tr>
        <th>項次</th>
        <th>登錄時間</th>
        <th>位置</th>
        <th>里程/車道</th>
        <th>損壞狀況</th>
        <th>改善方式</th>
        <th>後續處理方式</th>
        ${activeTab === 'assignments' ? '<th>派工項目</th><th>完成狀態</th>' : ''}
        <th class="photo-cell">現場照片</th>
      </tr>
    </thead>
    <tbody>
      ${exportData.map((report, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${format(new Date(report.log_time), 'yyyy/MM/dd HH:mm')}</td>
          <td>${report.location_type === 'mainline' ? '主線' : '匝道'}<br>${report.highway} ${report.direction}</td>
          <td>${report.mileage}<br>${report.lane}</td>
          <td>${report.damage_condition}</td>
          <td>${report.improvement_method}</td>
          <td>${report.follow_up_method || '-'}</td>
          ${activeTab === 'assignments' ? `
            <td>${report.assign_type || '-'}</td>
            <td>${report.is_assigned_completed ? '已完成' : '未完成'}</td>
          ` : ''}
          <td class="photo-cell">
            ${report.photo ? `<img src="${report.photo}" alt="照片">` : '無照片'}
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${title}.html`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToCSV = () => {
    if (filteredAndSortedReports.length === 0) {
      alert('沒有資料可供匯出');
      return;
    }

    const baseHeaders = [
      '項次', '登錄時間', '位置類型', '國道', '方向', '里程/交流道名稱', 
      '車道/出入口', '損壞狀況', '改善方式', '監造審查', '後續處理方式', '完成時間'
    ];
    
    const headers = activeTab === 'assignments' 
      ? [...baseHeaders, '派工項目', '完成狀態'] 
      : baseHeaders;

    const csvRows = [
      headers.join(','),
      ...filteredAndSortedReports.map((report, index) => {
        const row = [
          index + 1,
          format(new Date(report.log_time), 'yyyy/MM/dd HH:mm'),
          report.location_type === 'mainline' ? '主線' : '匝道',
          report.highway,
          report.direction,
          report.mileage,
          report.lane,
          report.damage_condition,
          report.improvement_method || '',
          report.supervision_review || '',
          report.follow_up_method || '',
          report.completion_time ? format(new Date(report.completion_time), 'yyyy/MM/dd HH:mm') : ''
        ];
        
        if (activeTab === 'assignments') {
          row.push(report.assign_type || '');
          row.push(report.is_assigned_completed ? '已完成' : '未完成');
        }
        
        // Escape quotes and wrap in quotes to handle commas in data
        return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
      })
    ];

    const csvContent = '\uFEFF' + csvRows.join('\n'); // Add BOM for Excel UTF-8 compatibility
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `巡查紀錄匯出_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 sm:h-20 gap-4">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div className="bg-indigo-600 text-white p-1.5 sm:p-2.5 rounded-xl shadow-lg shadow-indigo-200">
                <Search size={22} className="sm:w-6 sm:h-6" />
              </div>
              <h1 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight whitespace-nowrap hidden sm:block">國道巡查</h1>
            </div>
            
            <div className="flex-1 max-w-md">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Search size={18} className="text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="搜尋公路、損壞..."
                  className="block w-full pl-11 pr-4 py-2 sm:py-2.5 border border-gray-200 rounded-2xl bg-gray-50/50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-sm sm:text-base transition-all"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
              <button 
                onClick={exportToHTML}
                disabled={isExporting}
                className="p-2 sm:px-4 sm:py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-2xl shadow-sm transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                title="匯出含照片報表"
              >
                {isExporting ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-200 border-t-indigo-600"></div> : <Download size={20} />}
                <span className="hidden md:inline font-bold">{isExporting ? '載入中' : '匯出'}</span>
              </button>
              <button 
                onClick={() => {
                  setEditingReport(null);
                  setIsFormOpen(true);
                }}
                className="p-2 sm:px-5 sm:py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg shadow-indigo-100 transition-all active:scale-95 flex items-center gap-2"
              >
                <Plus size={20} />
                <span className="hidden md:inline font-bold">新增</span>
              </button>
            </div>
          </div>
          
          <div className="flex gap-6 mt-4 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveTab('reports')}
              className={`pb-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${activeTab === 'reports' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              巡查紀錄
            </button>
            <button 
              onClick={() => setActiveTab('assignments')}
              className={`pb-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${activeTab === 'assignments' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              派工單
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Mobile Filter Toggle */}
        <div className="flex lg:hidden items-center justify-between mb-4 gap-3">
          <button 
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border transition-all font-bold text-sm ${showMobileFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-700'}`}
          >
            <Filter size={18} />
            {showMobileFilters ? '隱藏篩選' : '進階篩選'}
          </button>
          
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm">
            <ArrowUpDown size={16} className="text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent border-none text-xs font-bold focus:ring-0 outline-none p-0 pr-6"
            >
              <option value="dateDesc">日期(新)</option>
              <option value="dateAsc">日期(舊)</option>
              <option value="mileageAsc">里程(小)</option>
              <option value="mileageDesc">里程(大)</option>
            </select>
          </div>
        </div>

        {/* Filters Section */}
        <div className={`${showMobileFilters ? 'flex' : 'hidden lg:flex'} flex-col gap-6 mb-8 bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 animate-slide-up`}>
          <div className="flex flex-col lg:flex-row lg:items-center gap-5">
            <div className="flex items-center gap-2 text-gray-500 font-bold hidden lg:flex">
              <Filter size={20} />
              <span>篩選條件</span>
            </div>
            
            <div className="grid grid-cols-3 sm:flex gap-2 lg:border-r lg:border-gray-100 lg:pr-5">
              <button 
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all
                  ${filter === 'all' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}
              >
                全部
              </button>
              <button 
                onClick={() => setFilter('mainline')}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all
                  ${filter === 'mainline' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}
              >
                主線
              </button>
              <button 
                onClick={() => setFilter('ramp')}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all
                  ${filter === 'ramp' ? 'bg-amber-500 text-white shadow-md shadow-amber-100' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}
              >
                匝道
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex items-center gap-3 flex-1">
              <SearchableDropdown
                options={uniqueHighways}
                value={filterHighway}
                onChange={setFilterHighway}
                placeholder="國道..."
                allLabel="所有國道"
              />

              <SearchableDropdown
                options={uniqueDamages}
                value={filterDamage}
                onChange={setFilterDamage}
                placeholder="損壞狀況..."
                allLabel="所有損壞狀況"
              />

              {activeTab === 'assignments' && (
                <SearchableDropdown
                  options={uniqueAssignTypes}
                  value={filterAssignType}
                  onChange={setFilterAssignType}
                  placeholder="派工項目..."
                  allLabel="所有派工項目"
                />
              )}
              
              <div className="hidden lg:block h-8 w-px bg-gray-100 mx-1"></div>
              
              <div className="flex items-center gap-2 sm:col-span-2 lg:col-auto overflow-hidden">
                <div className="flex-1 relative group">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all"
                    title="開始日期"
                  />
                  {startDate && (
                    <button 
                      onClick={() => setStartDate('')}
                      className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <span className="text-gray-400 text-xs font-bold shrink-0">至</span>
                <div className="flex-1 relative group">
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all"
                    title="結束日期"
                  />
                  {endDate && (
                    <button 
                      onClick={() => setEndDate('')}
                      className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 sm:col-span-2 lg:col-auto">
                <div className="flex-1 relative group">
                  <input
                    type="text"
                    placeholder="起始里程 (如 181k)"
                    value={mileageStart}
                    onChange={e => setMileageStart(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder-gray-400"
                  />
                  {mileageStart && (
                    <button 
                      onClick={() => setMileageStart('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <span className="text-gray-400 text-xs font-bold shrink-0">至</span>
                <div className="flex-1 relative group">
                  <input
                    type="text"
                    placeholder="結束里程 (如 183k)"
                    value={mileageEnd}
                    onChange={e => setMileageEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder-gray-400"
                  />
                  {mileageEnd && (
                    <button 
                      onClick={() => setMileageEnd('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-2 border-l border-gray-100 pl-5">
              <ArrowUpDown size={16} className="text-gray-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none cursor-pointer"
              >
                <option value="dateDesc">日期 (新到舊)</option>
                <option value="dateAsc">日期 (舊到新)</option>
                <option value="mileageAsc">里程 (小到大)</option>
                <option value="mileageDesc">里程 (大到小)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600"></div>
          </div>
        ) : (
          <ReportList 
            reports={filteredAndSortedReports} 
            filter={filter}
            activeTab={activeTab}
            onDelete={handleDeleteReport}
            onBulkDelete={handleBulkDelete}
            onEdit={handleEditReport}
            onGetPhoto={getReportPhoto}
            onAssign={(id, type) => handleQuickUpdate(id, { assign_type: type, is_assigned_completed: false })}
            onToggleComplete={(id, completed, date) => handleQuickUpdate(id, { 
              is_assigned_completed: completed,
              completion_time: date !== undefined ? date : (completed ? undefined : '')
            })}
          />
        )}
      </main>

      {/* Form Modal */}
      {isFormOpen && (
        <ReportForm 
          initialData={editingReport || undefined}
          onSubmit={handleAddReport} 
          isSubmitting={isSubmitting}
          onGetPhoto={getReportPhoto}
          isAssignmentEditMode={activeTab === 'assignments'}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingReport(null);
          }} 
        />
      )}

      {/* Delete Confirm Modal */}
      {deletingReportId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {activeTab === 'assignments' ? '確定要取消此派工嗎？' : '確定要刪除這筆紀錄嗎？'}
            </h3>
            <p className="text-gray-500 mb-6">
              {activeTab === 'assignments' ? '取消派工不會刪除原始巡查紀錄。' : '刪除後將無法復原。'}
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeletingReportId(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                取消
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
              >
                {activeTab === 'assignments' ? '確定取消派工' : '確定刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
