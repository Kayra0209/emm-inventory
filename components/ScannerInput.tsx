import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';
import { Flashlight, FlashlightOff, XCircle, RefreshCw } from 'lucide-react';

interface ScannerInputProps {
  onScan: (decodedText: string) => void;
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
}

const ScannerInput: React.FC<ScannerInputProps> = ({ onScan, isScanning, setIsScanning }) => {
  const scannerRegionId = 'html5qr-code-full-region';
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false); 
  
  // Anti-jitter
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const COOLDOWN_MS = 1500; 

  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (html5QrCodeRef.current) {
        try { html5QrCodeRef.current.stop(); } catch(e) {}
        try { html5QrCodeRef.current.clear(); } catch(e) {}
      }
    };
  }, []);

  const startScannerOperation = async (currentRequestId: number) => {
    if (!isMountedRef.current) return;
    setIsInitializing(true);
    setCameraError(null);

    await new Promise(r => setTimeout(r, 100));
    if (!document.getElementById(scannerRegionId)) {
        return;
    }

    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        await html5QrCodeRef.current.clear();
      } catch (e) { /* ignore */ }
    }

    try {
      const qrCode = new Html5Qrcode(scannerRegionId);
      html5QrCodeRef.current = qrCode;

      // --- CRITICAL CONFIGURATION FIX ---
      // Problem: 
      // 1. Zoom/Crop issue -> Caused by 16:9 aspect ratio request.
      // 2. Code-39/128 scan failure -> Caused by low resolution (default 640x480).
      //
      // Solution:
      // Request 1280x960 (4:3 High Res). 
      // This matches most phone sensors natively, preventing crop (zoom) while providing sharpness for 1D barcodes.
      const cameraIdOrConfig = {
          facingMode: "environment",
          width: { min: 1024, ideal: 1280, max: 1920 },
          height: { min: 768, ideal: 960, max: 1440 }
      };

      const config = {
        fps: 15, // Increased FPS for faster barcode acquisition
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            // Increased to 85% to make it easier to fit long barcodes (Code-39)
            return {
                width: Math.floor(minEdge * 0.85),
                height: Math.floor(minEdge * 0.85)
            };
        },
        formatsToSupport: [ 
            Html5QrcodeSupportedFormats.QR_CODE, 
            Html5QrcodeSupportedFormats.CODE_128, 
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.UPC_A
        ],
        // Experimental feature often improves 1D barcode reading on mobile
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
        }
      };

      if (!isMountedRef.current || currentRequestId !== requestIdRef.current) return;

      await qrCode.start(
        cameraIdOrConfig,
        config,
        (decodedText) => {
           if (isMountedRef.current) {
             const now = Date.now();
             if (decodedText === lastScannedCodeRef.current && (now - lastScannedTimeRef.current < COOLDOWN_MS)) {
                return;
             }
             lastScannedCodeRef.current = decodedText;
             lastScannedTimeRef.current = now;
             onScanRef.current(decodedText);
           }
        },
        () => {}
      );

      // Attempt to reset zoom again just in case
      if (isMountedRef.current) {
         try {
             // @ts-ignore
             const track = qrCode.getRunningTrackCameraCapabilities();
             // @ts-ignore
             if (track && track.zoom) {
                 await qrCode.applyVideoConstraints({
                     // @ts-ignore
                     advanced: [{ zoom: 1.0 }] 
                 } as any);
             }
             setHasTorch(true);
         } catch(e) {}
      }

      setIsInitializing(false);

    } catch (err: any) {
      console.error("Scanner Start Error", err);
      setIsInitializing(false);
      
      if (isMountedRef.current && currentRequestId === requestIdRef.current) {
        let msg = "未知錯誤";
        if (typeof err === 'string') msg = err;
        if (err?.name) msg = `${err.name}: ${err.message}`;
        setCameraError(`無法啟動相機。\n${msg}\n請確認：\n1. 使用 HTTPS 連線 (iOS 限制)\n2. 已允許瀏覽器相機權限\n3. 嘗試重新整理頁面`);
      }
    }
  };

  useEffect(() => {
    if (isScanning) {
      requestIdRef.current++;
      startScannerOperation(requestIdRef.current);
    } else {
      const stop = async () => {
          if (html5QrCodeRef.current) {
              try {
                  if (html5QrCodeRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
                      await html5QrCodeRef.current.stop();
                  }
                  html5QrCodeRef.current.clear();
              } catch(e) {}
          }
      };
      stop();
    }
  }, [isScanning]);

  const toggleTorch = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.applyVideoConstraints({
          advanced: [{ torch: !torchOn }]
        } as any);
        setTorchOn(!torchOn);
      } catch (err) {
        setHasTorch(false);
      }
    }
  };

  const handleRetry = () => {
     requestIdRef.current++;
     startScannerOperation(requestIdRef.current);
  };

  if (!isScanning) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900 flex flex-col items-center justify-center">
      <div className="relative w-full max-w-md bg-black h-full flex flex-col justify-center">
        
        {/* Scanner Container */}
        <div className="w-full flex-1 relative bg-black flex items-center justify-center overflow-hidden">
            {isInitializing && !cameraError && (
                <div className="absolute text-white z-10 flex flex-col items-center gap-2">
                    <RefreshCw className="animate-spin" />
                    <span className="text-xs">啟動相機中...</span>
                </div>
            )}
            <div id={scannerRegionId} className="w-full h-full" />
        </div>
        
        {/* Controls */}
        <div className="absolute top-4 right-4 flex gap-4 z-20">
          {hasTorch && !cameraError && (
            <button 
              onClick={toggleTorch}
              className="p-3 bg-stone-800/80 rounded-full text-amber-400 backdrop-blur-sm border border-stone-700 active:scale-95 transition-transform"
            >
              {torchOn ? <FlashlightOff size={24} /> : <Flashlight size={24} />}
            </button>
          )}
          <button 
            onClick={() => setIsScanning(false)}
            className="p-3 bg-stone-800/80 rounded-full text-stone-200 backdrop-blur-sm border border-stone-700 active:scale-95 transition-transform"
          >
            <XCircle size={24} />
          </button>
        </div>

        {/* Visual Guide Overlay */}
        {!cameraError && !isInitializing && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                <div className="w-[280px] h-[280px] border-2 border-amber-500/50 rounded-lg relative">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-amber-500 rounded-tl-sm"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-amber-500 rounded-tr-sm"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-amber-500 rounded-bl-sm"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-amber-500 rounded-br-sm"></div>
                    <div className="absolute left-2 right-2 h-0.5 bg-amber-400/80 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-scan top-1/2"></div>
                </div>
            </div>
        )}
        
        <div className="absolute bottom-12 left-0 right-0 text-center z-20">
            <p className="text-stone-300 text-sm font-medium tracking-wide bg-black/30 py-1 backdrop-blur-sm">
                請將條碼對準框框中心
            </p>
        </div>
      </div>
      
      {cameraError && (
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 p-4 bg-red-900/90 text-white rounded-xl text-center backdrop-blur-sm animate-in fade-in flex flex-col items-center gap-3 z-50 shadow-2xl border border-red-700">
           <div>
             <p className="font-bold mb-2 text-lg">相機啟動失敗</p>
             <p className="text-xs whitespace-pre-line leading-relaxed opacity-90 text-left bg-black/20 p-2 rounded max-h-40 overflow-y-auto">{cameraError}</p>
           </div>
           <button 
             onClick={handleRetry}
             className="mt-2 px-6 py-2 bg-white text-red-900 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-stone-100 active:scale-95 transition-all shadow-md"
           >
             <RefreshCw size={14} />
             重試
           </button>
         </div>
      )}
    </div>
  );
};

export default ScannerInput;
