import React from 'react';
import { RotateCcw, ArrowRight } from 'lucide-react';
import { LevelData } from '../types';

interface UIOverlayProps {
  level: LevelData;
  narrative: string;
  showNarrative: boolean;
  onReset: () => void;
  onNextLevel: () => void;
  inkLeft: number;
  maxInk: number;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ 
  level, 
  narrative, 
  showNarrative, 
  onReset, 
  onNextLevel,
  inkLeft,
  maxInk
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
      
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
            <h1 className="text-2xl font-serif text-slate-700 font-bold tracking-wide">相依的步伐</h1>
            <p className="text-sm text-slate-500 mt-1">关卡 {level.id}: {level.name}</p>
        </div>
        
        <button 
          onClick={onReset}
          className="pointer-events-auto bg-white text-slate-600 p-2 rounded-full shadow-md hover:bg-slate-50 transition-transform hover:scale-110"
          title="重置关卡"
        >
          <RotateCcw size={20} />
        </button>
      </div>

      {/* Ink Meter */}
      {!showNarrative && (
          <div className="absolute top-20 left-6 w-48">
             <div className="flex justify-between text-xs text-slate-500 mb-1 font-bold uppercase">
                 <span>墨水余量</span>
                 <span>{Math.floor((inkLeft/maxInk)*100)}%</span>
             </div>
             <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden border border-slate-300">
                 <div 
                    className="h-full bg-slate-600 transition-all duration-100" 
                    style={{ width: `${(inkLeft/maxInk)*100}%` }}
                 />
             </div>
             <p className="text-[10px] text-slate-400 mt-2">按住 鼠标左键 绘制桥梁</p>
          </div>
      )}

      {/* Instructions */}
      {!showNarrative && (
        <div className="absolute bottom-6 left-6 text-slate-400 text-sm flex flex-col gap-1">
            <div><span className="font-bold text-slate-600">WASD</span> 移动向导</div>
            <div><span className="font-bold text-slate-600">E</span> 断开/连接 牵引绳</div>
        </div>
      )}

      {/* Victory Modal */}
      {showNarrative && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-8 rounded-xl shadow-xl border border-slate-100 max-w-md text-center">
            <h2 className="text-2xl font-serif text-slate-800 mb-4">抵达彼岸</h2>
            <p className="text-slate-600 italic mb-8 text-lg leading-relaxed">"{narrative}"</p>
            
            <button 
              onClick={onNextLevel}
              className="pointer-events-auto flex items-center justify-center gap-2 w-full py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors font-bold tracking-wide"
            >
              <span>继续旅程</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UIOverlay;