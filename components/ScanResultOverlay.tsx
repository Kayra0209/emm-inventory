import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ScanStatus, InventoryRecord } from '../types';

interface ScanResultOverlayProps {
  status: ScanStatus | 'IDLE';
  record?: InventoryRecord;
  visible: boolean;
}

const ScanResultOverlay: React.FC<ScanResultOverlayProps> = ({ status, record, visible }) => {
  if (!visible || status === 'IDLE') return null;

  let bgColor = "bg-white";
  let icon = <CheckCircle size={64} />;
  let title = "";
  let message = "";
  let textColor = "text-stone-800";

  switch (status) {
    case 'OK':
      bgColor = "bg-emerald-500/95";
      icon = <CheckCircle2 size={72} className="text-white drop-shadow-md" />;
      title = "掃描成功";
      message = record?.PartID || "";
      textColor = "text-white";
      break;
    case 'Checked':
      bgColor = "bg-blue-500/95";
      icon = <CheckCircle size={72} className="text-white drop-shadow-md" />;
      title = "已確認";
      message = record?.PartID || "";
      textColor = "text-white";
      break;
    case 'Not Found':
      bgColor = "bg-red-500/95";
      icon = <XCircle size={72} className="text-white drop-shadow-md" />;
      title = "查無資料";
      message = "此物料不在清單中";
      textColor = "text-white";
      break;
    case 'Duplicated':
      bgColor = "bg-amber-500/95";
      icon = <AlertTriangle size={72} className="text-white drop-shadow-md" />;
      title = "重複盤點";
      message = "此條碼已掃描過";
      textColor = "text-white";
      break;
  }

  return (
    <div className={`absolute inset-0 z-[60] flex items-center justify-center pointer-events-none animate-in fade-in zoom-in duration-200`}>
      <div className={`${bgColor} backdrop-blur-sm w-[85%] max-w-sm p-6 rounded-3xl shadow-2xl flex flex-col items-center justify-center text-center space-y-3`}>
        <div className="animate-bounce-short">
          {icon}
        </div>
        <div className="w-full">
          <h2 className={`text-2xl font-bold ${textColor} tracking-tight mb-1`}>{title}</h2>
          
          {/* Part ID / Message */}
          {status !== 'Not Found' ? (
             <p className={`text-lg font-mono font-bold opacity-95 ${textColor} break-all leading-tight`}>{message}</p>
          ) : (
             <p className={`text-lg font-bold opacity-95 ${textColor}`}>{message}</p>
          )}

          {/* NEW: Class Field Display */}
          {record?.Class && status !== 'Not Found' && (
            <div className="mt-2">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border border-white/30 ${textColor} bg-white/20`}>
                  {record.Class}
                </span>
            </div>
          )}

          {/* UPDATED: Full Description (Scrollable, No Truncate) */}
          {record?.Description && status !== 'Not Found' && (
             <div className={`mt-3 text-xs opacity-90 ${textColor} text-left bg-black/10 p-3 rounded-xl max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-white/10`}>
               {record.Description}
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScanResultOverlay;
