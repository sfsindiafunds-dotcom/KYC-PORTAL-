import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Eye,
  X,
  RotateCcw,
  Check,
  Circle,
  ImageIcon,
} from 'lucide-react';
import { uploadKycDocument } from '../../services/clientService.ts';

export type UploadStatus = 'not_uploaded' | 'uploading' | 'uploaded' | 'error';

export interface KycImageUploadCardProps {
  id: string;
  fieldKey: string;
  label: string;
  subtitle: string;
  imageUrl?: string;
  imageName?: string;
  imageSize?: number;
  userId: string;
  errorMessage?: string;
  onUploadSuccess: (url: string, fileName: string, size: number) => Promise<void>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
}

export const KycImageUploadCard: React.FC<KycImageUploadCardProps> = ({
  id,
  fieldKey,
  label,
  subtitle,
  imageUrl,
  imageName,
  imageSize,
  userId,
  errorMessage,
  onUploadSuccess,
  onRemove,
  disabled = false,
}) => {
  const [status, setStatus] = useState<UploadStatus>(imageUrl ? 'uploaded' : 'not_uploaded');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [showReplaceOptions, setShowReplaceOptions] = useState<boolean>(false);
  const [showTakePhotoPrompt, setShowTakePhotoPrompt] = useState<boolean>(false);
  const [showLightbox, setShowLightbox] = useState<boolean>(false);
  const [lastSelectedFile, setLastSelectedFile] = useState<File | null>(null);

  // Camera capture review state: photo taken, waiting for "Continue with Photo" or "Retake Photo"
  const [capturedPhoto, setCapturedPhoto] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);

  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Keep status synchronized with incoming imageUrl (restores when page is refreshed)
  useEffect(() => {
    if (imageUrl) {
      setStatus('uploaded');
      setInternalError(null);
    } else if (status !== 'uploading') {
      setStatus('not_uploaded');
    }
  }, [imageUrl]);

  // Clean up captured photo preview object URL when resetting
  useEffect(() => {
    return () => {
      if (capturedPhoto?.previewUrl && capturedPhoto.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(capturedPhoto.previewUrl);
      }
    };
  }, [capturedPhoto]);

  // Process upload immediately to Firebase Storage using uploadBytesResumable
  const processUpload = async (file: File) => {
    if (!userId) {
      setInternalError('User session expired. Please sign in again.');
      setStatus('error');
      return;
    }

    // Client-side validations
    if (file.size > 5 * 1024 * 1024) {
      setInternalError('File size exceeds the 5 MB maximum limit.');
      setStatus('error');
      return;
    }

    const validExtensions = /\.(jpe?g|png)$/i;
    const validMimes = ['image/jpeg', 'image/jpg', 'image/png'];
    const isMimeValid = validMimes.includes(file.type);
    const isExtValid = validExtensions.test(file.name);

    if (!isMimeValid && !isExtValid) {
      setInternalError('Permitted formats are JPG, JPEG and PNG only.');
      setStatus('error');
      return;
    }

    setLastSelectedFile(file);
    setStatus('uploading');
    setUploadProgress(0);
    setInternalError(null);

    try {
      const res = await uploadKycDocument(
        file,
        fieldKey,
        userId,
        file.name,
        imageUrl,
        (percent) => {
          setUploadProgress(percent);
        }
      );

      await onUploadSuccess(res.url, res.fileName, res.size);
      setStatus('uploaded');
      setUploadProgress(100);
      setInternalError(null);
    } catch (err) {
      console.error('Image upload failed:', err);
      const msg = err instanceof Error ? err.message : 'Upload failed. Please check connection and try again.';
      setInternalError(msg);
      setStatus('error');
    }
  };

  // Gallery input change (open phone gallery)
  const handleGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setShowReplaceOptions(false);
      setShowTakePhotoPrompt(false);
      processUpload(file);
    }
    if (e.target) e.target.value = '';
  };

  // Camera input change (captured photo from phone camera)
  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setShowReplaceOptions(false);
      setShowTakePhotoPrompt(false);
      const previewUrl = URL.createObjectURL(file);
      setCapturedPhoto({ file, previewUrl });
    }
    if (e.target) e.target.value = '';
  };

  // User accepts camera photo: "Continue with Photo" -> Immediately uploads to Firebase Storage
  const handleContinueWithPhoto = () => {
    if (capturedPhoto) {
      const fileToUpload = capturedPhoto.file;
      setCapturedPhoto(null);
      processUpload(fileToUpload);
    }
  };

  // User wants to retake camera photo: "Retake Photo" -> Re-opens camera
  const handleRetakePhoto = () => {
    if (capturedPhoto?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(capturedPhoto.previewUrl);
    }
    setCapturedPhoto(null);
    setTimeout(() => {
      cameraInputRef.current?.click();
    }, 150);
  };

  // Retry upload on failure
  const handleRetry = () => {
    if (lastSelectedFile) {
      processUpload(lastSelectedFile);
    } else {
      galleryInputRef.current?.click();
    }
  };

  const displayError = internalError || errorMessage;

  return (
    <div
      id={id}
      className={`p-5 rounded-2xl border transition-all duration-200 relative ${
        displayError
          ? 'border-rose-400 bg-rose-50/30'
          : status === 'uploaded'
          ? 'border-emerald-300 bg-emerald-50/20'
          : status === 'uploading'
          ? 'border-sky-300 bg-sky-50/30'
          : 'border-slate-200 bg-slate-50/50'
      }`}
    >
      {/* Hidden File Inputs for Gallery and Camera */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png"
        onChange={handleGalleryChange}
        className="hidden"
        disabled={disabled || status === 'uploading'}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png"
        capture="environment"
        onChange={handleCameraChange}
        className="hidden"
        disabled={disabled || status === 'uploading'}
      />

      {/* Header with Title and Independent Status Indicator */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
            {label} <span className="text-rose-500">*</span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        {/* 4 Required Independent Statuses: Not Uploaded | Uploading... with % | Image Uploaded Successfully | Upload Failed – Try Again */}
        <div className="shrink-0">
          {status === 'not_uploaded' && (
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <Circle className="w-2.5 h-2.5 text-slate-400 fill-slate-300" />
              Not Uploaded
            </span>
          )}

          {status === 'uploading' && (
            <span className="text-[10px] sm:text-[11px] font-bold text-sky-800 bg-sky-100 border border-sky-300 px-2.5 py-1 rounded-full flex items-center gap-1.5 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-sky-700" />
              Uploading... {uploadProgress > 0 ? `${uploadProgress}%` : ''}
            </span>
          )}

          {status === 'uploaded' && (
            <span className="text-[10px] sm:text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Image Uploaded Successfully
            </span>
          )}

          {status === 'error' && (
            <button
              type="button"
              onClick={handleRetry}
              className="text-[10px] sm:text-[11px] font-bold text-rose-800 bg-rose-100 hover:bg-rose-200 border border-rose-300 px-2.5 py-1 rounded-full flex items-center gap-1.5 transition cursor-pointer"
              title="Click to retry upload"
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              Upload Failed – Try Again
            </button>
          )}
        </div>
      </div>

      {/* Main Body: Uploaded Preview vs Upload Trigger Buttons */}
      {status === 'uploaded' && imageUrl ? (
        <div className="space-y-3 mt-2">
          {/* Tappable Image Preview */}
          <div
            onClick={() => setShowReplaceOptions(true)}
            className="group relative rounded-xl overflow-hidden border border-slate-200 bg-white p-2.5 cursor-pointer hover:border-sky-500 hover:shadow-xs transition"
            title="Touch or click image to change or replace"
          >
            <div className="h-32 sm:h-36 w-full flex items-center justify-center bg-slate-50 rounded-lg overflow-hidden relative">
              <img
                src={imageUrl}
                alt={label}
                className="max-h-full max-w-full object-contain rounded-md transition-transform group-hover:scale-102"
              />
              <div className="absolute inset-0 bg-sky-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="bg-white/95 text-sky-950 text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-sky-800" /> Touch to Change / Replace
                </span>
              </div>
            </div>
            <p className="text-[10px] text-center text-slate-400 mt-1 font-medium">
              Touch image to Change, View or Replace
            </p>
          </div>

          {/* Action Row: File Name & Controls */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-700 truncate max-w-[160px] sm:max-w-[200px]">
                {imageName || `${fieldKey}.jpg`}
              </p>
              {imageSize ? (
                <p className="text-[10px] text-slate-400">
                  {(imageSize / 1024).toFixed(1)} KB • Verified
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLightbox(true)}
                className="px-2.5 py-1 text-slate-600 hover:text-slate-900 font-semibold text-xs rounded-lg hover:bg-slate-100 transition flex items-center gap-1 cursor-pointer"
                title="View full image"
              >
                <Eye className="w-3.5 h-3.5" /> View
              </button>

              <button
                type="button"
                onClick={() => setShowReplaceOptions(true)}
                className="px-2.5 py-1 text-sky-900 hover:text-sky-950 font-bold text-xs rounded-lg bg-sky-50 hover:bg-sky-100 transition flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Replace
              </button>

              <button
                type="button"
                onClick={onRemove}
                className="px-2 py-1 text-rose-600 hover:text-rose-800 font-bold text-xs rounded-lg hover:bg-rose-50 transition flex items-center gap-1 cursor-pointer"
                title="Remove uploaded image"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : status === 'uploading' ? (
        /* Uploading In-Progress State with Progress Bar */
        <div className="py-8 px-4 flex flex-col items-center justify-center bg-white rounded-xl border border-sky-200 text-center">
          <Loader2 className="w-8 h-8 text-sky-700 animate-spin mb-2" />
          <p className="font-bold text-xs text-sky-950">
            Uploading to Firebase Storage... {uploadProgress > 0 ? `${uploadProgress}%` : ''}
          </p>
          <div className="w-48 bg-slate-100 rounded-full h-2 mt-2.5 overflow-hidden border border-slate-200">
            <div
              className="bg-sky-600 h-2 rounded-full transition-all duration-200"
              style={{ width: `${Math.max(5, uploadProgress)}%` }}
            ></div>
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">Please wait while the image is securely verified.</p>
        </div>
      ) : (
        /* Not Uploaded / Error State: Dual Finger-Friendly Action Buttons */
        <div className="mt-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* 1. Upload Image (opens phone gallery directly) */}
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={disabled}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-sky-950 hover:bg-sky-900 active:scale-98 text-white rounded-xl font-bold text-xs transition shadow-xs cursor-pointer"
            >
              <Upload className="w-4 h-4 text-sky-200" />
              <span>Upload Image</span>
            </button>

            {/* 2. Take Photo (opens prompt: Choose from Gallery or Take Photo) */}
            <button
              type="button"
              onClick={() => setShowTakePhotoPrompt(true)}
              disabled={disabled}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-slate-50 active:scale-98 text-sky-950 border border-slate-300 rounded-xl font-bold text-xs transition shadow-2xs cursor-pointer"
            >
              <Camera className="w-4 h-4 text-sky-700" />
              <span>Take Photo</span>
            </button>
          </div>

          <p className="text-[10px] text-slate-500 text-center">
            JPG, JPEG or PNG • Max 5 MB per file
          </p>
        </div>
      )}

      {/* Error Message Display */}
      {displayError && (
        <div className="mt-2.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
          <span className="flex-1">{displayError}</span>
          {status === 'error' && (
            <button
              type="button"
              onClick={handleRetry}
              className="text-[10px] font-bold text-rose-900 underline hover:no-underline ml-1"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Prompt Modal when "Take Photo" is clicked:
          "Show two options:
           - Choose from Gallery.
           - Take Photo." */}
      {showTakePhotoPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-900 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Select Image Source</h4>
                  <p className="text-[11px] text-slate-500">{label}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTakePhotoPrompt(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 mt-4">
              {/* Option 1: Take Photo */}
              <button
                type="button"
                onClick={() => {
                  setShowTakePhotoPrompt(false);
                  setTimeout(() => cameraInputRef.current?.click(), 100);
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-sky-900 hover:bg-sky-50/50 text-left transition font-bold text-xs text-slate-800 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-lg bg-sky-100 text-sky-900 flex items-center justify-center shrink-0">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Take Photo</p>
                  <p className="text-[10px] text-slate-500 font-normal">Capture document using phone camera</p>
                </div>
              </button>

              {/* Option 2: Choose from Gallery */}
              <button
                type="button"
                onClick={() => {
                  setShowTakePhotoPrompt(false);
                  setTimeout(() => galleryInputRef.current?.click(), 100);
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-sky-900 hover:bg-sky-50/50 text-left transition font-bold text-xs text-slate-800 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-900 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Choose from Gallery</p>
                  <p className="text-[10px] text-slate-500 font-normal">Select image from phone gallery</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setShowTakePhotoPrompt(false)}
                className="w-full py-2.5 text-center font-bold text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer mt-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Option Sheet Modal: "Replace an Already Uploaded Image"
          "When a client touches an uploaded image, show:
           - View Image.
           - Choose Another Image.
           - Take Photo.
           - Remove Image." */}
      {showReplaceOptions && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-900 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Image Options</h4>
                  <p className="text-[11px] text-slate-500">{label}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReplaceOptions(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 mt-3.5">
              {/* Option 1: View Image */}
              <button
                type="button"
                onClick={() => {
                  setShowReplaceOptions(false);
                  setShowLightbox(true);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-sky-900 hover:bg-sky-50/50 text-left transition font-bold text-xs text-slate-800 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">View Image</p>
                  <p className="text-[10px] text-slate-500 font-normal">Inspect uploaded document in full resolution</p>
                </div>
              </button>

              {/* Option 2: Choose Another Image */}
              <button
                type="button"
                onClick={() => {
                  setShowReplaceOptions(false);
                  setTimeout(() => galleryInputRef.current?.click(), 100);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-sky-900 hover:bg-sky-50/50 text-left transition font-bold text-xs text-slate-800 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-900 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Choose Another Image</p>
                  <p className="text-[10px] text-slate-500 font-normal">Select a replacement from phone gallery</p>
                </div>
              </button>

              {/* Option 3: Take Photo */}
              <button
                type="button"
                onClick={() => {
                  setShowReplaceOptions(false);
                  setTimeout(() => cameraInputRef.current?.click(), 100);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-sky-900 hover:bg-sky-50/50 text-left transition font-bold text-xs text-slate-800 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Take Photo</p>
                  <p className="text-[10px] text-slate-500 font-normal">Capture replacement with camera</p>
                </div>
              </button>

              {/* Option 4: Remove Image */}
              <button
                type="button"
                onClick={() => {
                  setShowReplaceOptions(false);
                  onRemove();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-rose-200 hover:bg-rose-50 text-left transition font-bold text-xs text-rose-700 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-rose-800">Remove Image</p>
                  <p className="text-[10px] text-rose-500 font-normal">Delete this document</p>
                </div>
              </button>

              {/* Option 5: Cancel */}
              <button
                type="button"
                onClick={() => setShowReplaceOptions(false)}
                className="w-full py-2.5 text-center font-bold text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer mt-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Capture Review Modal:
          "Show two options:
           - Retake Photo.
           - Continue with Photo." */}
      {capturedPhoto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm sm:text-base">Review Captured Photo</h4>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
              <button
                type="button"
                onClick={() => setCapturedPhoto(null)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Photo Preview */}
            <div className="my-3 rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center max-h-[320px]">
              <img
                src={capturedPhoto.previewUrl}
                alt="Captured Camera Preview"
                className="max-h-[320px] w-auto max-w-full object-contain"
              />
            </div>

            <p className="text-[11px] text-slate-500 text-center mb-4 font-medium">
              Check that all document details and text are clear and legible before continuing.
            </p>

            {/* Two Required Actions: Retake Photo vs Continue with Photo */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleRetakePhoto}
                className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                <span>Retake Photo</span>
              </button>

              <button
                type="button"
                onClick={handleContinueWithPhoto}
                className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Continue with Photo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Full View Image */}
      {showLightbox && imageUrl && (
        <div
          onClick={() => setShowLightbox(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="relative max-w-2xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowLightbox(false)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300 flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <X className="w-5 h-5" /> Close
            </button>
            <img
              src={imageUrl}
              alt={label}
              className="max-h-[82vh] w-auto max-w-full object-contain rounded-xl shadow-2xl"
            />
            <p className="text-white/80 text-xs mt-2 text-center font-medium">
              {label} • {imageName || 'Document'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
