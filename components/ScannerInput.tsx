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
  
  // Anti-jitter: Track last scanned code and time
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const COOLDOWN_MS = 1500; // 1.5 seconds cooldown for the SAME code

  // Use a ref to keep onScan fresh without restarting the effect/scanner
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Queue to serialize scanner operations (start/stop)
  const taskQueue = useRef<Promise<void>>(Promise.resolve());
  const isMountedRef = useRef(true);
  
  // Track requests to ignore stale async operations (e.g. stop called while start is pending)
  const requestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const queueTask = (task: () => Promise<void>) => {
    taskQueue.current = taskQueue.current
      .then(() => task())
      .catch((err) => {
        console.warn("Scanner task failed:", err);
      });
  };

  const startScannerOperation = async (currentRequestId: number) => {
    if (!isMountedRef.current) return;
    if (currentRequestId !== requestIdRef.current) return; // Cancel if obsolete

    setCameraError(null);

    // Safety cleanup of any existing instance
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) { /* ignore */ }
      try {
        await html5QrCodeRef.current.clear();
      } catch (e) { /* ignore */ }
    }

    // Check if DOM element exists before initializing
    if (!document.getElementById(scannerRegionId)) {
        return;
    }

    try {
      const qrCode = new Html5Qrcode(scannerRegionId);
      html5QrCodeRef.current = qrCode;

      const config = {
        fps: 10,
        // DYNAMIC QRBOX: Fixes black screen on mobile by ensuring box is never larger than video feed
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return {
                width: Math.floor(minEdge * 0.7), // 70% of the screen width
                height: Math.floor(minEdge * 0.7)
            };
        },
        formatsToSupport: [ 
            Html5QrcodeSupportedFormats.QR_CODE, 
            Html5QrcodeSupportedFormats.CODE_128, 
            Html5QrcodeSupportedFormats.EAN_13 
        ]
      };

      // SIMPLIFIED CONSTRAINTS: 
      // Removing width/height constraints is crucial for iOS stability.
      // iOS Safari often throws OverconstrainedError if we ask for specific resolutions it doesn't support perfectly.
      const constraints = { 
        facingMode: "environment"
      };

      await qrCode.start(
        constraints,
        config,
        (decodedText) => {
           if (isMountedRef.current) {
             const now = Date.now();
             // Cooldown Check: exact same code within 1.5s? Ignore it.
             if (decodedText === lastScannedCodeRef.current && (now - lastScannedTimeRef.current < COOLDOWN_MS)) {
                return;
             }
             
             lastScannedCodeRef.current = decodedText;
             lastScannedTimeRef.current = now;
             
             onScanRef.current(decodedText);
           }
        },
        () => {
          // Continuous mode: ignore frame failures
        }
      );

      // Only enable torch if still mounted and same request
      if (isMountedRef.current && currentRequestId === requestIdRef.current) {
         try {
           const cameras = await Html5Qrcode.getCameras();
           if (cameras && cameras.length > 0) setHasTorch(true);
         } catch(e) { /* ignore */ }
      }
    } catch (err: any) {
      console.error("Error starting scanner", err);
      if (isMountedRef.current && currentRequestId === requestIdRef.current) {
        // Show the actual error message for better debugging
        let detailedMsg = err?.message || err || "未知錯誤";
        if (err?.name === 'NotAllowedError') {
            detailedMsg = "存取被拒 (NotAllowedError)。\n請到設定允許相機權限。";
        } else if (err?.name === 'NotFoundError') {
            detailedMsg = "找不到相機裝置 (NotFoundError)。";
        } else if (err?.name === 'NotReadableError') {
            detailedMsg = "相機硬體無法存取 (NotReadableError)。\n可能被其他 App 佔用，請重開機。";
        }

        setCameraError(`無法啟動相機。\n\n錯誤代碼: ${detailedMsg}\n\n請確認：\n1. 使用 HTTPS 連線 (iOS 限制)\n2. 已允許瀏覽器相機權限\n3. 嘗試重新整理頁面`);
      }
    }
  };

  const stopScannerOperation = async () => {
    const qrCode = html5QrCodeRef.current;
    if (!qrCode) return;

    try {
      // Defensive stop: check state or just try stopping
      try {
        const state = qrCode.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
            await qrCode.stop();
        }
      } catch(e) {
        // If state check failed, just proceed to clear
      }
      await qrCode.clear();
    } catch (err) {
      // Ignore errors if already stopped/cleared
    }

    html5QrCodeRef.current = null;
    lastScannedCodeRef.current = null; // Reset debounce on stop
    if (isMountedRef.current) {
      setTorchOn(false);
    }
  };

  useEffect(() => {
    requestIdRef.current++;
    const currentId = requestIdRef.current;

    if (isScanning) {
      queueTask(() => startScannerOperation(currentId));
    } else {
      queueTask(stopScannerOperation);
    }

    return () => {
      // On unmount/change, queue a stop
      queueTask(stopScannerOperation);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  const toggleTorch = async () => {
    if (html5QrCodeRef.current && hasTorch) {
      try {
        await html5QrCodeRef.current.applyVideoConstraints({
          advanced: [{ torch: !torchOn }]
        } as any);
        setTorchOn(!torchOn);
      } catch (err) {
        console.warn("Torch not supported", err);
        setHasTorch(false);
      }
    }
  };

  const handleRetry = () => {
     setCameraError(null);
     requestIdRef.current++;
     const currentId = requestIdRef.current;
     queueTask(() => startScannerOperation(currentId));
  };

  if (!isScanning) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900 flex flex-col items-center justify-center">
      <div className="relative w-full max-w-md bg-black h-full flex flex-col justify-center">
        {/* Scanner Container */}
        {/* Ensure container takes full width and has height */}
        <div id={scannerRegionId} className="w-full flex-1 overflow-hidden" style={{ minHeight: '300px' }} />
        
        {/* Controls */}
        <div className="absolute top-4 right-4 flex gap-4 z-10">
          {hasTorch && (
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

        {/* Custom Earth-tone Visual Guide Overlay */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
             <div className="w-[220px] h-[220px] border-2 border-amber-500/50 rounded-lg relative">
                 <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-amber-500 rounded-tl-sm"></div>
                 <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-amber-500 rounded-tr-sm"></div>
                 <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-amber-500 rounded-bl-sm"></div>
                 <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-amber-500 rounded-br-sm"></div>
                 
                 {/* Laser Animation */}
                 <div className="absolute left-2 right-2 h-0.5 bg-amber-400/80 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-scan top-1/2"></div>
             </div>
        </div>
        
        <div className="absolute bottom-12 left-0 right-0 text-center">
            <p className="text-stone-300 text-sm font-medium tracking-wide bg-black/30 py-1 backdrop-blur-sm">
                請將條碼對準框框中心
            </p>
        </div>
      </div>
      
      {cameraError && (
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 p-4 bg-red-900/90 text-white rounded-xl text-center backdrop-blur-sm animate-in fade-in flex flex-col items-center gap-3 z-50 shadow-2xl border border-red-700">
           <div>
             <p className="font-bold mb-2 text-lg">相機啟動失敗</p>
             <p className="text-xs whitespace-pre-line leading-relaxed opacity-90 text-left bg-black/20 p-2 rounded">{cameraError}</p>
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
