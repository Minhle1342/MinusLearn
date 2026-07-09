import React, { useMemo } from 'react';
import { X, Plus, Edit2, Trash2, Flame } from 'lucide-react';

/**
 * Calculate study streak from SR data.
 * A "study day" is any calendar day where at least one word was reviewed.
 * Streak = consecutive days counting backwards from today (or yesterday if not studied today yet).
 */
function calcStreak(srData) {
  // Collect all unique study dates (YYYY-MM-DD)
  const studyDates = new Set();
  for (const entry of Object.values(srData || {})) {
    if (entry.lastReviewDate) {
      const d = new Date(entry.lastReviewDate);
      studyDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  }

  const today = new Date();
  const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const todayStr = toDateStr(today);
  const studiedToday = studyDates.has(todayStr);

  // Count consecutive days backwards
  let streak = 0;
  let checkDate = new Date(today);

  // If not studied today, start checking from yesterday
  if (!studiedToday) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (studyDates.has(toDateStr(checkDate))) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return { streak, studiedToday };
}

export function Sidebar({
  isDrawerOpen,
  setIsDrawerOpen,
  topics,
  activeTopicId,
  setActiveTopicId,
  onAddTopic,
  onEditTopic,
  onDeleteTopic,
  words,
  srData
}) {
  const toggleDrawer = () => setIsDrawerOpen(!isDrawerOpen);
  const { streak, studiedToday } = useMemo(() => calcStreak(srData), [srData]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 z-40 md:hidden ${isDrawerOpen ? 'block' : 'hidden'}`}
        onClick={toggleDrawer}
      ></div>

      <aside
        className={`fixed inset-y-0 left-0 z-50 transform ${isDrawerOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 md:relative md:translate-x-0 flex flex-col h-full w-[280px] bg-canvas-soft border-r border-hairline p-md gap-base overflow-y-auto`}
      >
        <div className="mb-md flex justify-between items-center">
          <div>
            <h2 className="font-title text-title text-on-surface">Chủ đề</h2>
            <p className="font-caption text-caption text-on-surface-variant mt-xxs">Quản lý từ vựng của bạn</p>
          </div>
          <button className="md:hidden p-1 text-on-surface-variant" onClick={toggleDrawer}>
            <X size={20} />
          </button>
        </div>

        <button
          onClick={onAddTopic}
          className="w-full flex items-center justify-center gap-xs py-sm px-md border border-hairline rounded-[8px] font-button text-button text-on-surface hover:bg-surface transition-colors"
        >
          <Plus size={16} />
          Thêm chủ đề
        </button>

        <nav className="flex-1 flex flex-col gap-xxs mt-md">
          {topics.map(topic => {
            const count = words.filter(w => w.topicId === topic.id).length;
            const isActive = activeTopicId === topic.id;
            return (
              <div
                key={topic.id}
                onClick={() => setActiveTopicId(topic.id)}
                onDoubleClick={() => onEditTopic(topic.id)}
                className={`group flex items-center justify-between px-sm py-xs rounded-lg cursor-pointer transition-all duration-200 ease-in-out select-none
                  ${isActive ? 'bg-surface-container-high text-on-surface shadow-sm font-medium' : 'text-on-surface-variant hover:bg-surface-container-low'}
                `}
              >
                <div className="flex items-center gap-sm overflow-hidden">
                  <div className={`w-3 h-3 rounded-full ${topic.colorClass || 'bg-accent-sky'}`}></div>
                  <span className="font-body-md text-body-md truncate">{topic.name}</span>
                </div>
                <span className="font-caption text-caption text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full ml-2 group-hover:hidden">
                  {count}
                </span>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditTopic(topic.id); }}
                    className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary transition-colors"
                    title="Sửa chủ đề"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Bạn có chắc chắn muốn xóa chủ đề này? Tất cả từ vựng trong chủ đề cũng sẽ bị xóa.')) {
                        onDeleteTopic(topic.id);
                      }
                    }}
                    className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-error transition-colors"
                    title="Xóa chủ đề"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </nav>

        {/* Streak Display */}
        <div className="mt-auto border-t border-hairline pt-md">
          <div className="flex items-center gap-sm px-sm py-sm rounded-lg bg-surface-container-low">
            <div className={`relative flex items-center justify-center ${studiedToday ? 'streak-flame-active' : ''}`}>
              <Flame
                size={28}
                className={`transition-colors duration-300 ${studiedToday
                  ? 'text-orange-500 drop-shadow-[0_0_6px_rgba(249,115,22,0.6)]'
                  : 'text-on-surface-variant opacity-40'
                  }`}
                fill={studiedToday ? 'currentColor' : 'none'}
              />
            </div>
            <div className="flex flex-col">
              <span className={`font-heading-3 text-heading-3 leading-none ${studiedToday ? 'text-orange-600' : 'text-on-surface-variant'}`}>
                {streak}
              </span>
              <span className="font-caption text-caption text-on-surface-variant">
                {streak === 0 && !studiedToday
                  ? 'Hãy bắt đầu học!'
                  : studiedToday
                    ? `ngày liên tiếp`
                    : `ngày streak — Học hôm nay!`
                }
              </span>
            </div>
          </div>
        </div>

        {/* Flame animation styles */}
        <style>{`
          .streak-flame-active svg {
            animation: flame-flicker 1.5s ease-in-out infinite alternate;
          }
          @keyframes flame-flicker {
            0% { transform: scale(1) rotate(0deg); filter: drop-shadow(0 0 4px rgba(249,115,22,0.4)); }
            25% { transform: scale(1.08) rotate(-2deg); filter: drop-shadow(0 0 8px rgba(249,115,22,0.6)); }
            50% { transform: scale(1.04) rotate(1deg); filter: drop-shadow(0 0 6px rgba(249,115,22,0.5)); }
            75% { transform: scale(1.1) rotate(-1deg); filter: drop-shadow(0 0 10px rgba(249,115,22,0.7)); }
            100% { transform: scale(1.05) rotate(0deg); filter: drop-shadow(0 0 7px rgba(249,115,22,0.55)); }
          }
        `}</style>
      </aside>
    </>
  );
}
