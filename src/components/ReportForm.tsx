import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Camera, Upload, X, Trash2, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { Report } from '../types';

interface ReportFormProps {
  initialData?: Report;
  onSubmit: (data: Report) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  onGetPhoto?: (id: number) => Promise<string>;
  isAssignmentEditMode?: boolean;
}

export function ReportForm({ initialData, onSubmit, onCancel, isSubmitting, onGetPhoto, isAssignmentEditMode }: ReportFormProps) {
  const formattedInitialData = initialData ? {
    ...initialData,
    log_time: initialData.log_time ? format(new Date(initialData.log_time), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    completion_time: initialData.completion_time ? format(new Date(initialData.completion_time), "yyyy-MM-dd'T'HH:mm") : ''
  } : undefined;

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<Report>({
    defaultValues: formattedInitialData || {
      location_type: 'mainline',
      improvement_method: '優先處理',
      highway: '國道1號',
      direction: '南下',
      // Auto-generate a readable item number based on time to avoid "Loading..." state
      item_number: format(new Date(), 'yyyyMMddHHmm'),
      log_time: format(new Date(), "yyyy-MM-dd'T'HH:mm")
    }
  });
  
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialData?.photo || null);
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const locationType = watch('location_type');
  const highway = watch('highway');
  const [prevLocationType, setPrevLocationType] = useState(initialData?.location_type || 'mainline');
  const [showMapPicker, setShowMapPicker] = useState(false);
  const coordinates = watch('coordinates');

  // Define interchange mappings
  const interchanges: Record<string, string[]> = {
    '國道1號': ['豐原交流道(168k)', '大雅系統(172)', '大雅交流道(174k)', '台中交流道(178k)', '南屯交流道(181k)', '王田交流道(189k)'],
    '國道3號': ['和美交流道(191k)', '彰化系統(196k)'],
    '國道4號': ['后豐交流道(14k)', '豐勢交流道(17k)', '潭子交流道(26k)', '潭子系統(28k)']
  };

  React.useEffect(() => {
    if (locationType !== prevLocationType) {
      if (!isAssignmentEditMode) {
        setValue('mileage', '');
        setValue('lane', '');
      }
      setPrevLocationType(locationType);
    }
  }, [locationType, prevLocationType, setValue, isAssignmentEditMode]);

  React.useEffect(() => {
    const fetchPhoto = async () => {
      if (initialData?.id && !initialData.photo && onGetPhoto) {
        setIsPhotoLoading(true);
        try {
          const photo = await onGetPhoto(initialData.id);
          if (photo) {
            setPhotoPreview(photo);
            setValue('photo', photo);
          }
        } finally {
          setIsPhotoLoading(false);
        }
      }
    };
    fetchPhoto();
  }, [initialData, onGetPhoto, setValue]);

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
    if (locationType !== 'mainline') return;
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
    <div className="fixed inset-0 bg-black/60 flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto backdrop-blur-sm">
      <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-w-2xl min-h-screen sm:min-h-0 flex flex-col relative my-0 sm:my-8 transition-all">
        <div className="sticky top-0 bg-white/95 backdrop-blur-md z-30 flex justify-between items-center p-5 sm:p-6 border-b border-gray-100 rounded-t-none sm:rounded-t-2xl">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">{initialData ? '編輯巡查紀錄' : '新增巡查紀錄'}</h2>
          <button onClick={onCancel} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        {/* Map Picker Modal Overlay */}
        {showMapPicker && (
          <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col items-center justify-center p-4">
            <div className="bg-white w-full max-w-4xl h-[80vh] rounded-2xl overflow-hidden flex flex-col relative">
              <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800">在 Google Maps 中標記位置</h3>
                <button 
                  type="button" 
                  onClick={() => setShowMapPicker(false)}
                  className="p-1 hover:bg-gray-200 rounded-full"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 relative bg-gray-100 group">
                {/* 
                  Note: In a real environment, we'd use Google Maps JS SDK for a proper picker.
                  As a workaround for this specific environment, we'll use an iframe to Google Maps 
                  and prompt the user to copy/paste the coordinates, OR use a mock picker if I can't embed a full interactive one easily.
                  However, "可以直接連動google map" suggests they want a seamless experience.
                  Since I can't easily get a click and return coordinates from a simple iframe due to cross-origin, 
                  I will implement a field where they can "Paste Location" and a button to "Open Google Maps" 
                  to find coordinates, or try to use a placeholder message explaining how to mark.
                  
                  ACTUAL BETTER APPROACH: Use a simple input for coordinates + a button to open Google Maps 
                  in a new tab to find the spot, or use a simplified embedded map if possible.
                */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
                  <MapPin size={48} className="text-indigo-500 mb-4" />
                  <p className="text-lg font-bold mb-2">請在地圖上找到位置並點擊</p>
                  <p className="text-gray-500 mb-6">點擊下方按鈕開啟 Google Maps，找到位置後右鍵點擊座標以複製，然後回來貼入下方欄位。</p>
                  
                  <div className="w-full max-w-md space-y-4">
                    <button 
                      type="button"
                      onClick={() => window.open('https://www.google.com/maps', '_blank')}
                      className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
                    >
                      開啟 Google Maps
                    </button>
                    
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="在此貼上座標 (例如: 24.123, 120.456)"
                        className="w-full px-4 py-3 border-2 border-indigo-100 rounded-xl outline-none focus:border-indigo-500 transition-all"
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData('Text');
                          if (pasted) {
                            setValue('coordinates', pasted);
                            setShowMapPicker(false);
                          }
                        }}
                        onChange={(e) => setValue('coordinates', e.target.value)}
                        value={watch('coordinates') || ''}
                      />
                    </div>
                    
                    <button 
                      type="button"
                      onClick={() => setShowMapPicker(false)}
                      className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
                    >
                      完成
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(submitForm)} className="flex-1 p-5 sm:p-8 space-y-8">
          {/* Photo Upload Section */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-700 ml-1">現場照片 <span className="text-red-500">*</span></label>
            <label 
              htmlFor="photo-upload"
              className={`block border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all active:scale-[0.98] relative
                ${photoPreview ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-200 hover:border-indigo-400 bg-gray-50/50 hover:bg-white'}`}
            >
              {photoPreview || isPhotoLoading ? (
                <div className="relative w-full h-72 sm:h-56 group">
                  {isPhotoLoading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 rounded-xl">
                      <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-200 border-t-indigo-600 mb-2"></div>
                      <span className="text-sm text-gray-500 font-medium">載入照片中...</span>
                    </div>
                  ) : (
                    <img src={photoPreview || ''} alt="Preview" className="w-full h-full object-contain rounded-xl" />
                  )}
                  {!isAssignmentEditMode && !isPhotoLoading && (
                    <>
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                        <p className="text-white font-medium flex items-center gap-2 bg-black/20 px-4 py-2 rounded-lg backdrop-blur-sm">
                          <Camera size={20} /> 更換照片
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        disabled={isSubmitting}
                        className="absolute top-3 right-3 p-3 bg-red-500 text-white rounded-xl shadow-lg opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 active:scale-90"
                        title="移除照片"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="py-14 sm:py-10 flex flex-col items-center justify-center text-gray-500 group">
                  <div className="mb-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 group-hover:scale-110 transition-transform text-indigo-500">
                    <Upload size={32} />
                  </div>
                  <p className="font-bold text-lg text-gray-900 mb-1">點擊上傳照片</p>
                  <p className="text-sm text-gray-400">支援拍照或選擇 JPG, PNG 格式</p>
                </div>
              )}
              <input 
                id="photo-upload"
                type="file" 
                ref={fileInputRef} 
                onChange={handlePhotoUpload} 
                accept="image/*" 
                className="hidden" 
                disabled={isAssignmentEditMode}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
            {/* Location Type */}
            <div className={`space-y-3 md:col-span-2 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-sm font-semibold text-gray-700 ml-1">位置類型</label>
              <div className="flex gap-4 p-1 bg-gray-50 rounded-xl w-fit">
                <button 
                  type="button"
                  onClick={() => setValue('location_type', 'mainline')}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all
                    ${locationType === 'mainline' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <input type="radio" value="mainline" {...register('location_type')} className="hidden" />
                  主線
                </button>
                <button 
                  type="button"
                  onClick={() => setValue('location_type', 'ramp')}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all
                    ${locationType === 'ramp' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <input type="radio" value="ramp" {...register('location_type')} className="hidden" />
                  匝道
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 ml-1">登錄時間 <span className="text-red-500">*</span></label>
              <input 
                type="datetime-local" 
                {...register('log_time', { required: true })} 
                className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all ${initialData ? 'bg-gray-200 text-gray-500 pointer-events-none' : 'focus:bg-white'}`} 
                tabIndex={initialData ? -1 : 0}
              />
            </div>

            <div className={`space-y-2 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-sm font-semibold text-gray-700 ml-1">國道 <span className="text-red-500">*</span></label>
              <select {...register('highway', { required: true })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer">
                <option value="國道1號">國道1號</option>
                <option value="國道3號">國道3號</option>
                <option value="國道4號">國道4號</option>
              </select>
            </div>

            <div className={`space-y-2 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-sm font-semibold text-gray-700 ml-1">方向 <span className="text-red-500">*</span></label>
              <select {...register('direction', { required: true })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer">
                <option value="南下">南下</option>
                <option value="北上">北上</option>
                <option value="東向">東向</option>
                <option value="西向">西向</option>
              </select>
            </div>

            <div className={`space-y-2 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-sm font-semibold text-gray-700 ml-1">
                {locationType === 'ramp' ? '交流道名稱' : '里程'} <span className="text-red-500">*</span>
              </label>
              {locationType === 'ramp' ? (
                <select 
                  {...register('mileage', { required: true })} 
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">請選擇交流道</option>
                  {(interchanges[highway] || []).map(interchange => (
                     <option key={interchange} value={interchange}>{interchange}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input 
                    {...register('mileage', { required: true })} 
                    onBlur={handleMileageBlur}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all" 
                    placeholder="例如: 174k+000" 
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-400 mt-1 ml-1 italic">
                    支援 "174k+000" 或純數字 "174000"
                  </p>
                </>
              )}
            </div>

            <div className={`space-y-2 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-sm font-semibold text-gray-700 ml-1">
                {locationType === 'ramp' ? '出口/入口' : '車道'} <span className="text-red-500">*</span>
              </label>
              {locationType === 'ramp' ? (
                <select {...register('lane', { required: true })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer">
                  <option value="">請選擇</option>
                  <option value="出口">出口</option>
                  <option value="入口">入口</option>
                </select>
              ) : (
                <input {...register('lane', { required: true })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all" placeholder="例如: 內側車道" autoComplete="off" />
              )}
            </div>

            {/* Coordinates Section */}
            <div className={`space-y-3 md:col-span-2 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <div className="flex justify-between items-center ml-1">
                <label className="block text-sm font-semibold text-gray-700">詳細位置標記 (Google Maps)</label>
                {coordinates && (
                  <button 
                    type="button"
                    onClick={() => window.open(`https://www.google.com/maps?q=${coordinates}`, '_blank')}
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    <MapPin size={12} /> 在地圖中預覽
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <input 
                    {...register('coordinates')}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm"
                    placeholder="經緯度座標 (例如: 24.123, 120.456)"
                    readOnly
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <MapPin size={20} />
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowMapPicker(true)}
                  className="px-4 py-3 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl font-bold hover:bg-indigo-100 transition-all flex items-center gap-2 whitespace-nowrap active:scale-95"
                >
                  <MapPin size={18} /> 標記位置
                </button>
              </div>
              <p className="text-xs text-gray-400 ml-1">選填，提供精確的地圖標記位罝</p>
            </div>

            <div className={`space-y-2 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-sm font-semibold text-gray-700 ml-1">損壞狀況 <span className="text-red-500">*</span></label>
              <input {...register('damage_condition', { required: true })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all" placeholder="例如: 坑洞、裂縫" />
            </div>

            <div className={`space-y-2 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-sm font-semibold text-gray-700 ml-1">改善方式</label>
              <select {...register('improvement_method')} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer">
                <option value="優先處理">優先處理</option>
                <option value="建議刨鋪">建議刨鋪</option>
                <option value="持續觀察">持續觀察</option>
                <option value="列入年度計畫">列入年度計畫</option>
              </select>
            </div>

            <div className={`space-y-2 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-sm font-semibold text-gray-700 ml-1">監造審查</label>
              <input {...register('supervision_review')} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all" placeholder="審查意見" />
            </div>

            <div className={`space-y-2 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-sm font-semibold text-gray-700 ml-1">後續處理方式</label>
              <input {...register('follow_up_method')} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all" placeholder="例如: 列入年度計畫" />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 ml-1">完成時間</label>
              <input type="datetime-local" {...register('completion_time')} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all" />
            </div>
          </div>

          <div className="sticky bottom-0 bg-white/95 backdrop-blur-md pt-5 pb-10 sm:pb-6 flex gap-4 justify-end border-t border-gray-100 -mx-5 sm:-mx-8 px-5 sm:px-8">
            <button type="button" onClick={onCancel} disabled={isSubmitting} className="px-8 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50">
              取消
            </button>
            <button type="submit" disabled={isSubmitting} className="flex-1 sm:flex-none px-8 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
              {isSubmitting && <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/50 border-t-white"></div>}
              {isSubmitting ? '正在儲存...' : (initialData ? '更新紀錄' : '儲存紀錄')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
