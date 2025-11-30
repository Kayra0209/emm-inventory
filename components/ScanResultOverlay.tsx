import React from 'react';
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
      icon = <CheckCircle2 size={80} className="text-white drop-shadow-md" />;
      title = "掃描成功";
      message = record?.PartID || "";
      textColor = "text-white";
      break;
    case 'Checked':
      bgColor = "bg-blue-500/95";
      icon = <CheckCircle size={80} className="text-white drop-shadow-md" />;
      title = "已確認";
      message = record?.PartID || "";
      textColor = "text-white";
      break;
    case 'Not Found':
      bgColor = "bg-red-500/95";
      icon = <XCircle size={80} className="text-white drop-shadow-md" />;
      title = "查無資料";
      message = "此物料不在清單中";
      textColor = "text-white";
      break;
    case 'Duplicated':
      bgColor = "bg-amber-500/95";
      icon = <AlertTriangle size={80} className="text-white drop-shadow-md" />;
      title = "重複盤點";
      message = "此條碼已掃描過";
      textColor = "text-white";
      break;
  }

  return (
    <div className={`absolute inset-0 z-40 flex items-center justify-center pointer-events-none animate-in fade-in zoom-in duration-200`}>
      <div className={`${bgColor} backdrop-blur-sm w-4/5 max-w-sm p-8 rounded-3xl shadow-2xl flex flex-col items-center justify-center text-center space-y-4`}>
        <div className="animate-bounce-short">
          {icon}
        </div>
        <div>
          <h2 className={`text-3xl font-bold ${textColor} tracking-tight mb-2`}>{title}</h2>
          <p className={`text-xl font-mono opacity-90 ${textColor} break-all`}>{message}</p>
          {record?.Description && status === 'OK' && (
             <p className={`text-sm mt-2 opacity-80 ${textColor} line-clamp-2`}>{record.Description}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScanResultOverlay;
