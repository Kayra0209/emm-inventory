import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ScanLine, CheckCircle, ArrowRight } from 'lucide-react';
import { ScanStatus, InventoryRecord } from '../types';

interface StatusFeedbackProps {
  status: ScanStatus | 'IDLE';
  lastRecord?: InventoryRecord;
  onViewRelated?: () => void;
}

const StatusFeedback: React.FC<StatusFeedbackProps> = ({ status, lastRecord, onViewRelated }) => {
  let bgColor = "bg-white";
  let textColor = "text-stone-800";
  let borderColor = "border-stone-200";
  let icon = <ScanLine size={24} className="text-stone-300" />;
  let title = "等待掃描";
  let message = "請掃描條碼";

  switch (status) {
    case 'OK':
      bgColor = "bg-emerald-50";
      borderColor = "border-emerald-200";
      textColor = "text-emerald-900";
      icon = <CheckCircle2 size={32} className="text-emerald-600" />;
      title = "盤點成功";
      message = lastRecord?.Description || "未知商品";
      break;
    case 'Checked':
      bgColor = "bg-blue-50";
      borderColor = "border-blue-200";
      textColor = "text-blue-900";
      icon = <CheckCircle size={32} className="text-blue-600" />;
      title = "已確認";
      message = lastRecord?.Description || "已人工確認";
      break;
    case 'Not Found':
      bgColor = "bg-red-50";
      borderColor = "border-red-200";
      textColor = "text-red-900";
      icon = <XCircle size={32} className="text-red-700" />;
      title = "查無資料";
      message = `PartID: ${lastRecord?.PartID}`;
      break;
    case 'Duplicated':
      bgColor = "bg-amber-50";
      borderColor = "border-amber-200";
      textColor = "text-amber-900";
      icon = <AlertTriangle size={32} className="text-yellow-600" />;
      title = "重複盤點";
      message = "此條碼已盤點過";
      break;
    case 'IDLE':
    default:
      break;
  }

  return (
    <div className={`w-full px-4 py-3 rounded-xl border ${borderColor} ${bgColor} shadow-sm transition-all duration-300 ease-in-out flex items-center gap-4 min-h-[80px]`}>
      <div className="flex-shrink-0 animate-in zoom-in duration-300">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
           <h2 className={`text-base font-bold ${textColor} tracking-tight leading-tight`}>{title}</h2>
           {status !== 'IDLE' && lastRecord && (
             <span className="text-[10px] text-stone-400 font-mono">
               {new Date(lastRecord.InventoryDate).toLocaleTimeString()}
             </span>
           )}
        </div>
        <p className={`text-sm font-medium opacity-90 ${textColor} truncate mt-0.5`}>{message}</p>
        
        <div className="flex justify-between items-end mt-1">
            {lastRecord?.Project && (status === 'OK' || status === 'Checked') ? (
               <div>
                 <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-white/60 border border-black/5 font-mono text-stone-600">
                   {lastRecord.Project}
                 </span>
               </div>
            ) : <div></div>}
            
            {status !== 'IDLE' && onViewRelated && (
                <button 
                   onClick={onViewRelated}
                   className="flex items-center gap-1 text-[10px] opacity-60 hover:opacity-100 transition-opacity bg-black/5 px-2 py-1 rounded-full text-stone-700"
                >
                   <span>查看詳細</span>
                   <ArrowRight size={10} />
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default StatusFeedback;