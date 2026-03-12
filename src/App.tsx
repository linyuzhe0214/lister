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
  const [filter, setFilter] = useState<'all' | 'mainline' | 'ramp'>('all');
  const [sortByDate, setSortByDate] = useState<'desc' | 'asc'>('desc');
  const [filterHighway, setFilterHighway] = useState<string>('all');
  const [filterDamage, setFilterDamage] = useState<string>('all');
  const [globalSearch, setGlobalSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // VITE_GAS_URL will be provided in .env
  const GAS_URL = import.meta.env.VITE_GAS_URL || '';

  useEffect(() => {
    console.log("GAS_URL Status:", GAS_URL ? "Configured" : "NOT CONFIGURED! Check .env");
    fetchReports();
  }, [filter]);

  const fetchReports = async () => {
    if (!GAS_URL) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`${GAS_URL}?location_type=${filter}`);
      const data = await res.json();
      // Ensure data is array (in case of error message format)
      setReports(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const uniqueHighways = useMemo(() => Array.from(new Set(reports.map(r => r.highway))).filter(Boolean), [reports]);
  const uniqueDamages = useMemo(() => Array.from(new Set(reports.map(r => r.damage_condition))).filter(Boolean), [reports]);

  const filteredAndSortedReports = useMemo(() => {
    let result = [...reports];

    if (filterHighway !== 'all') {
      result = result.filter(r => r.highway === filterHighway);
    }

    if (filterDamage !== 'all') {
      result = result.filter(r => r.damage_condition === filterDamage);
    }

    if (globalSearch.trim() !== '') {
      const searchLower = globalSearch.toLowerCase();
      result = result.filter(r => 
        (r.highway && r.highway.toLowerCase().includes(searchLower)) ||
        (r.direction && r.direction.toLowerCase().includes(searchLower)) ||
        (r.damage_condition && r.damage_condition.toLowerCase().includes(searchLower)) ||
        (r.improvement_method && r.improvement_method.toLowerCase().includes(searchLower)) ||
        (r.mileage && r.mileage.toLowerCase().includes(searchLower)) ||
        (r.lane && r.lane.toLowerCase().includes(searchLower))
      );
    }

    result.sort((a, b) => {
      const dateA = new Date(a.log_time).getTime();
      const dateB = new Date(b.log_time).getTime();
      return sortByDate === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [reports, filterHighway, filterDamage, sortByDate]);

  const handleAddReport = async (data: Report) => {
    if (!GAS_URL) {
      alert('請先在 .env 設定您的 Google Apps Script 網址 (VITE_GAS_URL)');
      return;
    }
    try {
      const isEditing = !!editingReport;
      const payload = isEditing 
        ? { action: 'update', id: editingReport.id, data }
        : { action: 'create', data };

      const res = await fetch(GAS_URL, {
        method: 'POST',
        // Use text/plain to bypass CORS preflight
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      
      if (res.ok || res.type === 'opaque') {
        setIsFormOpen(false);
        setEditingReport(null);
        fetchReports();
      } else {
        throw new Error('Response not OK');
      }
    } catch (error) {
      console.error('Failed to save report:', error);
      alert('儲存失敗，請稍後再試');
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
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete', id: deletingReportId }),
      });
      if (res.ok || res.type === 'opaque') {
        fetchReports();
      }
    } catch (error) {
      console.error('Failed to delete report:', error);
      alert('刪除失敗');
    } finally {
      setDeletingReportId(null);
    }
  };

  const exportToCSV = () => {
    if (filteredAndSortedReports.length === 0) {
      alert('沒有資料可供匯出');
      return;
    }

    const headers = [
      '項次', '登錄時間', '位置類型', '國道', '方向', '里程/交流道名稱', 
      '車道/出入口', '損壞狀況', '改善方式', '監造審查', '後續處理方式', '完成時間'
    ];

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
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 text-white p-2 rounded-lg shadow-sm">
                <Search size={24} />
              </div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight whitespace-nowrap">國道巡查紀錄系統</h1>
            </div>
            
            <div className="flex-1 max-w-md mx-8">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="搜尋國道、方向、里程/交流道、損壞狀況..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-xl leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={exportToCSV}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl shadow-sm transition-all active:scale-95"
                title="匯出為 CSV"
              >
                <Download size={18} />
                匯出
              </button>
              <button 
                onClick={() => {
                  setEditingReport(null);
                  setIsFormOpen(true);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-sm transition-all active:scale-95"
              >
                <Plus size={18} />
                新增紀錄
              </button>
            </div>
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
            </div>

            <div className="flex-1"></div>

            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
              <ArrowUpDown size={16} className="text-gray-400" />
              <select
                value={sortByDate}
                onChange={(e) => setSortByDate(e.target.value as 'desc' | 'asc')}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="desc">日期 (新到舊)</option>
                <option value="asc">日期 (舊到新)</option>
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
          <ReportList reports={filteredAndSortedReports} filter={filter} onDelete={handleDeleteReport} onEdit={handleEditReport} />
        )}
      </main>

      {/* Form Modal */}
      {isFormOpen && (
        <ReportForm 
          initialData={editingReport || undefined}
          onSubmit={handleAddReport} 
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
            <h3 className="text-lg font-bold text-gray-900 mb-2">確定要刪除這筆紀錄嗎？</h3>
            <p className="text-gray-500 mb-6">刪除後將無法復原。</p>
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
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
