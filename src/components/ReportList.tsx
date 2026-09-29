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
    Table: (props: any) => <table {...props} className="w-full text-left border-collapse min-w-[1250px]" />,
    TableHead: React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>((props, ref) => (
      <thead {...props} ref={ref} className="bg-slate-50/95 backdrop-blur-md text-[11px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200/90 shadow-2xs" />
    )),
    TableRow: ({ item, context, ...props }: any) => {
      const report = item as Report;
      const { selectedIds, activeTab } = context;
      const isSelected = report.id ? selectedIds.includes(report.id) : false;
      const isCompleted = activeTab === 'assignments' && report.is_assigned_completed;
      let rowBg = 'hover:bg-slate-50/70';
      if (isSelected) rowBg = 'bg-indigo-50/50';
      else if (isCompleted) rowBg = 'bg-emerald-50/40 hover:bg-emerald-50/70';
      return <tr {...props} className={`transition-colors text-xs font-medium text-slate-800 border-b border-slate-100 ${rowBg}`} />;
    },
    TableBody: React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>((props, ref) => (
      <tbody {...props} ref={ref} className="divide-y divide-slate-100/90" />
    )),
  }), [handleTableMouseDown, handleTableMouseMove, stopTableDragging]);

  if (reports.length === 0) {
    return (
      <div className="glass-card rounded-3xl p-12 text-center text-slate-500 shadow-2xs border border-slate-200/80 my-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-500 flex items-center justify-center mx-auto mb-4 shadow-2xs">
          <MapPin size={32} />
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">查無符合條件的巡查紀錄</h3>
        <p className="text-xs text-slate-400">請嘗試清除篩選條件，或點選右上角「新增查報」建立新紀錄</p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Selection Toolbar */}
      {selectedIds.length > 0 && (
        <div className="glass-panel bg-indigo-50/90 border border-indigo-200/80 rounded-2xl p-3.5 flex items-center justify-between shadow-xs animate-slide-up">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-full text-xs font-extrabold shadow-2xs">
              {selectedIds.length} 已選取
            </div>
            <span className="text-xs text-indigo-900 font-semibold">筆項目</span>
          </div>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-all active:scale-95 text-xs font-bold cursor-pointer"
          >
            <Trash2 size={15} />
            批次刪除
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden relative">
        {/* Top Scrollbar (Visible on both PC and Mobile) */}
        <div 
          ref={headerScrollRef}
          onScroll={handleScroll}
          className="overflow-x-auto border-b border-slate-100 bg-slate-50/60 custom-scrollbar"
        >
          <div className="min-w-[1250px] h-2.5 sm:h-1.5"></div>
        </div>

        <div 
          className="hidden md:block h-[calc(100vh-250px)] w-full"
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
                <th className={`p-3.5 w-12 sticky top-0 left-0 bg-slate-50/95 backdrop-blur-md z-40 border-b border-slate-200/90 shadow-[0_1px_0_0_#e2e8f0] ${scrollState.left ? 'shadow-left' : ''}`}>
                  <button 
                    onClick={toggleSelectAll}
                    className="text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                  >
                    {selectedIds.length === reports.length && reports.length > 0 ? (
                      <CheckSquare size={18} className="text-indigo-600" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
                <th className="p-3.5 whitespace-nowrap bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">項次</th>
                <th className="p-3.5 whitespace-nowrap bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">登錄時間</th>
                <th className="p-3.5 whitespace-nowrap bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">位置類型</th>
                <th className="p-3.5 whitespace-nowrap bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">國道/方向</th>
                <th className="p-3.5 whitespace-nowrap bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">
                  {filter === 'mainline' ? '里程' : filter === 'ramp' ? '交流道名稱' : '里程/交流道名稱'}
                </th>
                <th className="p-3.5 whitespace-nowrap bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">
                  {filter === 'mainline' ? '車道' : filter === 'ramp' ? '出口/入口' : '車道/出入口'}
                </th>
                <th className="p-3.5 min-w-[150px] bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">損壞狀況</th>
                <th className="p-3.5 whitespace-nowrap bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">改善方式</th>
                <th className="p-3.5 whitespace-nowrap bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">監造審查</th>
                <th className="p-3.5 whitespace-nowrap bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">後續處理方式</th>
                {activeTab === 'assignments' && (
                  <>
                    <th className="p-3.5 whitespace-nowrap bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">派工項目</th>
                    <th className="p-3.5 whitespace-nowrap text-center bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">狀態</th>
                  </>
                )}
                <th className="p-3.5 whitespace-nowrap bg-slate-50/95 backdrop-blur-md z-30 border-b border-slate-200/90">完成時間</th>
                <th className={`p-3.5 whitespace-nowrap text-center sticky top-0 right-0 bg-slate-50/95 backdrop-blur-md z-40 border-b border-slate-200/90 shadow-[0_1px_0_0_#e2e8f0] ${scrollState.right ? 'shadow-right' : ''}`}>操作 / 照片</th>
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
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-slide-up">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm relative border border-slate-100">
            <button 
              onClick={() => setAssigningReportId(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">選擇派工項目</h3>
                <p className="text-xs text-slate-400 font-medium">指派後將自動同步至派工單</p>
              </div>
            </div>
            
            <div className="flex flex-col gap-2.5">
              <button 
                onClick={() => { 
                  onAssign(assigningReportId, '冷料修補'); 
                  setAssigningReportId(null); 
                }} 
                className="w-full flex items-center justify-between px-4 py-3.5 bg-blue-50/50 hover:bg-blue-50 border border-blue-200/80 hover:border-blue-400 text-blue-800 font-bold rounded-2xl transition-all active:scale-[0.98] group cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-xs sm:text-sm">冷料修補</span>
                </div>
                <span className="text-xs text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform">選擇 →</span>
              </button>
              
              <button 
                onClick={() => { 
                  onAssign(assigningReportId, '熱料刨鋪'); 
                  setAssigningReportId(null); 
                }} 
                className="w-full flex items-center justify-between px-4 py-3.5 bg-rose-50/50 hover:bg-rose-50 border border-rose-200/80 hover:border-rose-400 text-rose-800 font-bold rounded-2xl transition-all active:scale-[0.98] group cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-xs sm:text-sm">熱料刨鋪</span>
                </div>
                <span className="text-xs text-rose-600 font-semibold group-hover:translate-x-0.5 transition-transform">選擇 →</span>
              </button>
            </div>
            
            <p className="mt-4 text-[11px] text-slate-400 text-center">
              派工後此紀錄將會出現在「派工管理」頁籤中
            </p>
          </div>
        </div>
      )}

      {/* Completion Modal */}
      {completingReportId !== null && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-slide-up">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm relative border border-slate-100">
            <button 
              onClick={() => setCompletingReportId(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
                <CheckSquare size={22} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">標示派工完成</h3>
                <p className="text-xs text-slate-400 font-medium">記錄施作完工日期</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">完成日期</label>
                <input 
                  type="date" 
                  value={completionDate}
                  onChange={(e) => setCompletionDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                />
              </div>
              
              <button 
                onClick={() => { 
                  onToggleComplete(completingReportId, true, completionDate); 
                  setCompletingReportId(null); 
                }} 
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-xs cursor-pointer active:scale-[0.98]"
              >
                確定完工
              </button>
            </div>
            
            <p className="mt-4 text-[11px] text-slate-400 text-center">
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
      <td className={`p-3.5 sticky-left z-20 ${isSelected ? 'bg-indigo-50/70' : (isCompleted ? 'bg-emerald-50/50' : 'bg-white')} ${scrollState.left ? 'shadow-left' : ''}`}>
        <button 
          onClick={() => report.id && toggleSelect(report.id)}
          className="text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
        >
          {isSelected ? (
            <CheckSquare size={18} className="text-indigo-600" />
          ) : (
            <Square size={18} />
          )}
        </button>
      </td>
      <td className="p-3.5 font-bold text-slate-800 text-xs">#{index + 1}</td>
      <td className="p-3.5 whitespace-nowrap text-slate-500 text-xs font-medium">
        {report.log_time ? (() => { try { return format(new Date(report.log_time), 'yyyy/MM/dd HH:mm'); } catch { return String(report.log_time); } })() : '-'}
      </td>
      <td className="p-3.5 whitespace-nowrap">
        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide
          ${report.location_type === 'mainline' ? 'bg-sky-50 text-sky-700 border border-sky-200/80' : 'bg-amber-50 text-amber-700 border border-amber-200/80'}`}>
          {report.location_type === 'mainline' ? '主線' : '匝道'}
        </span>
      </td>
      <td className="p-3.5 whitespace-nowrap font-semibold text-slate-800 text-xs">{report.highway} {report.direction}</td>
      <td className="p-3.5 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-bold text-slate-700 bg-slate-100/80 px-2 py-0.5 rounded-md text-xs">
            {report.mileage}
          </span>
          {report.coordinates && (
            <button 
              onClick={() => window.open(`https://www.google.com/maps?q=${report.coordinates}`, '_blank')}
              className="text-indigo-600 hover:text-indigo-800 p-1 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
              title="查看地圖位置"
            >
              <MapPin size={15} />
            </button>
          )}
        </div>
      </td>
      <td className="p-3.5 whitespace-nowrap text-slate-600 text-xs">{report.lane}</td>
      <td className="p-3.5 text-xs font-semibold text-slate-800">{report.damage_condition}</td>
      <td className="p-3.5 whitespace-nowrap text-slate-600 text-xs">{report.improvement_method}</td>
      <td className="p-3.5 whitespace-nowrap text-slate-500 text-xs">{report.supervision_review || '-'}</td>
      <td className="p-3.5 whitespace-nowrap text-slate-500 text-xs">{report.follow_up_method || '-'}</td>
      {activeTab === 'assignments' && (
        <>
          <td className="p-3.5 whitespace-nowrap">
            <span className={`px-2 py-0.5 rounded-md text-xs font-extrabold border ${
              report.assign_type === '熱料刨鋪' 
                ? 'bg-rose-50 text-rose-700 border-rose-200/80' 
                : report.assign_type === '冷料修補' 
                  ? 'bg-blue-50 text-blue-700 border-blue-200/80' 
                  : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}>
              {report.assign_type || '-'}
            </span>
          </td>
          <td className="p-3.5 whitespace-nowrap text-center">
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer ${
                report.is_assigned_completed 
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {report.is_assigned_completed ? '已完工' : '標示完工'}
            </button>
          </td>
        </>
      )}
      <td className="p-3.5 whitespace-nowrap text-slate-500 text-xs">
        {report.completion_time ? (() => { try { return format(new Date(report.completion_time), 'yyyy/MM/dd HH:mm'); } catch { return String(report.completion_time); } })() : '-'}
      </td>
      <td className={`p-3.5 text-center sticky-right z-20 ${isSelected ? 'bg-indigo-50/70' : (isCompleted ? 'bg-emerald-50/50' : 'bg-white')} ${scrollState.right ? 'shadow-right' : ''}`}>
        <div className="flex items-center justify-center gap-1.5">
          {/* Photo Preview Button with LazyPhoto */}
          <LazyPhoto
            id={report.id}
            initialPhoto={report.photo}
            isViewed={isViewed}
            onGetPhoto={onGetPhoto}
            onClick={() => onPhotoClick(report)}
            className="w-8 h-8 rounded-lg border border-slate-200 flex-shrink-0 shadow-2xs"
            badgeClassName="bottom-0.5 right-0.5 w-3 h-3"
          />

          <div className="w-px h-5 bg-slate-200 mx-0.5 hidden xs:block" />

          {activeTab === 'reports' ? (
            <>
              <button 
                onClick={() => report.id && setAssigningReportId(report.id)}
                className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 flex-shrink-0 cursor-pointer ${
                  report.assign_type 
                    ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' 
                    : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                }`}
                title={report.assign_type ? `已派工: ${report.assign_type}` : '指派項目'}
              >
                <AlertCircle size={16} />
              </button>
              <button 
                onClick={() => onEdit(report)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
                title="編輯紀錄"
              >
                <Pencil size={16} />
              </button>
              <button 
                onClick={() => report.id && onDelete(report.id)}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
                title="刪除紀錄"
              >
                <Trash2 size={16} />
              </button>
            </>
          ) : (
            <button 
              onClick={() => report.id && onDelete(report.id)}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
              title="取消派工"
            >
              <Trash2 size={16} />
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
    <div className={`p-4 mx-2 my-2.5 rounded-2xl transition-all border ${
      isSelected 
        ? 'bg-indigo-50/60 border-indigo-200' 
        : isCompleted 
          ? 'bg-emerald-50/40 border-emerald-100' 
          : 'bg-white border-slate-200/80 shadow-2xs hover:shadow-xs'
    }`}>
      <div className="flex items-start gap-3.5">
        {/* Photo Thumbnail */}
        <LazyPhoto
          id={report.id}
          initialPhoto={report.photo}
          isViewed={isViewed}
          onGetPhoto={onGetPhoto}
          onClick={() => onPhotoClick(report)}
          className="w-22 h-22 rounded-2xl border border-slate-200 shrink-0 shadow-2xs"
          badgeClassName="bottom-1 right-1 w-4 h-4"
        />

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-indigo-500">#{index + 1}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                report.location_type === 'mainline' 
                  ? 'bg-sky-50 text-sky-700 border border-sky-200/80' 
                  : 'bg-amber-50 text-amber-700 border border-amber-200/80'
              }`}>
                {report.location_type === 'mainline' ? '主線' : '匝道'}
              </span>
            </div>
            <button 
              onClick={() => report.id && toggleSelect(report.id)}
              className="text-slate-300 hover:text-indigo-600 transition-colors p-1"
            >
              {isSelected ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} />}
            </button>
          </div>

          <h4 className="font-bold text-slate-900 truncate text-sm">
            {report.highway} {report.direction}
          </h4>
          <div className="text-xs text-slate-600 font-medium flex items-center gap-1.5 mt-0.5">
            {report.coordinates && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`https://www.google.com/maps?q=${report.coordinates}`, '_blank');
                }}
                className="text-indigo-600 hover:text-indigo-800 transition-colors p-1 bg-indigo-50 hover:bg-indigo-100 rounded-md -ml-1 shrink-0"
                title="查看地圖位置"
              >
                <MapPin size={13} />
              </button>
            )}
            <span className="truncate font-mono font-bold text-slate-700">{report.mileage}</span>
            <span>·</span>
            <span className="truncate text-slate-500">{report.lane}</span>
          </div>
          
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <div className="px-2 py-0.5 bg-slate-100 rounded-lg text-[11px] font-bold text-slate-700 border border-slate-200/60">
              {report.damage_condition}
            </div>
            {report.assign_type && (
              <div className={`px-2 py-0.5 rounded-lg text-[11px] font-extrabold border ${
                report.assign_type === '熱料刨鋪' 
                  ? 'bg-rose-50 text-rose-700 border-rose-200/80' 
                  : 'bg-blue-50 text-blue-700 border-blue-200/80'
              }`}>
                {report.assign_type}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[11px] text-slate-400 font-medium">
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs ${
                report.is_assigned_completed 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              {report.is_assigned_completed ? '已完工' : '標示完工'}
            </button>
          ) : (
            <>
              <button 
                onClick={() => report.id && setAssigningReportId(report.id)}
                className={`p-2 rounded-xl transition-colors ${
                  report.assign_type ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600'
                }`}
              >
                <AlertCircle size={18} />
              </button>
              <button 
                onClick={() => onEdit(report)}
                className="p-2 text-slate-400 hover:text-indigo-600 rounded-xl transition-colors"
              >
                <Pencil size={18} />
              </button>
            </>
          )}
          <button 
            onClick={() => report.id && onDelete(report.id)}
            className="p-2 text-slate-400 hover:text-rose-600 rounded-xl transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
});

ReportCard.displayName = 'ReportCard';
