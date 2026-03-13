import React, { useState } from 'react';
import { format } from 'date-fns';
import { MapPin, Trash2, Pencil, X } from 'lucide-react';
import { Report } from '../types';

interface ReportListProps {
  reports: Report[];
  filter: 'all' | 'mainline' | 'ramp';
  onDelete: (id: number) => void;
  onEdit: (report: Report) => void;
  onGetPhoto: (id: number) => Promise<string>;
}

export function ReportList({ reports, filter, onDelete, onEdit, onGetPhoto }: ReportListProps) {
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const handlePreviewPhoto = async (report: Report) => {
    if (report.photo) {
      setPreviewPhoto(report.photo);
      return;
    }

    if (!report.id) return;

    try {
      setIsPreviewLoading(true);
      const photo = await onGetPhoto(report.id);
      if (photo) {
        setPreviewPhoto(photo);
        // Update local report object to avoid re-fetching
        report.photo = photo;
      } else {
        alert('無法載入照片');
      }
    } finally {
      setIsPreviewLoading(false);
    }
  };

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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-sm font-medium text-gray-500">
              <th className="p-4 whitespace-nowrap">項次</th>
              <th className="p-4 whitespace-nowrap">登錄時間</th>
              <th className="p-4 whitespace-nowrap">位置類型</th>
              <th className="p-4 whitespace-nowrap">國道/方向</th>
              <th className="p-4 whitespace-nowrap">
                {filter === 'mainline' ? '里程' : filter === 'ramp' ? '交流道名稱' : '里程/交流道名稱'}
              </th>
              <th className="p-4 whitespace-nowrap">
                {filter === 'mainline' ? '車道' : filter === 'ramp' ? '出口/入口' : '車道/出入口'}
              </th>
              <th className="p-4 min-w-[150px]">損壞狀況</th>
              <th className="p-4 whitespace-nowrap">改善方式</th>
              <th className="p-4 whitespace-nowrap">監造審查</th>
              <th className="p-4 whitespace-nowrap">完成時間</th>
              <th className="p-4 whitespace-nowrap">現場照片</th>
              <th className="p-4 whitespace-nowrap text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reports.map((report, index) => (
              <tr key={report.id} className="hover:bg-gray-50/50 transition-colors text-sm text-gray-800">
                <td className="p-4 font-medium text-gray-900">{index + 1}</td>
                <td className="p-4 whitespace-nowrap">{format(new Date(report.log_time), 'yyyy/MM/dd HH:mm')}</td>
                <td className="p-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium
                    ${report.location_type === 'mainline' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {report.location_type === 'mainline' ? '主線' : '匝道'}
                  </span>
                </td>
                <td className="p-4 whitespace-nowrap">{report.highway} {report.direction}</td>
                <td className="p-4 whitespace-nowrap">{report.mileage}</td>
                <td className="p-4 whitespace-nowrap">{report.lane}</td>
                <td className="p-4">{report.damage_condition}</td>
                <td className="p-4 whitespace-nowrap">{report.improvement_method}</td>
                <td className="p-4 whitespace-nowrap">{report.supervision_review || '-'}</td>
                <td className="p-4 whitespace-nowrap">{report.completion_time ? format(new Date(report.completion_time), 'yyyy/MM/dd HH:mm') : '-'}</td>
                <td className="p-4">
                  <div 
                    className="w-16 h-12 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center"
                    onClick={() => handlePreviewPhoto(report)}
                  >
                    {report.photo ? (
                      <img src={report.photo} alt="現場照片" className="w-full h-full object-cover" />
                    ) : (
                      <Camera size={18} className="text-gray-400" />
                    )}
                  </div>
                </td>
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button 
                      onClick={() => onEdit(report)}
                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="編輯紀錄"
                    >
                      <Pencil size={18} />
                    </button>
                    <button 
                      onClick={() => report.id && onDelete(report.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="刪除紀錄"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center">
            <button 
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors p-2"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewPhoto(null);
              }}
            >
              <X size={32} />
            </button>
            {(previewPhoto || isPreviewLoading) && (
              <div className="flex flex-col items-center justify-center min-h-[200px]">
                {isPreviewLoading ? (
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600"></div>
                ) : (
                  <img 
                    src={previewPhoto!} 
                    alt="照片預覽" 
                    className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
