import React, { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import { useInView } from 'react-intersection-observer';

interface LazyPhotoProps {
  id: number | undefined;
  initialPhoto: string | undefined;
  isViewed: boolean;
  onGetPhoto: (id: number) => Promise<string>;
  onClick: () => void;
  className?: string;
  badgeClassName?: string;
}

export const LazyPhoto = React.memo(({ 
  id, 
  initialPhoto, 
  isViewed, 
  onGetPhoto, 
  onClick, 
  className = "", 
  badgeClassName = "" 
}: LazyPhotoProps) => {
  const [photo, setPhoto] = useState<string | null>(initialPhoto || null);
  const [loading, setLoading] = useState(false);
  const { ref, inView } = useInView({
    triggerOnce: true,
    rootMargin: '200px 0px', // Fetch slightly before it enters the viewport
  });

  useEffect(() => {
    if (photo || !id || !inView) return;

    let isMounted = true;
    setLoading(true);

    onGetPhoto(id)
      .then(fetchedPhoto => {
        if (isMounted && fetchedPhoto) {
          setPhoto(fetchedPhoto);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [inView, id, photo, onGetPhoto]);

  useEffect(() => {
    if (initialPhoto && initialPhoto !== photo) {
      setPhoto(initialPhoto);
    }
  }, [initialPhoto]);

  return (
    <div 
      ref={ref}
      className={`relative flex items-center justify-center overflow-hidden cursor-pointer bg-gray-50 group ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={isViewed ? '已看過' : '查看照片'}
    >
      {photo ? (
        <img src={photo} alt="縮圖" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
      ) : loading ? (
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-200 border-t-indigo-600" />
      ) : (
        <Camera size={className.includes('w-24') ? 24 : 18} className="text-gray-400" />
      )}
      
      {isViewed && (
        <span className={`absolute flex items-center justify-center bg-green-500 rounded-full shadow border border-white ${badgeClassName}`}>
          <svg width="60%" height="60%" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1.5 5 4 7.5 8.5 2.5" />
          </svg>
        </span>
      )}
    </div>
  );
});

LazyPhoto.displayName = 'LazyPhoto';
