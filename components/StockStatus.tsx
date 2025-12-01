import React, { useMemo, useState, useEffect } from 'react';
import { InventoryRecord, MasterItem } from '../types';
import { Filter, Target, BarChart2, Eye, X, MapPin, Search, Layers } from 'lucide-react';
import { db } from '../utils/db';

interface StockStatusProps {
  records: InventoryRecord[];
}

const CUSTOMER_CATEGORIES = ['ALL', 'A26', 'A31', 'C38', 'INT', 'OTHERS'] as const;
type CustomerCategory = typeof CUSTOMER_CATEGORIES[number];

const StockStatus: React.FC<StockStatusProps> = ({ records }) => {
  const [customerFilter, setCustomerFilter] = useState<CustomerCategory>('ALL');
  
  // Stats State
  const [masterCounts, setMasterCounts] = useState<{
    total: number;
    byCustomer: Record<string, number>;
  }>({ total: 0, byCustomer: {} });
  
  // Unscanned Browser State
  const [showUnscanned, setShowUnscanned] = useState(false);
  const [allUnscanned, setAllUnscanned] = useState<MasterItem[]>([]);
  const [loadingUnscanned, setLoadingUnscanned] = useState(false);
  const [unscannedSearchTerm, setUnscannedSearchTerm] = useState('');
  
  // Class Filter State
  const [classFilter, setClassFilter] = useState<string>('ALL');

  useEffect(() => {
    const fetchMasterStats = async () => {
      const allItems = await db.getAll();
      const counts: Record<string, number> = {
        'A26': 0, 'A31': 0, 'C38': 0, 'INT': 0, 'OTHERS': 0
      };
      
      let total = 0;
      allItems.forEach(item => {
        total++;
        // CHANGED: Use PartID prefix instead of Project field
        const partId = (item.PartID || '').trim().toUpperCase();
        
        if (partId.startsWith('A26')) counts['A26']++;
        else if (partId.startsWith('A31')) counts['A31']++;
        else if (partId.startsWith('C38')) counts['C38']++;
        else if (partId.startsWith('INT')) counts['INT']++;
        else counts['OTHERS']++;
      });
      setMasterCounts({ total, byCustomer: counts });
    };
    fetchMasterStats();
  }, []); 

  const scannedStats = useMemo(() => {
    const counts: Record<string, number> = {
      'A26': 0, 'A31': 0, 'C38': 0, 'INT': 0, 'OTHERS': 0
    };
    let totalScanned = 0;

    records.forEach(r => {
      // Checked items also count as completed
      if (r.Status === 'OK' || r.Status === 'Checked') {
        totalScanned++;
        // CHANGED: Use PartID prefix instead of Project field
        const partId = (r.PartID || '').trim().toUpperCase();
        
        if (partId.startsWith('A26')) counts['A26']++;
        else if (partId.startsWith('A31')) counts['A31']++;
        else if (partId.startsWith('C38')) counts['C38']++;
        else if (partId.startsWith('INT')) counts['INT']++;
        else counts['OTHERS']++;
      }
    });

    return { total: totalScanned, byCustomer: counts };
  }, [records]);

  const displayData = useMemo(() => {
    if (customerFilter === 'ALL') {
      return {
        target: masterCounts.total,
        current: scannedStats.total,
        label: '總盤點進度'
      };
    } else {
      return {
        target: masterCounts.byCustomer[customerFilter] || 0,
        current: scannedStats.byCustomer[customerFilter] || 0,
        label: `${customerFilter} 專案進度`
      };
    }
  }, [customerFilter, masterCounts, scannedStats]);

  const progressPct = displayData.target > 0 
    ? Math.round((displayData.current / displayData.target) * 100) 
    : 0;

  // Logic to fetch Unscanned Items (Fetch all, then filter in render)
  const handleViewUnscanned = async () => {
    setShowUnscanned(true);
    setLoadingUnscanned(true);
    setUnscannedSearchTerm(''); // Reset search
    setClassFilter('ALL'); // Reset class filter
    
    try {
        const scannedSet = new Set(records.map(r => r.PartID));
        const allItems = await db.getAll();
        
        // Filter out scanned items only
        const unscanned = allItems.filter(item => !scannedSet.has(item.PartID));
        setAllUnscanned(unscanned);

    } catch (e) {
        console.error(e);
    } finally {
        setLoadingUnscanned(false);
    }
  };

  // Reset class filter when customer filter changes
  useEffect(() => {
      if (showUnscanned) {
          setClassFilter('ALL');
      }
  }, [customerFilter, showUnscanned]);

  // 1. First, filter by Customer (PartID Prefix)
  const unscannedByCustomer = useMemo(() => {
     let filtered = allUnscanned;
     if (customerFilter !== 'ALL') {
        filtered = filtered.filter(item => {
            const partId = (item.PartID || '').trim().toUpperCase();
            if (customerFilter === 'OTHERS') {
                const isSpecific = ['A26', 'A31', 'C38', 'INT'].some(k => partId.startsWith(k));
                return !isSpecific;
            } else {
                return partId.startsWith(customerFilter);
            }
        });
     }
     return filtered;
  }, [allUnscanned, customerFilter]);

  // 2. Extract available classes based on current customer filter
  const availableClasses = useMemo(() => {
      const classes = new Set<string>();
      unscannedByCustomer.forEach(item => {
          if (item.Class) classes.add(item.Class);
      });
      return Array.from(classes).sort();
  }, [unscannedByCustomer]);

  // 3. Final filtered list (Customer -> Class -> Search)
  const filteredUnscannedList = useMemo(() => {
     let filtered = unscannedByCustomer;

     // Filter by Class
     if (classFilter !== 'ALL') {
         filtered = filtered.filter(item => item.Class === classFilter);
     }

     // Filter by Search Term
     if (unscannedSearchTerm.trim()) {
         const term = unscannedSearchTerm.toLowerCase();
         filtered = filtered.filter(item => 
             item.PartID.toLowerCase().includes(term) || 
             (item.Description || '').toLowerCase().includes(term) ||
             (item.VendorPN || '').toLowerCase().includes(term)
         );
     }

     return filtered;
  }, [unscannedByCustomer, classFilter, unscannedSearchTerm]);

  // Display only top 100 to prevent lag
  const displayUnscanned = filteredUnscannedList.slice(0, 100);

  return (
    <div className="space-y-6 relative min-h-full">
      
      {/* Unscanned Modal / Overlay */}
      {showUnscanned && (
        <div className="fixed inset-0 z-50 bg-stone-50 flex flex-col animate-in slide-in-from-bottom-5">
           <div className="bg-stone-800 text-stone-50 p-4 shadow-md flex justify-between items-center shrink-0">
              <h2 className="font-bold flex items-center gap-2 text-sm">
                 <Eye size={16} className="text-amber-400" />
                 未盤點清單
              </h2>
              <button onClick={() => setShowUnscanned(false)} className="p-2 bg-stone-700 rounded-full hover:bg-stone-600">
                 <X size={16} />
              </button>
           </div>
           
           {/* Filter Bar inside Modal */}
           <div className="bg-stone-100 px-4 py-3 border-b border-stone-200 flex flex-col gap-3 shrink-0">
              <div className="flex justify-between items-center gap-2">
                  <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1">
                      {/* Customer Filter */}
                      <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-stone-200 shadow-sm shrink-0">
                        <Filter size={12} className="text-stone-400" />
                        <select 
                           value={customerFilter}
                           onChange={(e) => setCustomerFilter(e.target.value as CustomerCategory)}
                           className="bg-transparent border-none text-xs font-bold text-stone-700 focus:outline-none focus:ring-0 cursor-pointer py-1 pr-6"
                        >
                          {CUSTOMER_CATEGORIES.map(c => <option key={c} value={c}>{c === 'ALL' ? '全部專案' : c}</option>)}
                        </select>
                      </div>

                      {/* Class Filter */}
                      <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-stone-200 shadow-sm shrink-0">
                        <Layers size={12} className="text-stone-400" />
                        <select 
                           value={classFilter}
                           onChange={(e) => setClassFilter(e.target.value)}
                           className="bg-transparent border-none text-xs font-bold text-stone-700 focus:outline-none focus:ring-0 cursor-pointer py-1 pr-6 max-w-[150px] truncate"
                        >
                          <option value="ALL">全部類別 ({availableClasses.length})</option>
                          {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                  </div>
                  
                  <span className="text-[10px] text-stone-400 font-mono whitespace-nowrap">
                    {filteredUnscannedList.length} 筆
                  </span>
              </div>
              
              {/* Search Box */}
              <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={12} />
                  <input 
                      type="text"
                      value={unscannedSearchTerm}
                      onChange={(e) => setUnscannedSearchTerm(e.target.value)}
                      placeholder="搜尋 PartID 或 說明..."
                      className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-lg text-xs focus:outline-none focus:border-stone-400"
                  />
              </div>
           </div>

           <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
              {loadingUnscanned ? (
                 <div className="text-center py-10 text-stone-400 text-sm">讀取中...</div>
              ) : displayUnscanned.length === 0 ? (
                 <div className="text-center py-10 text-emerald-600 font-bold text-sm">
                    {allUnscanned.length === 0 ? "恭喜！所有項目皆已盤點完畢。" : "查無符合項目。"}
                 </div>
              ) : (
                 <>
                   {displayUnscanned.map(item => (
                      <div key={item.PartID} className="bg-white p-3 rounded-xl border-l-4 border-amber-500 shadow-sm hover:bg-amber-50 transition-colors">
                         <div className="flex justify-between items-start mb-2">
                            <span className="font-mono font-bold text-stone-800 text-sm">{item.PartID}</span>
                            {/* Improved Location Visibility */}
                            <div className="flex items-center gap-1 bg-stone-800 text-amber-400 px-2 py-0.5 rounded-lg shadow-sm">
                               <MapPin size={10} />
                               <span className="text-[10px] font-bold">{item.Location || '無儲位'}</span>
                            </div>
                         </div>
                         <p className="text-[10px] text-stone-600 line-clamp-2 mb-2 leading-relaxed">{item.Description}</p>
                         <div className="flex flex-wrap gap-2 text-[9px] text-stone-400">
                            <span className="bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">{item.Project}</span>
                            <span className="bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200 font-medium text-stone-600">{item.Class}</span>
                            <span className="bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">{item.Vendor}</span>
                            {item.VendorPN && item.VendorPN !== 'NA' && (
                                <span className="bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200 font-mono">{item.VendorPN}</span>
                            )}
                         </div>
                      </div>
                   ))}
                   {filteredUnscannedList.length > 100 && (
                     <div className="text-center text-[10px] text-stone-400 py-2">
                       僅顯示前 100 筆，請使用篩選功能查看更多
                     </div>
                   )}
                 </>
              )}
           </div>
        </div>
      )}

      {/* Control Bar */}
      <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-stone-200 shadow-sm">
        <div className="flex items-center gap-2 text-stone-700 font-bold">
           <BarChart2 size={16} />
           <span className="text-sm">盤點狀態</span>
        </div>
        <div className="relative">
            <Filter size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400"/>
            <select 
              className="pl-8 pr-3 py-1.5 bg-stone-100 border-none rounded-lg text-xs text-stone-700 font-medium focus:outline-none focus:ring-2 focus:ring-stone-200"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value as CustomerCategory)}
            >
              {CUSTOMER_CATEGORIES.map(c => (
                <option key={c} value={c}>{c === 'ALL' ? '全部專案' : c}</option>
              ))}
            </select>
        </div>
      </div>

      {/* Main Progress Card */}
      <div className="bg-white rounded-2xl p-6 shadow-md border border-stone-100 relative overflow-hidden">
         <div className="absolute top-0 right-0 p-4 opacity-5">
           <Target size={80} />
         </div>

         <h3 className="text-stone-500 text-[10px] font-bold uppercase tracking-wider mb-1">{displayData.label}</h3>
         <div className="flex items-baseline gap-2 mb-4">
            <span className="text-2xl font-bold text-stone-800">{displayData.current}</span>
            <span className="text-stone-400 text-sm">/ {displayData.target}</span>
         </div>

         <div className="relative h-3 bg-stone-100 rounded-full overflow-hidden shadow-inner">
            <div 
              className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out flex items-center justify-end pr-2
                ${progressPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}
              `}
              style={{ width: `${Math.min(100, progressPct)}%` }}
            >
            </div>
         </div>
         <div className="flex justify-between mt-2 text-[10px] text-stone-400 font-medium uppercase">
           <span>0%</span>
           <span>目標: {displayData.target} 筆</span>
         </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl flex flex-col justify-center items-center">
           <span className="text-emerald-800 font-bold text-lg">{displayData.current}</span>
           <span className="text-emerald-600 text-[10px] mt-1 font-medium uppercase">已完成</span>
        </div>

        <button 
           onClick={handleViewUnscanned}
           className="bg-stone-50 border border-stone-200 p-4 rounded-xl flex flex-col justify-center items-center hover:bg-amber-50 hover:border-amber-200 transition-colors group relative"
        >
           <div className="absolute top-2 right-2 text-stone-300 group-hover:text-amber-500"><Eye size={14}/></div>
           <span className="text-stone-800 font-bold text-lg">{displayData.target - displayData.current}</span>
           <span className="text-stone-500 text-[10px] mt-1 group-hover:text-amber-700 font-medium uppercase">剩餘 (點擊查看)</span>
        </button>
      </div>

      {customerFilter === 'ALL' && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="bg-stone-50 px-4 py-3 border-b border-stone-200 text-[10px] font-bold text-stone-500 uppercase tracking-wider">
            各專案詳情
          </div>
          <div className="divide-y divide-stone-100">
            {CUSTOMER_CATEGORIES.filter(c => c !== 'ALL').map(cust => {
              const target = masterCounts.byCustomer[cust] || 0;
              const current = scannedStats.byCustomer[cust] || 0;
              const pct = target > 0 ? Math.round((current / target) * 100) : 0;
              
              if (target === 0) return null; 

              return (
                <div key={cust} className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="font-bold text-stone-700 text-xs">{cust}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] text-stone-400 font-mono">
                      {current} / {target}
                    </span>
                    <div className="w-20 h-1 bg-stone-100 rounded-full overflow-hidden">
                       <div className="h-full bg-stone-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default StockStatus;
