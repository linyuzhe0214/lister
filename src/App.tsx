import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Filter, Search, ArrowUpDown, Download } from 'lucide-react';
import { format } from 'date-fns';
import { Report } from './types';
import { ReportForm } from './components/ReportForm';
import { ReportList } from './components/ReportList';
import { SearchableDropdown } from './components/SearchableDropdown';

export default function App() {
  const [reports, setReports] = useState<Report[]>([]);
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
  const [globalSearch, setGlobalSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // VITE_GAS_URL will be provided in .env
  const GAS_URL = import.meta.env.VITE_GAS_URL || '';

  // Load from cache initially
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
  }, [filter]);

  const fetchReports = async () => {
    if (!GAS_URL) {
      setLoading(false);
      return;
    }
    try {
      // If we already have cached data, don't show full loading spinner for a better experience
      if (reports.length === 0) setLoading(true);
      
      const res = await fetch(`${GAS_URL}?location_type=${filter}&include_photos=false`);
      const data = await res.json();
      const reportData = Array.isArray(data) ? data : [];
      
      setReports(reportData);
      localStorage.setItem('reports_cache', JSON.stringify(reportData));
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const getReportPhoto = async (id: number): Promise<string> => {
    if (!GAS_URL) return '';
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getPhoto', id }),
      });
      const data = await res.json();
      return data.photo || '';
    } catch (error) {
      console.error('Failed to fetch photo:', error);
      return '';
    }
  };

  const tabFilteredReports = useMemo(() => {
    if (activeTab === 'assignments') {
      return reports.filter(r => !!r.assign_type);
    }
    return reports;
  }, [reports, activeTab]);

  const uniqueHighways = useMemo(() => Array.from(new Set(tabFilteredReports.map(r => r.highway))).filter(Boolean), [tabFilteredReports]);
  const uniqueDamages = useMemo(() => Array.from(new Set(tabFilteredReports.map(r => r.damage_condition))).filter(Boolean), [tabFilteredReports]);
  const uniqueAssignTypes = useMemo(() => Array.from(new Set(reports.map(r => r.assign_type))).filter(Boolean) as string[], [reports]);

  // Helper function to parse mileage string (e.g. "174k+000", "181") into a number for precise sorting and filtering
  const parseMileage = (m: string) => {
    if (!m) return 0;
    const match = m.match(/(\d+)[kK]\+?(\d+)?/);
    if (match) {
      return parseInt(match[1] || '0') * 1000 + parseInt(match[2] || '0');
    }
    
    // If it's just a number like "181", treat it as "181k+000" (181000)
    const pureNumberMatch = m.match(/^\d+$/);
    if (pureNumberMatch) {
      return parseInt(m, 10) * 1000;
    }

    return parseFloat(m.replace(/[^\d.]/g, '')) || 0;
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
  }, [tabFilteredReports, filterHighway, filterDamage, filterAssignType, mileageStart, mileageEnd, sortBy, globalSearch, activeTab]);

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
        ? { action: 'assign', id, data: { assign_type: updatedReport.assign_type, is_assigned_completed: updatedReport.is_assigned_completed } }
        : { action: 'update', id, data: updatedReport };

      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      
      let resData = null;
      try {
        resData = await res.json();
      } catch (e) {
        // Handle opaque responses or non-json gracefully
      }

      if ((res.ok || res.type === 'opaque') && (!resData || !resData.error)) {
        localStorage.setItem('reports_cache', JSON.stringify(newReports));
      } else {
        // Rollback on error
        setReports(originalReports);
        alert('儲存失敗：' + (resData?.error || '請確定您的 Google Apps Script 已部署為「新版本」'));
      }
    } catch (err) {
      console.error('Failed to update report:', err);
      alert('更新失敗');
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

      const payload = isEditing 
        ? { action: 'update', id: editingReport.id, data }
        : { action: 'create', data };

      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      
      if (res.ok || res.type === 'opaque') {
        setEditingReport(null);
        // Refresh silently to get the real ID and updated list
        await fetchReports();
      } else {
        throw new Error('Response not OK');
      }
    } catch (error) {
      console.error('Failed to save report:', error);
      alert('儲存失敗，請稍後再試');
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
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: actionName, id: currentId }),
      });
      if (res.ok || res.type === 'opaque') {
        localStorage.setItem('reports_cache', JSON.stringify(reports.filter(r => r.id !== deletingReportId)));
      } else {
        throw new Error('Delete failed');
      }
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
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'bulkDelete', ids }),
      });
      if (res.ok || res.type === 'opaque') {
        const remainingReports = reports.filter(r => !ids.includes(r.id!));
        localStorage.setItem('reports_cache', JSON.stringify(remainingReports));
      } else {
        throw new Error('Bulk delete failed');
      }
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
              <h1 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight whitespace-nowrap hidden xs:block">國道巡查</h1>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="flex flex-col gap-4 mb-8 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-gray-500 font-medium mr-2">
              <Filter size={20} />
              <span>篩選</span>
            </div>
            <div className="flex gap-2 border-r border-gray-200 pr-4">
              <button 
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${filter === 'all' ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                全部
              </button>
              <button 
                onClick={() => setFilter('mainline')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${filter === 'mainline' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                主線
              </button>
              <button 
                onClick={() => setFilter('ramp')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${filter === 'ramp' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                匝道
              </button>
            </div>

            <div className="flex items-center gap-3">
              <SearchableDropdown
                options={uniqueHighways}
                value={filterHighway}
                onChange={setFilterHighway}
                placeholder="搜尋國道..."
                allLabel="所有國道"
              />

              <SearchableDropdown
                options={uniqueDamages}
                value={filterDamage}
                onChange={setFilterDamage}
                placeholder="搜尋損壞狀況..."
                allLabel="所有損壞狀況"
              />

              {activeTab === 'assignments' && (
                <SearchableDropdown
                  options={uniqueAssignTypes}
                  value={filterAssignType}
                  onChange={setFilterAssignType}
                  placeholder="搜尋派工項目..."
                  allLabel="所有派工項目"
                />
              )}

              <div className="flex items-center gap-1.5 sm:gap-2">
                <input
                  type="text"
                  placeholder="起始里程(如 181k+200)"
                  value={mileageStart}
                  onChange={e => setMileageStart(e.target.value)}
                  className="w-32 sm:w-40 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder-gray-400"
                />
                <span className="text-gray-400 text-sm font-medium">至</span>
                <input
                  type="text"
                  placeholder="結束里程(如 183k+200)"
                  value={mileageEnd}
                  onChange={e => setMileageEnd(e.target.value)}
                  className="w-32 sm:w-40 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder-gray-400"
                />
              </div>
            </div>

            <div className="flex-1"></div>

            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
              <ArrowUpDown size={16} className="text-gray-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'dateDesc' | 'dateAsc' | 'mileageAsc' | 'mileageDesc')}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
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
            onToggleComplete={(id, completed) => handleQuickUpdate(id, { is_assigned_completed: completed })}
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
