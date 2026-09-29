import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, Filter, Search, ArrowUpDown, Download, X, Layers, Activity, FileSpreadsheet, FileText, CheckCircle2, Clock, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { Report } from './types';
import { ReportForm } from './components/ReportForm';
import { ReportList } from './components/ReportList';
import { SearchableDropdown } from './components/SearchableDropdown';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeForExcel(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

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
  
  const [limit, setLimit] = useState(500);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // VITE_GAS_URL will be provided in .env
  const GAS_URL = import.meta.env.VITE_GAS_URL || '';

  // Load from cache initially
  // Only fetch once on mount — filter switching is instant via useMemo
  useEffect(() => {
    const cachedData = localStorage.getItem('reports_cache');
    if (cachedData) {
      // Async parse to prevent blocking main thread frame
      setTimeout(() => {
        try {
          setReports(JSON.parse(cachedData));
          setLoading(false);
        } catch (e) {
          console.error('Failed to parse cache');
        }
      }, 0);
    }
    console.log("GAS_URL Status:", GAS_URL ? "Configured" : "NOT CONFIGURED! Check .env");
    fetchReports(500);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchReports = async (currentLimit: number, isLoadMore = false) => {
    if (!GAS_URL) {
      setLoading(false);
      return;
    }
    try {
      if (isLoadMore) {
        setLoadingMore(true);
      } else if (reports.length === 0 && !localStorage.getItem('reports_cache')) {
        setLoading(true);
      }
      
      const timestamp = new Date().getTime();
      const res = await fetch(`${GAS_URL}?location_type=all&include_photos=false&limit=${currentLimit}&_t=${timestamp}`);
      const data = await res.json();
      const reportData = Array.isArray(data) ? data : [];
      
      setReports(reportData);
      setHasMore(reportData.length >= currentLimit);

      setTimeout(() => {
        try {
          localStorage.setItem('reports_cache', JSON.stringify(reportData));
        } catch (e) {
          console.warn('localStorage quota exceeded, clearing cache');
          localStorage.removeItem('reports_cache');
        }
      }, 0);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    const nextLimit = limit + 500;
    setLimit(nextLimit);
    fetchReports(nextLimit, true);
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

  const stats = useMemo(() => {
    const total = reports.length;
    const mainlineCount = reports.filter(r => r.location_type === 'mainline').length;
    const rampCount = reports.filter(r => r.location_type === 'ramp').length;
    const assignedCount = reports.filter(r => Boolean(r.assign_type)).length;
    const completedCount = reports.filter(r => r.is_assigned_completed).length;
    const pendingCount = assignedCount - completedCount;
    return {
      total,
      mainlineCount,
      rampCount,
      assignedCount,
      completedCount,
      pendingCount: Math.max(0, pendingCount)
    };
  }, [reports]);

  const hasActiveFilters = useMemo(() => {
    return filter !== 'all' ||
      filterHighway !== 'all' ||
      filterDamage !== 'all' ||
      filterAssignType !== 'all' ||
      mileageStart !== '' ||
      mileageEnd !== '' ||
      startDate !== '' ||
      endDate !== '' ||
      globalSearch !== '';
  }, [filter, filterHighway, filterDamage, filterAssignType, mileageStart, mileageEnd, startDate, endDate, globalSearch]);

  const resetFilters = useCallback(() => {
    setFilter('all');
    setFilterHighway('all');
    setFilterDamage('all');
    setFilterAssignType('all');
    setMileageStart('');
    setMileageEnd('');
    setStartDate('');
    setEndDate('');
    setGlobalSearch('');
  }, []);

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
      await fetchReports(limit);
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
      fetchReports(limit); // Revert on failure
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
        <th>座標</th>
        <th>里程/車道</th>
        <th>損壞狀況</th>
        <th>改善方式</th>
        <th>後續處理方式</th>
        <th>完成時間</th>
        ${activeTab === 'assignments' ? '<th>派工項目</th><th>完成狀態</th>' : ''}
        <th class="photo-cell">現場照片</th>
      </tr>
    </thead>
    <tbody>
      ${exportData.map((report, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(format(new Date(report.log_time), 'yyyy/MM/dd HH:mm'))}</td>
          <td>${report.location_type === 'mainline' ? '主線' : '匝道'}<br>${escapeHtml(report.highway)} ${escapeHtml(report.direction)}</td>
          <td>${escapeHtml(report.coordinates) || '-'}</td>
          <td>${escapeHtml(report.mileage)}<br>${escapeHtml(report.lane)}</td>
          <td>${escapeHtml(report.damage_condition)}</td>
          <td>${escapeHtml(report.improvement_method)}</td>
          <td>${escapeHtml(report.follow_up_method) || '-'}</td>
          <td>${report.completion_time ? escapeHtml(format(new Date(report.completion_time), 'yyyy/MM/dd HH:mm')) : '-'}</td>
          ${activeTab === 'assignments' ? `
            <td>${escapeHtml(report.assign_type) || '-'}</td>
            <td>${report.is_assigned_completed ? '已完成' : '未完成'}</td>
          ` : ''}
          <td class="photo-cell">
            ${report.photo && (report.photo.startsWith('data:image/') || report.photo.startsWith('https://')) ? `<img src="${report.photo}" alt="照片">` : '無照片'}
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

  const exportToExcel = async () => {
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

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('巡查紀錄');

      const baseHeaders = [
        '項次', '登錄時間', '位置類型', '國道', '方向', '座標', '里程/交流道名稱', 
        '車道/出入口', '損壞狀況', '改善方式', '監造審查', '後續處理方式', '完成時間'
      ];
      
      const hasAssignments = activeTab === 'assignments';
      const headers = hasAssignments 
        ? [...baseHeaders, '派工項目', '完成狀態', '現場照片'] 
        : [...baseHeaders, '現場照片'];

      // Add headers
      worksheet.addRow(headers);
      worksheet.getRow(1).font = { bold: true };
      
      // Setup column widths
      worksheet.columns = headers.map((h) => {
        if (h === '現場照片') return { width: 30 };
        if (h === '登錄時間' || h === '完成時間') return { width: 20 };
        if (h === '座標' || h === '里程/交流道名稱') return { width: 20 };
        if (h === '改善方式' || h === '損壞狀況' || h === '後續處理方式') return { width: 25 };
        return { width: 15 };
      });

      // Add data rows
      exportData.forEach((report, index) => {
        const rowData = [
          index + 1,
          format(new Date(report.log_time), 'yyyy/MM/dd HH:mm'),
          report.location_type === 'mainline' ? '主線' : '匝道',
          sanitizeForExcel(report.highway || ''),
          sanitizeForExcel(report.direction || ''),
          sanitizeForExcel(report.coordinates || ''),
          sanitizeForExcel(report.mileage || ''),
          sanitizeForExcel(report.lane || ''),
          sanitizeForExcel(report.damage_condition || ''),
          sanitizeForExcel(report.improvement_method || ''),
          sanitizeForExcel(report.supervision_review || ''),
          sanitizeForExcel(report.follow_up_method || ''),
          report.completion_time ? format(new Date(report.completion_time), 'yyyy/MM/dd HH:mm') : ''
        ];

        if (hasAssignments) {
          rowData.push(sanitizeForExcel(report.assign_type || ''));
          rowData.push(report.is_assigned_completed ? '已完成' : '未完成');
        }

        const row = worksheet.addRow(rowData);
        row.height = 100;
        
        // Add image if exists
        if (report.photo && report.photo.startsWith('data:image')) {
          try {
            const imgColIdx = headers.indexOf('現場照片');
            const imageId = workbook.addImage({
              base64: report.photo,
              extension: report.photo.includes('png') ? 'png' : 'jpeg',
            });
            worksheet.addImage(imageId, {
              tl: { col: imgColIdx, row: row.number - 1 },
              ext: { width: 120, height: 90 },
              editAs: 'oneCell'
            });
          } catch (e) {
            console.error('Failed to add image to excel', e);
          }
        }
      });
      
      // Vertical align all cells to middle
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const title = `巡查紀錄匯出_${format(new Date(), 'yyyyMMdd_HHmm')}`;
      saveAs(new Blob([buffer]), `${title}.xlsx`);
      
    } catch (error) {
      console.error('Export failed:', error);
      alert('匯出 Excel 發生錯誤');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/50 to-slate-50 font-sans text-slate-800">
      {/* Header */}
      <header className="glass-panel sticky top-0 z-40 border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 sm:h-20 gap-3 sm:gap-4">
            {/* Brand Logo & Title */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="bg-gradient-to-tr from-indigo-600 via-blue-600 to-cyan-500 text-white p-2.5 rounded-2xl shadow-md shadow-indigo-500/20 ring-1 ring-white/30">
                <ShieldCheck size={22} className="sm:w-6 sm:h-6" />
              </div>
              <div className="hidden sm:block">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight whitespace-nowrap">
                    國道巡查工程
                  </h1>
                  <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-2 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
                    Pro
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-semibold tracking-wide">道路養護與派工管理中心</p>
              </div>
            </div>
            
            {/* Search Input */}
            <div className="flex-1 max-w-md">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Search size={16} className="text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                </div>
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="搜尋公路、損壞、項目、里程..."
                  className="block w-full pl-10 pr-9 py-2 sm:py-2.5 border border-slate-200/90 rounded-2xl bg-white/80 hover:bg-white placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-xs sm:text-sm font-medium transition-all shadow-2xs"
                />
                {globalSearch && (
                  <button
                    onClick={() => setGlobalSearch('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
              <button 
                onClick={exportToExcel}
                disabled={isExporting}
                className="p-2 sm:px-3.5 sm:py-2.5 bg-white border border-slate-200/90 hover:border-emerald-300 hover:bg-emerald-50/40 text-slate-700 hover:text-emerald-700 rounded-xl shadow-2xs transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 text-xs sm:text-sm font-semibold cursor-pointer"
                title="匯出 Excel 報表"
              >
                {isExporting ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-emerald-200 border-t-emerald-600" /> : <FileSpreadsheet size={16} className="text-emerald-600" />}
                <span className="hidden md:inline">匯出 Excel</span>
              </button>
              <button 
                onClick={exportToHTML}
                disabled={isExporting}
                className="p-2 sm:px-3.5 sm:py-2.5 bg-white border border-slate-200/90 hover:border-rose-300 hover:bg-rose-50/40 text-slate-700 hover:text-rose-700 rounded-xl shadow-2xs transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 text-xs sm:text-sm font-semibold cursor-pointer"
                title="匯出含照片報表 (PDF/HTML)"
              >
                {isExporting ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-rose-200 border-t-rose-600" /> : <FileText size={16} className="text-rose-500" />}
                <span className="hidden md:inline">{isExporting ? '載入中' : '匯出 PDF'}</span>
              </button>
              <button 
                onClick={() => {
                  setEditingReport(null);
                  setIsFormOpen(true);
                }}
                className="p-2 sm:px-4 sm:py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl shadow-md shadow-indigo-500/25 transition-all active:scale-95 flex items-center gap-1.5 font-bold text-xs sm:text-sm cursor-pointer"
              >
                <Plus size={18} />
                <span className="hidden md:inline">新增查報</span>
              </button>
            </div>
          </div>
          
          {/* Navigation Tabs */}
          <div className="flex gap-2 pb-2.5 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'reports' 
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25 ring-1 ring-indigo-500' 
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Layers size={15} />
              <span>巡查紀錄</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${activeTab === 'reports' ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {reports.length}
              </span>
            </button>
            <button 
              onClick={() => setActiveTab('assignments')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'assignments' 
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25 ring-1 ring-indigo-500' 
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Activity size={15} />
              <span>派工管理</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                activeTab === 'assignments' 
                  ? 'bg-white/25 text-white' 
                  : stats.pendingCount > 0 
                    ? 'bg-amber-100 text-amber-700' 
                    : 'bg-slate-100 text-slate-600'
              }`}>
                {stats.assignedCount}
              </span>
              {stats.pendingCount > 0 && activeTab !== 'assignments' && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        {/* KPI Dashboard Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mb-5">
          <div className="glass-card p-3.5 rounded-2xl shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-semibold text-slate-500">查報總量</span>
              <Layers size={14} className="text-indigo-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{stats.total}</div>
          </div>
          <div className="glass-card p-3.5 rounded-2xl shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-semibold text-slate-500">主線路段</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-100">主線</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-sky-700 tracking-tight">{stats.mainlineCount}</div>
          </div>
          <div className="glass-card p-3.5 rounded-2xl shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-semibold text-slate-500">匝道 / 出入口</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100">匝道</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-600 tracking-tight">{stats.rampCount}</div>
          </div>
          <div className="glass-card p-3.5 rounded-2xl shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-semibold text-slate-500">已派工待辦</span>
              <Clock size={14} className="text-orange-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-orange-600 tracking-tight">{stats.pendingCount}</div>
          </div>
          <div className="col-span-2 sm:col-span-4 lg:col-span-1 glass-card p-3.5 rounded-2xl shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-semibold text-slate-500">派工已完成</span>
              <CheckCircle2 size={14} className="text-emerald-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 tracking-tight">{stats.completedCount}</div>
          </div>
        </div>

        {/* Mobile Filter Toggle */}
        <div className="flex lg:hidden items-center justify-between mb-4 gap-3">
          <button 
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border transition-all font-bold text-xs sm:text-sm cursor-pointer ${showMobileFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-700 shadow-2xs'}`}
          >
            <Filter size={16} />
            {showMobileFilters ? '隱藏篩選器' : '開啟篩選器'}
          </button>
          
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-2xs">
            <ArrowUpDown size={14} className="text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 outline-none p-0 pr-4 cursor-pointer"
            >
              <option value="dateDesc">日期 (新)</option>
              <option value="dateAsc">日期 (舊)</option>
              <option value="mileageAsc">里程 (小)</option>
              <option value="mileageDesc">里程 (大)</option>
            </select>
          </div>
        </div>

        {/* Filters Section */}
        <div className={`${showMobileFilters ? 'flex' : 'hidden lg:flex'} flex-col gap-3 mb-6 bg-white/95 backdrop-blur-md p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-200/80 animate-slide-up sticky top-[106px] sm:top-[128px] z-30`}>
          {/* Row 1: Type buttons + Dropdowns + Sort */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex items-center gap-2 text-slate-400 font-bold hidden lg:flex shrink-0">
              <Filter size={16} className="text-indigo-600" />
              <span className="text-xs text-slate-600 font-bold">過濾</span>
            </div>

            <div className="flex gap-1.5 shrink-0 bg-slate-100/80 p-1 rounded-xl">
              <button 
                onClick={() => setFilter('all')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filter === 'all' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                全部
              </button>
              <button 
                onClick={() => setFilter('mainline')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filter === 'mainline' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                主線
              </button>
              <button 
                onClick={() => setFilter('ramp')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filter === 'ramp' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                匝道
              </button>
            </div>

            <div className="h-px lg:h-6 lg:w-px bg-slate-200 shrink-0" />

            <div className="flex flex-wrap lg:flex-nowrap items-center gap-2.5 flex-1">
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

              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 border border-slate-200/80 hover:border-rose-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
                  title="清除所有篩選條件"
                >
                  <RotateCcw size={13} />
                  <span>重設篩選</span>
                </button>
              )}
            </div>

            <div className="hidden lg:flex items-center gap-2 border-l border-slate-200 pl-3 shrink-0">
              <ArrowUpDown size={14} className="text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none cursor-pointer transition-all"
              >
                <option value="dateDesc">日期 (新到舊)</option>
                <option value="dateAsc">日期 (舊到新)</option>
                <option value="mileageAsc">里程 (小到大)</option>
                <option value="mileageDesc">里程 (大到小)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Date range + Mileage range */}
          <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs font-bold text-slate-400 shrink-0 w-14">登錄日期</span>
              <div className="flex-1 relative">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all"
                  title="開始日期"
                />
                {startDate && (
                  <button 
                    onClick={() => setStartDate('')}
                    className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <span className="text-slate-400 text-xs font-bold shrink-0">至</span>
              <div className="flex-1 relative">
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all"
                  title="結束日期"
                />
                {endDate && (
                  <button 
                    onClick={() => setEndDate('')}
                    className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="hidden sm:block w-px bg-slate-200 shrink-0" />

            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs font-bold text-slate-400 shrink-0 w-14">里程範圍</span>
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="起始里程 (如 181k)"
                  value={mileageStart}
                  onChange={e => setMileageStart(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder-slate-400"
                />
                {mileageStart && (
                  <button 
                    onClick={() => setMileageStart('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <span className="text-slate-400 text-xs font-bold shrink-0">至</span>
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="結束里程 (如 183k)"
                  value={mileageEnd}
                  onChange={e => setMileageEnd(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder-slate-400"
                />
                {mileageEnd && (
                  <button 
                    onClick={() => setMileageEnd('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col justify-center items-center h-64 gap-3 bg-white/70 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-indigo-200 border-t-indigo-600" />
            <span className="text-xs font-semibold text-slate-500">正在同步雲端巡查資料庫...</span>
          </div>
        ) : (
          <ReportList 
            reports={filteredAndSortedReports} 
            filter={filter}
            activeTab={activeTab}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
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
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-slide-up">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 relative">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              {activeTab === 'assignments' ? '確定要取消此派工嗎？' : '確定要刪除這筆紀錄嗎？'}
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              {activeTab === 'assignments' ? '取消派工不會刪除原始巡查紀錄，可隨時重新派工。' : '刪除後將從資料庫中永久移除，無法復原。'}
            </p>
            <div className="flex justify-end gap-2.5">
              <button 
                onClick={() => setDeletingReportId(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                取消
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-sm shadow-rose-500/20 transition-all cursor-pointer active:scale-95"
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
