import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { MapPin, Trash2, Pencil, X, Camera, CheckSquare, Square, AlertCircle, Loader2 } from 'lucide-react';
import { Report } from '../types';
import { TableVirtuoso, Virtuoso } from 'react-virtuoso';
import { LazyPhoto } from './LazyPhoto';

interface ReportListProps {
  reports: Report[];
  filter: 'all' | 'mainline' | 'ramp';
  activeTab: 'reports' | 'assignments';
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onDelete: (id: number) => void;
  onBulkDelete: (ids: number[]) => void;
  onEdit: (report: Report) => void;
  onGetPhoto: (id: number) => Promise<string>;
  onAssign: (id: number, type: string) => void;
  onToggleComplete: (id: number, completed: boolean, date?: string) => void;
}

export function ReportList({ reports, filter, activeTab, hasMore, loadingMore, onLoadMore, onDelete, onBulkDelete, onEdit, onGetPhoto, onAssign, onToggleComplete }: ReportListProps) {
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastPanOffset = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [viewedIds, setViewedIds] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem('viewed_photo_ids');
      return raw ? new Set<number>(JSON.parse(raw)) : new Set<number>();
    } catch {
      return new Set<number>();
    }
  });
  const [assigningReportId, setAssigningReportId] = useState<number | null>(null);
  const [completingReportId, setCompletingReportId] = useState<number | null>(null);
  const [completionDate, setCompletionDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  const [scrollState, setScrollState] = useState({ left: false, right: false });

  const checkScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setScrollState({
      left: scrollLeft > 0,
      right: scrollLeft < scrollWidth - clientWidth - 1
    });
  }, []);

  const handleEndReached = () => {
    if (hasMore && !loadingMore && onLoadMore) {
      onLoadMore();
    }
  };

  const handlePreviewPhoto = async (report: Report) => {
    // Mark as viewed and persist
    if (report.id) {
      setViewedIds(prev => {
        const next = new Set(prev).add(report.id!);
        try { localStorage.setItem('viewed_photo_ids', JSON.stringify([...next])); } catch {}
        return next;
      });
    }

    if (report.photo) {
      setPreviewPhoto(report.photo);
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      return;
    }

    if (!report.id) return;

    try {
      setIsPreviewLoading(true);
      setPreviewPhoto('loading'); // open modal with spinner first
      const photo = await onGetPhoto(report.id);
      if (photo) {
        setPreviewPhoto(photo);
        setZoomScale(1);
        setPanOffset({ x: 0, y: 0 });
        report.photo = photo;
      } else {
        setPreviewPhoto(null);
        alert('無法載入照片');
      }
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const closePreview = useCallback(() => {
    setPreviewPhoto(null);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    lastPinchDist.current = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? 0.85 : 1.18;
    setZoomScale(prev => Math.min(Math.max(prev * delta, 0.5), 8));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoomScale <= 1) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX - lastPanOffset.current.x, y: e.clientY - lastPanOffset.current.y };
    e.currentTarget.setAttribute('data-dragging', 'true');
  }, [zoomScale]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const nx = e.clientX - dragStart.current.x;
    const ny = e.clientY - dragStart.current.y;
    lastPanOffset.current = { x: nx, y: ny };
    setPanOffset({ x: nx, y: ny });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    isDragging.current = false;
    e.currentTarget.removeAttribute('data-dragging');
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDist.current !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / lastPinchDist.current;
      lastPinchDist.current = dist;
      setZoomScale(prev => Math.min(Math.max(prev * ratio, 0.5), 8));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    lastPinchDist.current = null;
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.length === reports.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(reports.map(r => r.id!).filter(Boolean));
    }
  };

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`確定要刪除這 ${selectedIds.length} 筆紀錄嗎？`)) {
      onBulkDelete(selectedIds);
      setSelectedIds([]);
    }
  };

  const headerScrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isTableDragging = useRef(false);
  const tableStartX = useRef(0);
  const tableScrollLeftStart = useRef(0);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const target = e.currentTarget;
    if (target === scrollContainerRef.current && headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = target.scrollLeft;
    } else if (target === headerScrollRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = target.scrollLeft;
    }
    checkScroll(e);
  };

  const stopTableDragging = useCallback((e: React.MouseEvent) => {
    if (!isTableDragging.current) return;
    isTableDragging.current = false;
    const container = e.currentTarget as HTMLDivElement;
    if (container) {
      container.style.cursor = 'grab';
      container.style.removeProperty('user-select');
    }
  }, []);

  const handleTableMouseDown = useCallback((e: React.MouseEvent) => {
    // Only handle left click
    if (e.button !== 0) return;
    
    const container = e.currentTarget as HTMLDivElement;
    if (!container) return;
    
    isTableDragging.current = true;
    tableStartX.current = e.pageX - container.offsetLeft;
    tableScrollLeftStart.current = container.scrollLeft;
    container.style.cursor = 'grabbing';
    container.style.userSelect = 'none';
  }, []);

  const handleTableMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isTableDragging.current) return;
    
    const container = e.currentTarget as HTMLDivElement;
    if (!container) return;
    
    const x = e.pageX - container.offsetLeft;
    const walk = (x - tableStartX.current) * 1.5; // Scroll speed
    container.scrollLeft = tableScrollLeftStart.current - walk;
  }, []);

  const tableComponents = useMemo(() => ({
    Scroller: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
      <div
        {...props}
        ref={(node) => {
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as any).current = node;
        }}
        onMouseDown={handleTableMouseDown}
        onMouseMove={handleTableMouseMove}
        onMouseUp={stopTableDragging}
        onMouseLeave={stopTableDragging}
        className={`${props.className} custom-scrollbar`}
        style={{ ...props.style, cursor: 'grab' }}
      />
    )),
    Table: (props: any) => <table {...props} className="w-full text-left border-collapse min-w-[1200px]" />,
    TableHead: React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>((props, ref) => <thead {...props} ref={ref} className="bg-gray-50 text-sm font-medium text-gray-500 shadow-sm" />),
    TableRow: ({ item, context, ...props }: any) => {
      const report = item as Report;
      const { selectedIds, activeTab } = context;
      const isSelected = report.id ? selectedIds.includes(report.id) : false;
      const isCompleted = activeTab === 'assignments' && report.is_assigned_completed;
      let rowBg = 'hover:bg-gray-50/50';
      if (isSelected) rowBg = 'bg-indigo-50/30';
      else if (isCompleted) rowBg = 'bg-green-50/50 hover:bg-green-100/50';
      return <tr {...props} className={`transition-colors text-sm text-gray-800 ${rowBg}`} />;
    },
    TableBody: React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>((props, ref) => <tbody {...props} ref={ref} className="divide-y divide-gray-100" />),
  }), [handleTableMouseDown, handleTableMouseMove, stopTableDragging]);

  if (reports.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-500">
        <MapPin size={48} className="mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">尚無巡查紀錄</h3>
        <p>點擊右上角的「新增紀錄」開始建立</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selection Toolbar */}
      {selectedIds.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white px-2.5 py-1 rounded-full text-xs font-bold">
              {selectedIds.length} 已選
            </div>
            <span className="text-indigo-900 font-medium">個項目</span>
          </div>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl shadow-md transition-all active:scale-95 text-sm font-bold"
          >
            <Trash2 size={18} />
            批次刪除
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
        {/* Top Scrollbar (Visible on both PC and Mobile) */}
        <div 
          ref={headerScrollRef}
          onScroll={handleScroll}
          className="overflow-x-auto border-b border-gray-50 bg-gray-50/50 custom-scrollbar"
        >
          <div className="min-w-[1200px] h-3 sm:h-1.5"></div>
        </div>

        <div 
          className="hidden md:block h-[calc(100vh-240px)] w-full"
        >
          <TableVirtuoso
            data={reports}
            style={{ height: '100%', width: '100%' }}
            scrollerRef={(ref) => { scrollContainerRef.current = ref as HTMLDivElement; }}
            endReached={handleEndReached}
            onScroll={handleScroll}
            context={{ selectedIds, activeTab }}
            components={tableComponents}
            fixedHeaderContent={() => (
              <tr>
                <th className={`p-4 w-10 sticky top-0 left-0 bg-gray-50 z-40 shadow-[0_1px_0_0_#f3f4f6] ${scrollState.left ? 'shadow-left' : ''}`}>
                  <button 
                    onClick={toggleSelectAll}
                    className="text-gray-400 hover:text-indigo-600 transition-colors"
                  >
                    {selectedIds.length === reports.length && reports.length > 0 ? (
                      <CheckSquare size={20} className="text-indigo-600" />
                    ) : (
                      <Square size={20} />
                    )}
                  </button>
                </th>
                <th className="p-4 whitespace-nowrap bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">項次</th>
                <th className="p-4 whitespace-nowrap bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">登錄時間</th>
                <th className="p-4 whitespace-nowrap bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">位置類型</th>
                <th className="p-4 whitespace-nowrap bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">國道/方向</th>
                <th className="p-4 whitespace-nowrap bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">
                  {filter === 'mainline' ? '里程' : filter === 'ramp' ? '交流道名稱' : '里程/交流道名稱'}
                </th>
                <th className="p-4 whitespace-nowrap bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">
                  {filter === 'mainline' ? '車道' : filter === 'ramp' ? '出口/入口' : '車道/出入口'}
                </th>
                <th className="p-4 min-w-[150px] bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">損壞狀況</th>
                <th className="p-4 whitespace-nowrap bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">改善方式</th>
                <th className="p-4 whitespace-nowrap bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">監造審查</th>
                <th className="p-4 whitespace-nowrap bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">後續處理方式</th>
                {activeTab === 'assignments' && (
                  <>
                    <th className="p-4 whitespace-nowrap bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">派工項目</th>
                    <th className="p-4 whitespace-nowrap text-center bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">狀態</th>
                  </>
                )}
                <th className="p-4 whitespace-nowrap bg-gray-50 z-30 shadow-[0_1px_0_0_#f3f4f6]">完成時間</th>
                <th className={`p-4 whitespace-nowrap text-center sticky top-0 right-0 bg-gray-50 z-40 shadow-[0_1px_0_0_#f3f4f6] ${scrollState.right ? 'shadow-right' : ''}`}>操作 / 照片</th>
              </tr>
            )}
            itemContent={(index, report) => (
              <ReportRow 
                key={report.id}
                report={report}
                index={index}
                isSelected={selectedIds.includes(report.id!)}
                isViewed={report.id ? viewedIds.has(report.id) : false}
                activeTab={activeTab}
                filter={filter}
                scrollState={scrollState}
                toggleSelect={toggleSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                onAssign={onAssign}
                onToggleComplete={onToggleComplete}
                onPhotoClick={handlePreviewPhoto}
                onGetPhoto={onGetPhoto}
                setAssigningReportId={setAssigningReportId}
                setCompletingReportId={setCompletingReportId}
                setCompletionDate={setCompletionDate}
              />
            )}
          />
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden h-[calc(100vh-220px)] w-full">
          <Virtuoso
            data={reports}
            endReached={handleEndReached}
            itemContent={(index, report) => (
              <ReportCard
                key={report.id}
                report={report}
                index={index}
                isSelected={selectedIds.includes(report.id!)}
                isViewed={report.id ? viewedIds.has(report.id) : false}
                activeTab={activeTab}
                toggleSelect={toggleSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                onAssign={onAssign}
                onToggleComplete={onToggleComplete}
                onPhotoClick={handlePreviewPhoto}
                onGetPhoto={onGetPhoto}
                setAssigningReportId={setAssigningReportId}
                setCompletingReportId={setCompletingReportId}
                setCompletionDate={setCompletionDate}
              />
            )}
          />
        </div>
      </div>

      {hasMore && (
        <div className="flex justify-center mt-4">
          <button 
            onClick={onLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            {loadingMore ? <Loader2 size={18} className="animate-spin" /> : null}
            {loadingMore ? '載入中...' : '載入更多歷史紀錄'}
          </button>
        </div>
      )}

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div 
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          onClick={closePreview}
        >
          {/* Toolbar */}
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 backdrop-blur rounded-full px-4 py-2 z-10"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="text-white hover:text-indigo-300 transition-colors p-1.5 rounded-full hover:bg-white/10 text-lg font-bold leading-none"
              onClick={() => setZoomScale(prev => Math.min(prev * 1.3, 8))}
              title="放大"
            >+</button>
            <span className="text-white/70 text-sm min-w-[3rem] text-center">{Math.round(zoomScale * 100)}%</span>
            <button
              className="text-white hover:text-indigo-300 transition-colors p-1.5 rounded-full hover:bg-white/10 text-lg font-bold leading-none"
              onClick={() => setZoomScale(prev => Math.max(prev / 1.3, 0.5))}
              title="縮小"
            >−</button>
            <div className="w-px h-4 bg-white/30 mx-1" />
            <button
              className="text-white/70 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10 text-xs"
              onClick={() => { setZoomScale(1); setPanOffset({ x: 0, y: 0 }); lastPanOffset.current = { x: 0, y: 0 }; }}
              title="重置"
            >1:1</button>
          </div>

          {/* Close button */}
          <button 
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors p-2 bg-black/40 rounded-full z-10"
            onClick={closePreview}
          >
            <X size={24} />
          </button>

          {/* Image container */}
          <div
            className="w-full h-full flex items-center justify-center overflow-hidden"
            onClick={e => e.stopPropagation()}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ cursor: zoomScale > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'default' }}
          >
            {isPreviewLoading ? (
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600" />
            ) : (
              <img 
                src={previewPhoto!} 
                alt="照片預覽" 
                draggable={false}
                style={{
                  transform: `scale(${zoomScale}) translate(${panOffset.x / zoomScale}px, ${panOffset.y / zoomScale}px)`,
                  transition: isDragging.current ? 'none' : 'transform 0.15s ease',
                  maxWidth: '90vw',
                  maxHeight: '90vh',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                  userSelect: 'none',
                }}
              />
            )}
          </div>

          {/* Hint */}
          {zoomScale === 1 && !isPreviewLoading && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-xs">
              滾輪 / 雙指 縮放　縮放後可拖動
            </div>
          )}
        </div>
      )}

      {/* Assignment Modal */}
      {assigningReportId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setAssigningReportId(null)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900">選擇派工項目</h3>
            </div>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => { 
                  onAssign(assigningReportId, '冷料修補'); 
                  setAssigningReportId(null); 
                }} 
                className="w-full flex items-center justify-between px-5 py-4 bg-white border-2 border-blue-100 hover:border-blue-500 hover:bg-blue-50 text-blue-700 font-bold rounded-xl transition-all active:scale-[0.98] group"
              >
                <span>冷料修補</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 text-sm">選擇 →</span>
              </button>
              
              <button 
                onClick={() => { 
                  onAssign(assigningReportId, '熱料刨鋪'); 
                  setAssigningReportId(null); 
                }} 
                className="w-full flex items-center justify-between px-5 py-4 bg-white border-2 border-orange-100 hover:border-orange-500 hover:bg-orange-50 text-orange-700 font-bold rounded-xl transition-all active:scale-[0.98] group"
              >
                <span>熱料刨鋪</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-orange-500 text-sm">選擇 →</span>
              </button>
            </div>
            
            <p className="mt-4 text-xs text-gray-500 text-center">
              派工後此紀錄將會出現在「派工單」頁籤中
            </p>
          </div>
        </div>
      )}

      {/* Completion Modal */}
      {completingReportId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setCompletingReportId(null)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-green-50 text-green-600 rounded-xl">
                <CheckSquare size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900">標示為完成</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">完成日期</label>
                <input 
                  type="date" 
                  value={completionDate}
                  onChange={(e) => setCompletionDate(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
              
              <button 
                onClick={() => { 
                  onToggleComplete(completingReportId, true, completionDate); 
                  setCompletingReportId(null); 
                }} 
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-all active:scale-[0.98]"
              >
                確定完成
              </button>
            </div>
            
            <p className="mt-4 text-xs text-gray-500 text-center">
              此日期將直接連動更新至該筆巡查紀錄中
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const ReportRow = React.memo(({ 
  report, 
  index, 
  isSelected,
  isViewed,
  activeTab, 
  filter, 
  scrollState,
  toggleSelect, 
  onEdit, 
  onDelete, 
  onAssign, 
  onToggleComplete, 
  onPhotoClick,
  onGetPhoto,
  setAssigningReportId,
  setCompletingReportId,
  setCompletionDate
}: {
  report: Report;
  index: number;
  isSelected: boolean;
  isViewed: boolean;
  activeTab: string;
  filter: string;
  scrollState: { left: boolean; right: boolean };
  toggleSelect: (id: number) => void;
  onEdit: (report: Report) => void;
  onDelete: (id: number) => void;
  onAssign: (id: number, type: string) => void;
  onToggleComplete: (id: number, completed: boolean, date?: string) => void;
  onPhotoClick: (report: Report) => void;
  onGetPhoto: (id: number) => Promise<string>;
  setAssigningReportId: (id: number) => void;
  setCompletingReportId: (id: number) => void;
  setCompletionDate: (date: string) => void;
}) => {
  const isCompleted = activeTab === 'assignments' && report.is_assigned_completed;
  return (
    <>
      <td className={`p-4 sticky-left z-20 ${isSelected ? 'bg-indigo-50/30' : (isCompleted ? 'bg-green-50/50' : 'bg-white')} ${scrollState.left ? 'shadow-left' : ''}`}>
        <button 
          onClick={() => report.id && toggleSelect(report.id)}
          className="text-gray-400 hover:text-indigo-600 transition-colors"
        >
          {isSelected ? (
            <CheckSquare size={20} className="text-indigo-600" />
          ) : (
            <Square size={20} />
          )}
        </button>
      </td>
      <td className="p-4 font-medium text-gray-900">{index + 1}</td>
      <td className="p-4 whitespace-nowrap">{report.log_time ? (() => { try { return format(new Date(report.log_time), 'yyyy/MM/dd HH:mm'); } catch { return String(report.log_time); } })() : '-'}</td>
      <td className="p-4">
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium
          ${report.location_type === 'mainline' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
          {report.location_type === 'mainline' ? '主線' : '匝道'}
        </span>
      </td>
      <td className="p-4 whitespace-nowrap">{report.highway} {report.direction}</td>
      <td className="p-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          {report.mileage}
          {report.coordinates && (
            <button 
              onClick={() => window.open(`https://www.google.com/maps?q=${report.coordinates}`, '_blank')}
              className="text-indigo-600 hover:text-indigo-800 transition-colors"
              title="查看地圖位置"
            >
              <MapPin size={16} />
            </button>
          )}
        </div>
      </td>
      <td className="p-4 whitespace-nowrap">{report.lane}</td>
      <td className="p-4">{report.damage_condition}</td>
      <td className="p-4 whitespace-nowrap">{report.improvement_method}</td>
      <td className="p-4 whitespace-nowrap">{report.supervision_review || '-'}</td>
      <td className="p-4 whitespace-nowrap">{report.follow_up_method || '-'}</td>
      {activeTab === 'assignments' && (
        <>
          <td className="p-4 whitespace-nowrap">
            <span className={`font-bold ${report.assign_type === '熱料刨鋪' ? 'text-red-500' : report.assign_type === '冷料修補' ? 'text-blue-500' : 'text-indigo-700'}`}>
              {report.assign_type || '-'}
            </span>
          </td>
          <td className="p-4 whitespace-nowrap text-center">
            <button
              onClick={() => {
                if (report.id) {
                  if (report.is_assigned_completed) {
                    onToggleComplete(report.id, false);
                  } else {
                    setCompletingReportId(report.id);
                    setCompletionDate(format(new Date(), 'yyyy-MM-dd'));
                  }
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 ${
                report.is_assigned_completed 
                  ? 'bg-green-500 text-white hover:bg-green-600' 
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {report.is_assigned_completed ? '已完成' : '標示完成'}
            </button>
          </td>
        </>
      )}
      <td className="p-4 whitespace-nowrap">{report.completion_time ? (() => { try { return format(new Date(report.completion_time), 'yyyy/MM/dd HH:mm'); } catch { return String(report.completion_time); } })() : '-'}</td>
      <td className={`p-4 text-center sticky-right z-20 ${isSelected ? 'bg-indigo-50/30' : (isCompleted ? 'bg-green-50/50' : 'bg-white')} ${scrollState.right ? 'shadow-right' : ''}`}>
        <div className="flex items-center justify-center gap-1.5 sm:gap-2">
          {/* Photo Preview Button with LazyPhoto */}
          <LazyPhoto
            id={report.id}
            initialPhoto={report.photo}
            isViewed={isViewed}
            onGetPhoto={onGetPhoto}
            onClick={() => onPhotoClick(report)}
            className="w-9 h-9 rounded-lg border flex-shrink-0"
            badgeClassName="bottom-0.5 right-0.5 w-3.5 h-3.5"
          />

          <div className="w-px h-6 bg-gray-100 mx-0.5 hidden xs:block" />

          {activeTab === 'reports' ? (
            <>
              <button 
                onClick={() => report.id && setAssigningReportId(report.id)}
                className={`p-2 rounded-lg transition-colors flex items-center gap-1 flex-shrink-0 ${report.assign_type ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'}`}
                title={report.assign_type ? `已派工: ${report.assign_type}` : '派工'}
              >
                <AlertCircle size={18} />
              </button>
              <button 
                onClick={() => onEdit(report)}
                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex-shrink-0"
                title="編輯紀錄"
              >
                <Pencil size={18} />
              </button>
              <button 
                onClick={() => report.id && onDelete(report.id)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                title="刪除紀錄"
              >
                <Trash2 size={18} />
              </button>
            </>
          ) : (
            <button 
              onClick={() => report.id && onDelete(report.id)}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
              title="取消派工"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </td>
    </>
  );
});

ReportRow.displayName = 'ReportRow';

const ReportCard = React.memo(({ 
  report, 
  index, 
  isSelected,
  isViewed,
  activeTab, 
  toggleSelect, 
  onEdit, 
  onDelete, 
  onAssign, 
  onToggleComplete, 
  onPhotoClick,
  onGetPhoto,
  setAssigningReportId,
  setCompletingReportId,
  setCompletionDate
}: {
  report: Report;
  index: number;
  isSelected: boolean;
  isViewed: boolean;
  activeTab: string;
  toggleSelect: (id: number) => void;
  onEdit: (report: Report) => void;
  onDelete: (id: number) => void;
  onAssign: (id: number, type: string) => void;
  onToggleComplete: (id: number, completed: boolean, date?: string) => void;
  onPhotoClick: (report: Report) => void;
  onGetPhoto: (id: number) => Promise<string>;
  setAssigningReportId: (id: number) => void;
  setCompletingReportId: (id: number) => void;
  setCompletionDate: (date: string) => void;
}) => {
  const isCompleted = activeTab === 'assignments' && report.is_assigned_completed;
  
  return (
    <div className={`p-4 transition-all ${isSelected ? 'bg-indigo-50/50' : (isCompleted ? 'bg-green-50/30' : 'bg-white')} border-b border-gray-50 active:bg-gray-50`}>
      <div className="flex items-start gap-4">
        {/* Photo Thumbnail */}
        <LazyPhoto
          id={report.id}
          initialPhoto={report.photo}
          isViewed={isViewed}
          onGetPhoto={onGetPhoto}
          onClick={() => onPhotoClick(report)}
          className="w-24 h-24 rounded-2xl border-2 shrink-0 shadow-sm"
          badgeClassName="bottom-1 right-1 w-5 h-5"
        />

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-indigo-400">#{index + 1}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider
                ${report.location_type === 'mainline' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                {report.location_type === 'mainline' ? '主線' : '匝道'}
              </span>
            </div>
            <button 
              onClick={() => report.id && toggleSelect(report.id)}
              className="text-gray-300"
            >
              {isSelected ? <CheckSquare size={22} className="text-indigo-600" /> : <Square size={22} />}
            </button>
          </div>

          <h4 className="font-bold text-gray-900 truncate mb-0.5">
            {report.highway} {report.direction}
          </h4>
          <p className="text-sm text-gray-600 font-medium flex items-center gap-1.5">
            <MapPin size={14} className="text-indigo-500" />
            {report.mileage} · {report.lane}
          </p>
          
          <div className="mt-3 flex flex-wrap gap-1.5">
            <div className="px-2.5 py-1 bg-gray-100 rounded-lg text-[11px] font-bold text-gray-700">
              {report.damage_condition}
            </div>
            {report.assign_type && (
              <div className={`px-2.5 py-1 rounded-lg text-[11px] font-bold 
                ${report.assign_type === '熱料刨鋪' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                {report.assign_type}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
        <span className="text-[11px] text-gray-400 font-medium">
          {report.log_time ? format(new Date(report.log_time), 'yyyy/MM/dd HH:mm') : '-'}
        </span>
        
        <div className="flex items-center gap-1">
          {activeTab === 'assignments' ? (
            <button
              onClick={() => {
                if (report.id) {
                  if (report.is_assigned_completed) {
                    onToggleComplete(report.id, false);
                  } else {
                    setCompletingReportId(report.id);
                    setCompletionDate(format(new Date(), 'yyyy-MM-dd'));
                  }
                }
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm ${
                report.is_assigned_completed 
                  ? 'bg-green-500 text-white' 
                  : 'bg-white border border-gray-200 text-gray-700'
              }`}
            >
              {report.is_assigned_completed ? '已完成' : '標示完成'}
            </button>
          ) : (
            <>
              <button 
                onClick={() => report.id && setAssigningReportId(report.id)}
                className="p-2.5 text-gray-400 hover:text-indigo-600 rounded-xl"
              >
                <AlertCircle size={20} />
              </button>
              <button 
                onClick={() => onEdit(report)}
                className="p-2.5 text-gray-400 hover:text-indigo-600 rounded-xl"
              >
                <Pencil size={20} />
              </button>
            </>
          )}
          <button 
            onClick={() => report.id && onDelete(report.id)}
            className="p-2.5 text-gray-400 hover:text-red-500 rounded-xl"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>
    </div>
  );
});

ReportCard.displayName = 'ReportCard';
