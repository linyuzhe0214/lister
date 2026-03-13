import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Camera, Upload, X, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Report } from '../types';

interface ReportFormProps {
  initialData?: Report;
  onSubmit: (data: Report) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ReportForm({ initialData, onSubmit, onCancel, isSubmitting }: ReportFormProps) {
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<Report>({
    defaultValues: initialData || {
      location_type: 'mainline',
      improvement_method: '優先處理',
      highway: '國道1號',
      direction: '南下',
      item_number: '載入中...',
      log_time: format(new Date(), "yyyy-MM-dd'T'HH:mm")
    }
  });
  
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialData?.photo || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const locationType = watch('location_type');
  const [prevLocationType, setPrevLocationType] = useState(initialData?.location_type || 'mainline');

  React.useEffect(() => {
    if (locationType !== prevLocationType) {
      setValue('mileage', '');
      setValue('lane', '');
      setPrevLocationType(locationType);
    }
  }, [locationType, prevLocationType, setValue]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          // 壓縮圖片
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_WIDTH = 1000;
          const MAX_HEIGHT = 1000;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const base64String = canvas.toDataURL('image/jpeg', 0.6); // 降低質量以縮小體積
          setPhotoPreview(base64String);
          setValue('photo', base64String);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPhotoPreview(null);
    setValue('photo', '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const submitForm = (data: Report) => {
    if (!photoPreview) {
      alert('請上傳照片');
      return;
    }
    onSubmit(data);
  };

  const handleMileageBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    let val = e.target.value.trim();
    if (!val) return;
    
    // If it already matches XXXk+YYY (case insensitive), just normalize to lowercase k and pad meters
    if (/^\d+[kK]\+\d+$/.test(val)) {
      const [km, m] = val.toLowerCase().split('k+');
      setValue('mileage', `${km}k+${m.padStart(3, '0')}`);
      return;
    }

    // Otherwise, extract all numbers and format
    const numStr = val.replace(/[^0-9]/g, '');
    if (numStr.length > 3) {
      const km = numStr.slice(0, -3);
      const m = numStr.slice(-3);
      setValue('mileage', `${km}k+${m}`);
    } else if (numStr.length > 0) {
      setValue('mileage', `${numStr}k+000`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl shadow-xl w-full max-w-2xl min-h-screen sm:min-h-0 overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-gray-800">{initialData ? '編輯巡查紀錄' : '新增巡查紀錄'}</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(submitForm)} className="p-6 space-y-6">
          {/* Photo Upload Section */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">現場照片 <span className="text-red-500">*</span></label>
            <div 
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors
                ${photoPreview ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 bg-gray-50'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {photoPreview ? (
                <div className="relative w-full h-64 sm:h-48 group">
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-contain rounded-lg" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                    <p className="text-white font-medium flex items-center gap-2">
                      <Camera size={20} /> 更換照片
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={isSubmitting}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-sm"
                    title="移除照片"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <div className="py-12 sm:py-8 flex flex-col items-center justify-center text-gray-500">
                  <Upload size={40} className="mb-2 text-gray-400" />
                  <p className="font-bold text-lg sm:text-base">點擊上傳照片</p>
                  <p className="text-sm text-gray-400 mt-1">支援 JPG, PNG 格式</p>
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handlePhotoUpload} 
                accept="image/*" 
                className="hidden" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Location Type */}
            <div className="space-y-2 md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">位置類型</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="mainline" {...register('location_type')} className="w-4 h-4 text-indigo-600" />
                  <span>主線</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="ramp" {...register('location_type')} className="w-4 h-4 text-indigo-600" />
                  <span>匝道</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">登錄時間 <span className="text-red-500">*</span></label>
              <input type="datetime-local" {...register('log_time', { required: true })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">國道 <span className="text-red-500">*</span></label>
              <select {...register('highway', { required: true })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white">
                <option value="國道1號">國道1號</option>
                <option value="國道3號">國道3號</option>
                <option value="國道4號">國道4號</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">方向 <span className="text-red-500">*</span></label>
              <select {...register('direction', { required: true })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white">
                <option value="南下">南下</option>
                <option value="北上">北上</option>
                <option value="東向">東向</option>
                <option value="西向">西向</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                {locationType === 'ramp' ? '交流道名稱' : '里程'} <span className="text-red-500">*</span>
              </label>
              <input 
                {...register('mileage', { required: true })} 
                onBlur={locationType === 'mainline' ? handleMileageBlur : undefined}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" 
                placeholder={locationType === 'ramp' ? '例如: 圓山交流道' : '例如: 174k+000'} 
                autoComplete="off"
              />
              {locationType === 'mainline' && (
                <p className="text-xs text-gray-500">
                  支援直接輸入 "174k+000" 格式，或輸入純數字 "174000" 離開欄位時將自動轉換
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                {locationType === 'ramp' ? '出口/入口' : '車道'} <span className="text-red-500">*</span>
              </label>
              {locationType === 'ramp' ? (
                <select {...register('lane', { required: true })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white">
                  <option value="">請選擇</option>
                  <option value="出口">出口</option>
                  <option value="入口">入口</option>
                </select>
              ) : (
                <input {...register('lane', { required: true })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="例如: 內側車道" autoComplete="off" />
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">損壞狀況 <span className="text-red-500">*</span></label>
              <input {...register('damage_condition', { required: true })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="例如: 坑洞、裂縫" />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">改善方式</label>
              <select {...register('improvement_method')} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white">
                <option value="優先處理">優先處理</option>
                <option value="建議刨鋪">建議刨鋪</option>
                <option value="持續觀察">持續觀察</option>
                <option value="列入年度計畫">列入年度計畫</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">監造審查</label>
              <input {...register('supervision_review')} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="審查意見" />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">後續處理方式</label>
              <input {...register('follow_up_method')} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="例如: 列入年度計畫" />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">完成時間</label>
              <input type="datetime-local" {...register('completion_time')} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
          </div>

          <div className="pt-6 pb-12 sm:pb-6 flex gap-4 justify-end border-t border-gray-100">
            <button type="button" onClick={onCancel} disabled={isSubmitting} className="px-6 py-2 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50">
              取消
            </button>
            <button type="submit" disabled={isSubmitting} className="px-6 py-2 rounded-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2">
              {isSubmitting && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/50 border-t-white"></div>}
              {isSubmitting ? '正在儲存...' : '儲存紀錄'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
