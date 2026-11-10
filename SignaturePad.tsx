import React, { useRef, useState, useEffect } from 'react';
import { Eraser, CheckCircle2, Upload, PenLine } from 'lucide-react';

interface SignaturePadProps {
  initialSignature?: string;
  onSave: (dataUrl: string, type: 'drawn' | 'uploaded') => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ initialSignature, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(initialSignature || null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High DPI scaling
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = '#0f172a'; // Slate-900
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (initialSignature && initialSignature.startsWith('data:image')) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasDrawn(true);
      };
      img.src = initialSignature;
    }
  }, [mode]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e && e.touches[0]) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else if ('clientX' in e) {
      return {
        x: (e as React.MouseEvent).clientX - rect.left,
        y: (e as React.MouseEvent).clientY - rect.top,
      };
    }
    return { x: 0, y: 0 };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = (e?: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    if (e) e.preventDefault();
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      onSave(dataUrl, 'drawn');
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onSave('', 'drawn');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert('Signature image file size must be under 3 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setUploadedPreview(result);
      onSave(result, 'uploaded');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setMode('draw')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
            mode === 'draw'
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <PenLine className="w-3.5 h-3.5" />
          Draw on Screen (Touch / Mouse)
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
            mode === 'upload'
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Scanned Signature
        </button>
      </div>

      {mode === 'draw' ? (
        <div>
          <div className="relative border-2 border-dashed border-slate-300 rounded-lg bg-white overflow-hidden touch-none">
            <canvas
              ref={canvasRef}
              className="w-full h-44 cursor-crosshair block"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            {!hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-xs">
                <span>Sign your official signature here using finger or stylus</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            <button
              type="button"
              onClick={clearCanvas}
              className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-medium py-1 px-2 rounded hover:bg-rose-50"
            >
              <Eraser className="w-3.5 h-3.5" />
              Clear & Re-sign
            </button>
            {hasDrawn && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Signature Captured
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-6 bg-slate-50 hover:bg-slate-100 cursor-pointer transition">
            <Upload className="w-6 h-6 text-slate-400 mb-2" />
            <span className="text-xs font-medium text-slate-700">Click to upload signature image</span>
            <span className="text-[11px] text-slate-500 mt-1">PNG, JPG or JPEG (Max 3MB, clean white paper recommended)</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          {uploadedPreview && (
            <div className="p-3 border border-slate-200 rounded-lg bg-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={uploadedPreview}
                  alt="Signature Preview"
                  className="h-12 max-w-40 object-contain border border-slate-200 p-1 rounded bg-white"
                />
                <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Uploaded Successfully
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUploadedPreview(null);
                  onSave('', 'uploaded');
                }}
                className="text-xs text-rose-600 hover:text-rose-700"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
