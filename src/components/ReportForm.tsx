import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Camera, X, Trash2, MapPin, Crosshair, Loader2, Image as ImageIcon } from 'lucide-react';
import exifr from 'exifr';
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
    completion_time: initialData.completion_time ? format(new Date(initialData.completion_time), "yyyy-MM-dd'T'HH:mm") : '',
    // Normalize coordinates: null/undefined from Sheets must become '' to avoid sending null
    coordinates: initialData.coordinates ?? ''
  } : undefined;

  const { register, handleSubmit, formState: { errors }, setValue, watch, getValues } = useForm<Report>({
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
  const [isLocating, setIsLocating] = useState(false);
  const [gpsToast, setGpsToast] = useState<{ msg: string; ok: boolean } | null>(null);
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isCamera: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 用 exifr 解析 GPS（支援 JPEG / HEIC / PNG）
    try {
      const gps = await exifr.gps(file);
      if (gps?.latitude && gps?.longitude) {
        const coords = `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`;
        if (!getValues('coordinates')) {
          setValue('coordinates', coords, { shouldDirty: true });
        }
        setGpsToast({ msg: `📍 已從照片自動帶入座標`, ok: true });
        setTimeout(() => setGpsToast(null), 3500);
      } else {
        throw new Error("No EXIF");
      }
    } catch {
      if (isCamera && navigator.geolocation) {
        setGpsToast({ msg: '正在擷取當下位置...', ok: true });
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
            if (!getValues('coordinates')) {
              setValue('coordinates', coords, { shouldDirty: true });
            }
            setGpsToast({ msg: '📍 已自動擷取當下位置', ok: true });
            setTimeout(() => setGpsToast(null), 3500);
          },
          (err) => {
            setGpsToast({ msg: '照片無 GPS 資訊，且自動定位失敗', ok: false });
            setTimeout(() => setGpsToast(null), 3500);
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      } else {
        setGpsToast({ msg: '照片無 GPS 資訊，請手動定位', ok: false });
        setTimeout(() => setGpsToast(null), 3500);
      }
    }

    // 讀 DataURL 做圖片壓縮
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        // 加強壓縮圖片以符合 GAS 單格 50000 字元限制
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        // 縮小最大尺寸
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 600;

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

        // 初始品質設為 0.5
        let quality = 0.5;
        let base64String = canvas.toDataURL('image/jpeg', quality);

        // 如果還是超過 45000 字元 (保留安全邊際)，繼續降低品質
        while (base64String.length > 45000 && quality > 0.1) {
          quality -= 0.1;
          base64String = canvas.toDataURL('image/jpeg', quality);
        }

        setPhotoPreview(base64String);
        setValue('photo', base64String);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('您的瀏覽器不支援定位功能');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
        setValue('coordinates', coords, { shouldDirty: true });
        setIsLocating(false);
      },
      (err) => {
        alert(`定位失敗: ${err.message}`);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleRemovePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPhotoPreview(null);
    setValue('photo', '');
  };

  const submitForm = (data: Report) => {
    // 確保強制抓取 coordinates 欄位，避免 react-hook-form 未註冊導致遺失
    const currentCoordinates = getValues('coordinates');
    console.log("Submitting form. react-hook-form data:", data.coordinates, "getValues:", currentCoordinates);
    data.coordinates = currentCoordinates ? currentCoordinates.trim() : '';
    (data as any)._force_coordinates = data.coordinates;
    
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
    <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-0 sm:p-4 z-50 backdrop-blur-xs animate-slide-up">
      <div className="bg-white rounded-none sm:rounded-3xl shadow-2xl w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col relative transition-all overflow-hidden border border-slate-100">
        <div className="bg-white/95 backdrop-blur-md z-30 flex justify-between items-center px-6 py-4.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Camera size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                {initialData ? '編輯巡查紀錄' : '新增巡查紀錄'}
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">記錄現場查報狀況與改善對策</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all active:scale-90 cursor-pointer">
            <X size={20} />
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
                    
                      <input 
                        type="text"
                        placeholder="在此貼上座標 (例如: 24.123, 120.456)"
                        className="w-full px-4 py-3 border-2 border-indigo-100 rounded-xl outline-none focus:border-indigo-500 transition-all"
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData('Text');
                          console.log("Pasted coordinates:", pasted);
                          if (pasted) {
                            setValue('coordinates', pasted, { shouldValidate: true, shouldDirty: true });
                            setShowMapPicker(false);
                          }
                        }}
                        onChange={(e) => {
                          console.log("Typing coordinates:", e.target.value);
                          setValue('coordinates', e.target.value, { shouldValidate: true, shouldDirty: true });
                        }}
                        value={watch('coordinates') || ''}
                      />
                    
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

        <form 
          onSubmit={handleSubmit(submitForm)} 
          className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 custom-scrollbar overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Photo Upload Section */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold text-slate-700 ml-1">
              現場照片 <span className="text-rose-500">*</span>
            </label>
            <div 
              className={`block border-2 border-dashed rounded-3xl p-5 text-center transition-all relative
                ${photoPreview ? 'border-indigo-400 bg-indigo-50/20' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'}`}
            >
              {photoPreview || isPhotoLoading ? (
                <div className="relative w-full h-64 sm:h-56 group">
                  {isPhotoLoading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 rounded-2xl">
                      <div className="animate-spin rounded-full h-8 w-8 border-3 border-indigo-200 border-t-indigo-600 mb-2"></div>
                      <span className="text-xs text-slate-500 font-semibold">讀取照片中...</span>
                    </div>
                  ) : (
                    <img src={photoPreview || ''} alt="Preview" className="w-full h-full object-contain rounded-2xl" />
                  )}
                  {!isAssignmentEditMode && !isPhotoLoading && (
                    <>
                      <div className="absolute inset-0 bg-slate-950/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl gap-2.5 backdrop-blur-xs">
                        <label className="cursor-pointer text-white font-bold text-xs flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 px-5 py-2.5 rounded-xl backdrop-blur-md transition-all active:scale-95 w-44">
                          <Camera size={16} /> 重新拍照
                          <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoUpload(e, true)} className="hidden" onClick={(e) => { e.currentTarget.value = ''; }} />
                        </label>
                        <label className="cursor-pointer text-white font-bold text-xs flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 px-5 py-2.5 rounded-xl backdrop-blur-md transition-all active:scale-95 w-44">
                          <ImageIcon size={16} /> 從相簿選擇
                          <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, false)} className="hidden" onClick={(e) => { e.currentTarget.value = ''; }} />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        disabled={isSubmitting}
                        className="absolute top-2.5 right-2.5 p-2 bg-rose-600 text-white rounded-xl shadow-md opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-700 active:scale-90 cursor-pointer"
                        title="移除照片"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="py-6 sm:py-8 flex flex-col items-center justify-center text-slate-500">
                  <div className="flex gap-4 mb-3">
                    <label className="cursor-pointer flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-2xs border border-slate-200/90 hover:border-indigo-400 hover:scale-105 active:scale-95 transition-all text-indigo-600 w-24 h-24">
                      <Camera size={28} className="mb-1.5" />
                      <span className="font-extrabold text-xs text-slate-800">拍照</span>
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoUpload(e, true)} className="hidden" disabled={isAssignmentEditMode} onClick={(e) => { e.currentTarget.value = ''; }} />
                    </label>
                    <label className="cursor-pointer flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-2xs border border-slate-200/90 hover:border-indigo-400 hover:scale-105 active:scale-95 transition-all text-indigo-600 w-24 h-24">
                      <ImageIcon size={28} className="mb-1.5" />
                      <span className="font-extrabold text-xs text-slate-800">相簿</span>
                      <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, false)} className="hidden" disabled={isAssignmentEditMode} onClick={(e) => { e.currentTarget.value = ''; }} />
                    </label>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">支援 JPG、PNG 格式，照片內若有 GPS 座標將自動帶入</p>
                </div>
              )}
            </div>
            {/* GPS Toast */}
            {gpsToast && (
              <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                gpsToast.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                <MapPin size={14} />
                <span>{gpsToast.msg}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-5">
            {/* Location Type */}
            <div className={`space-y-2 md:col-span-2 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-xs font-bold text-slate-700 ml-1">位置類型</label>
              <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
                <button 
                  type="button"
                  onClick={() => setValue('location_type', 'mainline')}
                  className={`flex items-center gap-1.5 px-6 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    locationType === 'mainline' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <input type="radio" value="mainline" {...register('location_type')} className="hidden" />
                  主線
                </button>
                <button 
                  type="button"
                  onClick={() => setValue('location_type', 'ramp')}
                  className={`flex items-center gap-1.5 px-6 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    locationType === 'ramp' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <input type="radio" value="ramp" {...register('location_type')} className="hidden" />
                  匝道
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 ml-1">
                登錄時間 <span className="text-rose-500">*</span>
              </label>
              <input 
                type="datetime-local" 
                {...register('log_time', { required: true })} 
                className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all ${
                  initialData ? 'bg-slate-200/60 text-slate-400 pointer-events-none' : 'focus:bg-white'
                }`} 
                tabIndex={initialData ? -1 : 0}
              />
            </div>

            <div className={`space-y-1.5 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-xs font-bold text-slate-700 ml-1">
                國道 <span className="text-rose-500">*</span>
              </label>
              <select {...register('highway', { required: true })} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer">
                <option value="國道1號">國道1號</option>
                <option value="國道3號">國道3號</option>
                <option value="國道4號">國道4號</option>
              </select>
            </div>

            <div className={`space-y-1.5 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-xs font-bold text-slate-700 ml-1">
                方向 <span className="text-rose-500">*</span>
              </label>
              <select {...register('direction', { required: true })} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer">
                <option value="南下">南下</option>
                <option value="北上">北上</option>
                <option value="東向">東向</option>
                <option value="西向">西向</option>
              </select>
            </div>

            <div className={`space-y-1.5 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-xs font-bold text-slate-700 ml-1">
                {locationType === 'ramp' ? '交流道名稱' : '里程'} <span className="text-rose-500">*</span>
              </label>
              {locationType === 'ramp' ? (
                <select 
                  {...register('mileage', { required: true })} 
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
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
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder-slate-400" 
                    placeholder="例如: 174k+000" 
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-slate-400 mt-0.5 ml-1">
                    支援 "174k+000" 或純數字 "174000"
                  </p>
                </>
              )}
            </div>

            <div className={`space-y-1.5 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-xs font-bold text-slate-700 ml-1">
                {locationType === 'ramp' ? '出口/入口' : '車道'} <span className="text-rose-500">*</span>
              </label>
              {locationType === 'ramp' ? (
                <select {...register('lane', { required: true })} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer">
                  <option value="">請選擇</option>
                  <option value="出口">出口</option>
                  <option value="入口">入口</option>
                </select>
              ) : (
                <input {...register('lane', { required: true })} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder-slate-400" placeholder="例如: 內側車道" autoComplete="off" />
              )}
            </div>

            {/* Coordinates Section */}
            <div className={`space-y-2 md:col-span-2 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <div className="flex justify-between items-center ml-1">
                <label className="block text-xs font-bold text-slate-700">詳細位置標記 (Google Maps 座標)</label>
                {coordinates && (
                  <button 
                    type="button"
                    onClick={() => window.open(`https://www.google.com/maps?q=${coordinates}`, '_blank')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <MapPin size={12} /> 在地圖中預覽
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input 
                    {...register('coordinates')}
                    className="w-full pl-9 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all text-xs sm:text-sm font-medium placeholder-slate-400"
                    placeholder="經緯度座標 (例如: 24.123, 120.456)"
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <MapPin size={16} />
                  </div>
                  {coordinates && (
                    <button
                      type="button"
                      onClick={() => setValue('coordinates', '')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition-colors"
                      title="清除座標"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleGetCurrentLocation}
                  disabled={isLocating}
                  title="取得手機目前位置"
                  className="px-3.5 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-xl font-bold text-xs hover:bg-emerald-100 transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-95 disabled:opacity-60 cursor-pointer shadow-2xs"
                >
                  {isLocating ? <Loader2 size={15} className="animate-spin" /> : <Crosshair size={15} />}
                  <span>{isLocating ? '定位中...' : '定位'}</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setShowMapPicker(true)}
                  className="px-3.5 py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200/80 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-95 cursor-pointer shadow-2xs"
                >
                  <MapPin size={15} /> 標記
                </button>
              </div>
              <p className="text-[11px] text-slate-400 ml-1">選填｜上傳含定位的照片可自動帶入，或點「定位」取得目前位置</p>
            </div>

            <div className={`space-y-1.5 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-xs font-bold text-slate-700 ml-1">
                損壞狀況 <span className="text-rose-500">*</span>
              </label>
              <input {...register('damage_condition', { required: true })} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder-slate-400" placeholder="例如: 坑洞、裂縫" />
            </div>

            <div className={`space-y-1.5 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-xs font-bold text-slate-700 ml-1">改善方式</label>
              <select {...register('improvement_method')} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer">
                <option value="優先處理">優先處理</option>
                <option value="建議刨鋪">建議刨鋪</option>
                <option value="持續觀察">持續觀察</option>
                <option value="列入年度計畫">列入年度計畫</option>
              </select>
            </div>

            <div className={`space-y-1.5 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-xs font-bold text-slate-700 ml-1">監造審查</label>
              <input {...register('supervision_review')} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder-slate-400" placeholder="審查意見" />
            </div>

            <div className={`space-y-1.5 ${isAssignmentEditMode ? 'opacity-60 pointer-events-none' : ''}`}>
              <label className="block text-xs font-bold text-slate-700 ml-1">後續處理方式</label>
              <input {...register('follow_up_method')} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder-slate-400" placeholder="例如: 列入年度計畫" />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 ml-1">完成時間</label>
              <input type="datetime-local" {...register('completion_time')} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all" />
            </div>
          </div>

          <div className="sticky bottom-0 bg-white/95 backdrop-blur-md pt-4 pb-4 flex gap-3 justify-end border-t border-slate-100 -mx-5 sm:-mx-7 px-5 sm:px-7 shadow-xs">
            <button 
              type="button" 
              onClick={onCancel} 
              disabled={isSubmitting} 
              className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              取消
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting} 
              className="px-7 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 shadow-md shadow-indigo-500/25 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/50 border-t-white"></div>}
              <span>{isSubmitting ? '正在儲存...' : (initialData ? '更新紀錄' : '儲存紀錄')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
