import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, CheckCircle2, Lock, Sparkles,
  Clock, Award, BookOpen, AlertCircle, FileText, CheckSquare, Plus, RefreshCw, BarChart2, Check, Play
} from 'lucide-react';
import { useRemoteStorage } from '../../hooks/useRemoteStorage';
import {
  createAcademicExamSchedule,
  formatDateKey,
  isExamDateReached,
  getMilestoneStatus,
  EXAM_TYPES
} from '../../utils/academicExamScheduler';

export function AcademicExamCalendar({ topics, words, settings, onStartExam }) {
  const [academicData, setAcademicData] = useRemoteStorage('minuslearn_academic_calendar', null);
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'results'
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [selectedMilestone, setSelectedMilestone] = useState(null);
  const [selectedTopicIds, setSelectedTopicIds] = useState(['default']);

  // Initialize or load calendar
  useEffect(() => {
    if (!academicData) {
      const initialTopicIds = topics && topics.length > 0 ? [topics[0].id] : ['default'];
      const newCal = createAcademicExamSchedule(new Date(), initialTopicIds);
      setAcademicData(newCal);
      setSelectedTopicIds(initialTopicIds);
    } else {
      setSelectedTopicIds(academicData.topicIds || ['default']);
    }
  }, [academicData, setAcademicData, topics]);

  // Generate / Reset 6-month Calendar starting from today
  const handleGenerateNewCalendar = () => {
    const topicIds = selectedTopicIds.length > 0 ? selectedTopicIds : (topics && topics.length > 0 ? [topics[0].id] : ['default']);
    const newCal = createAcademicExamSchedule(new Date(), topicIds);
    setAcademicData(newCal);
    setSelectedMilestone(null);
    setCurrentMonthDate(new Date());
  };

  // Update topics for current calendar
  const handleUpdateTopics = () => {
    if (!academicData) return;
    const updatedMilestones = academicData.milestones.map(ms => {
      if (ms.status !== 'completed') {
        return { ...ms, topicIds: [...selectedTopicIds] };
      }
      return ms;
    });

    setAcademicData({
      ...academicData,
      topicIds: [...selectedTopicIds],
      milestones: updatedMilestones
    });
  };

  // Toggle topic selection
  const handleToggleTopic = (topicId) => {
    setSelectedTopicIds(prev => {
      if (prev.includes(topicId)) {
        if (prev.length === 1) return prev; // keep at least 1 topic
        return prev.filter(id => id !== topicId);
      } else {
        return [...prev, topicId];
      }
    });
  };

  // Toggle auto-render checkbox for a milestone
  const handleToggleAutoRender = (milestoneId) => {
    if (!academicData) return;
    const updated = academicData.milestones.map(ms => {
      if (ms.id === milestoneId) {
        return { ...ms, autoRender: !ms.autoRender };
      }
      return ms;
    });
    setAcademicData({ ...academicData, milestones: updated });
    if (selectedMilestone && selectedMilestone.id === milestoneId) {
      setSelectedMilestone(prev => ({ ...prev, autoRender: !prev.autoRender }));
    }
  };

  // Calendar Grid Calculation
  const calendarDays = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Day of week: 0 = Sun, 1 = Mon ... Convert so Monday is 0
    let startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

    const days = [];

    // Previous month padding days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({ dateObj: d, isCurrentMonth: false, dateKey: formatDateKey(d) });
    }

    // Current month days
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ dateObj: d, isCurrentMonth: true, dateKey: formatDateKey(d) });
    }

    // Next month padding days to fill 35 or 42 grid cells
    const totalCells = days.length <= 35 ? 35 : 42;
    const remainingCells = totalCells - days.length;
    for (let i = 1; i <= remainingCells; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ dateObj: d, isCurrentMonth: false, dateKey: formatDateKey(d) });
    }

    return days;
  }, [currentMonthDate]);

  // Map of milestones by dateKey
  const milestonesByDate = useMemo(() => {
    if (!academicData || !academicData.milestones) return {};
    const map = {};
    academicData.milestones.forEach(ms => {
      map[ms.date] = ms;
    });
    return map;
  }, [academicData]);

  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  // Filter completed exams for Results tab
  const completedExams = useMemo(() => {
    if (!academicData || !academicData.milestones) return [];
    return academicData.milestones.filter(ms => ms.status === 'completed' && ms.result);
  }, [academicData]);

  // Next upcoming exam calculation
  const nextUpcomingExam = useMemo(() => {
    if (!academicData || !academicData.milestones) return null;
    return academicData.milestones.find(ms => ms.status !== 'completed');
  }, [academicData]);

  const daysToNextExam = useMemo(() => {
    if (!nextUpcomingExam) return null;
    
    // Parse the date (YYYY-MM-DD)
    const [y, m, d] = nextUpcomingExam.date.split('-').map(Number);
    const examDate = new Date(y, m - 1, d);
    examDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = examDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }, [nextUpcomingExam]);

  return (
    <div className="flex flex-col max-w-6xl mx-auto w-full p-md md:p-lg gap-lg">
      {/* Page Header */}
      <div className="bg-surface border border-hairline rounded-[20px] p-lg md:p-xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-md">
        <div className="flex items-center gap-md">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <CalendarIcon size={28} />
          </div>
          <div>
            <h1 className="font-heading-1 text-2xl md:text-3xl text-on-surface">Lịch Kiểm Tra Năm Học THPT</h1>
            <p className="text-sm text-on-surface-variant">
              Tự động tính toán đồng bộ mốc thi 6 tháng & Lưu dữ liệu trực tiếp vào MongoDB
            </p>
          </div>
        </div>

        {/* Tab Switcher & Generate Button */}
        <div className="flex items-center gap-sm flex-wrap w-full md:w-auto">
          <div className="flex bg-surface-container-low rounded-full p-1 border border-hairline">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-md py-1.5 rounded-full text-xs font-button transition-all flex items-center gap-1.5 ${
                activeTab === 'calendar' ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <CalendarIcon size={14} />
              <span>Lịch 6 Tháng</span>
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`px-md py-1.5 rounded-full text-xs font-button transition-all flex items-center gap-1.5 ${
                activeTab === 'results' ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <BarChart2 size={14} />
              <span>Bảng Kết Quả ({completedExams.length})</span>
            </button>
          </div>

          <button
            onClick={handleGenerateNewCalendar}
            className="px-md py-2 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-full text-xs font-button border border-hairline transition-colors flex items-center gap-1.5 ml-auto md:ml-0"
            title="Khởi tạo lại lịch 6 tháng tính từ hôm nay"
          >
            <RefreshCw size={14} />
            <span>Tải Lịch 6 Tháng Mới</span>
          </button>
        </div>
      </div>

      {/* Next Exam Countdown Banner */}
      {activeTab === 'calendar' && nextUpcomingExam && daysToNextExam !== null && (
        <div 
          onClick={() => {
            setSelectedMilestone(nextUpcomingExam);
            const [y, m, d] = nextUpcomingExam.date.split('-').map(Number);
            setCurrentMonthDate(new Date(y, m - 1, d));
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          }}
          className={`p-md md:p-lg rounded-[20px] border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-md cursor-pointer transition-transform hover:-translate-y-1 ${
          daysToNextExam <= 0 ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20' : 'bg-primary/5 border-primary/20 hover:bg-primary/10'
        }`}>
          <div className="flex items-center gap-md">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              daysToNextExam <= 0 ? 'bg-amber-500/20 text-amber-600' : 'bg-primary/10 text-primary'
            }`}>
              <Clock size={24} />
            </div>
            <div>
              <h3 className={`font-heading-2 text-lg ${daysToNextExam <= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-primary'}`}>
                {daysToNextExam < 0 ? 'Có bài kiểm tra đang bị trễ!' : daysToNextExam === 0 ? 'Hôm nay có bài kiểm tra!' : 'Bài kiểm tra sắp tới'}
              </h3>
              <p className="text-sm text-on-surface-variant mt-0.5">
                <strong className="text-on-surface">{nextUpcomingExam.title}</strong>
                <span className="mx-2">•</span>
                Ngày thi: <strong className="text-on-surface">{nextUpcomingExam.date}</strong>
              </p>
            </div>
          </div>
          
          <div className={`px-xl py-sm rounded-2xl font-heading-2 text-xl text-center border whitespace-nowrap min-w-[140px] ${
             daysToNextExam < 0 ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' 
             : daysToNextExam === 0 ? 'bg-amber-500/10 text-amber-600 border-amber-500/20 animate-pulse'
             : 'bg-surface text-primary border-hairline shadow-sm'
          }`}>
            {daysToNextExam < 0 
              ? `Trễ ${Math.abs(daysToNextExam)} ngày` 
              : daysToNextExam === 0 
                ? 'Hôm nay' 
                : `Còn ${daysToNextExam} ngày`}
          </div>
        </div>
      )}

      {/* Multi-Topic Binding Bar */}
      <div className="bg-surface border border-hairline rounded-[16px] p-md shadow-sm flex flex-col gap-sm">
        <div className="flex items-center justify-between flex-wrap gap-sm">
          <div className="flex items-center gap-xs">
            <BookOpen size={18} className="text-primary" />
            <span className="text-sm font-semibold text-on-surface">Chủ đề từ vựng kiểm tra (Chọn 1 hoặc nhiều):</span>
          </div>
          <button
            onClick={handleUpdateTopics}
            className="text-xs bg-primary/10 text-primary hover:bg-primary/20 px-md py-1 rounded-full font-medium transition-colors"
          >
            Cập nhật chủ đề cho Lịch
          </button>
        </div>

        <div className="flex flex-wrap gap-xs pt-xs">
          {topics && topics.map(t => {
            const isSelected = selectedTopicIds.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => handleToggleTopic(t.id)}
                className={`px-md py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1 ${
                  isSelected
                    ? 'bg-primary text-on-primary border-primary shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant border-hairline hover:bg-surface-container'
                }`}
              >
                {isSelected && <Check size={12} />}
                <span>{t.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: CALENDAR VIEW */}
      {activeTab === 'calendar' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg items-start">
          {/* Western Desk Calendar Main Grid */}
          <div className="lg:col-span-2 bg-surface border border-hairline rounded-[24px] p-md md:p-lg shadow-md flex flex-col gap-md">
            {/* Month Header Navigation */}
            <div className="flex items-center justify-between pb-sm border-b border-hairline">
              <div className="flex items-center gap-sm">
                <h2 className="font-heading-1 text-xl md:text-2xl text-on-surface capitalize">
                  {currentMonthDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
                </h2>
              </div>
              <div className="flex items-center gap-xs">
                <button
                  onClick={() => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1))}
                  className="p-2 rounded-full hover:bg-surface-container text-on-surface transition-colors"
                  title="Tháng trước"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setCurrentMonthDate(new Date())}
                  className="px-md py-1 rounded-full text-xs font-medium bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
                >
                  Hôm nay
                </button>
                <button
                  onClick={() => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1))}
                  className="p-2 rounded-full hover:bg-surface-container text-on-surface transition-colors"
                  title="Tháng sau"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            {/* Weekday Names Header */}
            <div className="grid grid-cols-7 gap-1 text-center font-semibold text-xs text-on-surface-variant uppercase tracking-wider">
              <div className="py-1">T2</div>
              <div className="py-1">T3</div>
              <div className="py-1">T4</div>
              <div className="py-1">T5</div>
              <div className="py-1">T6</div>
              <div className="py-1 text-rose-500">T7</div>
              <div className="py-1 text-rose-500">CN</div>
            </div>

            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 gap-1.5 md:gap-2 auto-rows-fr">
              {calendarDays.map((dayItem, idx) => {
                const { dateObj, isCurrentMonth, dateKey } = dayItem;
                const isToday = dateKey === todayKey;
                const milestone = milestonesByDate[dateKey];
                const isSelected = selectedMilestone?.date === dateKey;
                const dynamicStatus = milestone ? getMilestoneStatus(milestone) : null;

                let dayBg = isCurrentMonth ? 'bg-surface hover:bg-surface-container-low' : 'bg-surface-container-lowest/40 opacity-40';
                if (isToday) dayBg = 'bg-primary/5 ring-2 ring-primary/40';
                if (isSelected) dayBg += ' ring-2 ring-primary bg-primary/10';

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (milestone) setSelectedMilestone(milestone);
                    }}
                    className={`min-h-[80px] md:min-h-[96px] p-1.5 rounded-xl border border-hairline transition-all flex flex-col justify-between cursor-pointer relative ${dayBg}`}
                  >
                    {/* Day number */}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs md:text-sm font-semibold ${isToday ? 'bg-primary text-on-primary px-2 py-0.5 rounded-full' : 'text-on-surface'}`}>
                        {dateObj.getDate()}
                      </span>
                    </div>

                    {/* Exam Badges for 4 Statuses: Pending, Ready, Rendered, Completed */}
                    {milestone && (
                      <div className="mt-auto">
                        {dynamicStatus === 'completed' ? (
                          <div className="px-1.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] md:text-xs font-semibold flex items-center gap-1">
                            <CheckCircle2 size={12} className="flex-shrink-0" />
                            <span className="truncate">{milestone.shortName} (Completed)</span>
                          </div>
                        ) : dynamicStatus === 'rendered' ? (
                          <div className="px-1.5 py-1 rounded-lg bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/40 text-[10px] md:text-xs font-semibold flex items-center gap-1">
                            <Play size={12} className="flex-shrink-0" />
                            <span className="truncate">{milestone.shortName} (Rendered)</span>
                          </div>
                        ) : dynamicStatus === 'ready' ? (
                          <div className="px-1.5 py-1 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-[10px] md:text-xs font-semibold flex items-center gap-1 animate-pulse">
                            <Sparkles size={12} className="flex-shrink-0" />
                            <span className="truncate">{milestone.shortName} (Ready)</span>
                          </div>
                        ) : (
                          <div className="px-1.5 py-1 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 text-[10px] md:text-xs font-semibold flex items-center gap-1">
                            <Lock size={12} className="flex-shrink-0 opacity-70" />
                            <span className="truncate">{milestone.shortName} (Pending)</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Exam Milestone Detail & Action Panel */}
          <div className="bg-surface border border-hairline rounded-[24px] p-lg shadow-md flex flex-col gap-md sticky top-4">
            <h3 className="font-title text-xl text-on-surface flex items-center gap-xs">
              <FileText size={20} className="text-primary" />
              Chi Tiết Mốc Kiểm Tra
            </h3>

            {selectedMilestone ? (
              <div className="flex flex-col gap-md">
                {/* Title & Badge */}
                <div className="p-md rounded-xl bg-surface-container-low border border-hairline flex flex-col gap-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                      {selectedMilestone.typeName}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 bg-surface-container rounded-md">
                      {selectedMilestone.date}
                    </span>
                  </div>
                  <h4 className="font-heading-1 text-lg text-on-surface">{selectedMilestone.title}</h4>
                </div>

                {/* Properties list */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b border-hairline">
                    <span className="text-on-surface-variant">Thời lượng:</span>
                    <span className="font-medium text-on-surface flex items-center gap-1">
                      <Clock size={14} /> {selectedMilestone.duration}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-hairline">
                    <span className="text-on-surface-variant">Mức độ khó:</span>
                    <span className="font-medium text-on-surface">{selectedMilestone.difficulty}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-hairline">
                    <span className="text-on-surface-variant">Số câu hỏi:</span>
                    <span className="font-medium text-on-surface">{selectedMilestone.questionCount} câu</span>
                  </div>
                </div>

                {/* Auto render checkbox */}
                <label className="flex items-center gap-sm p-sm rounded-xl bg-surface-container-lowest border border-hairline cursor-pointer hover:bg-surface-container-low transition-colors">
                  <input
                    type="checkbox"
                    checked={!!selectedMilestone.autoRender}
                    onChange={() => handleToggleAutoRender(selectedMilestone.id)}
                    className="w-4 h-4 text-primary rounded focus:ring-primary"
                  />
                  <span className="text-xs font-medium text-on-surface">
                    Tự động render bài kiểm tra bằng Gemini khi đến ngày
                  </span>
                </label>

                {/* Date Lock Warning & Action Button */}
                {!isExamDateReached(selectedMilestone.date) ? (
                  <div className="flex flex-col gap-sm">
                    <div className="p-md rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
                      <Lock size={16} className="flex-shrink-0 mt-0.5" />
                      <span>
                        Chưa đến mốc thời gian kiểm tra! Bạn cần chờ đúng ngày (<strong>{selectedMilestone.date}</strong>) mới được bấm Render bài kiểm tra.
                      </span>
                    </div>

                    <button
                      disabled={true}
                      className="w-full py-md bg-surface-container text-on-surface-variant font-button rounded-full text-sm opacity-50 cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Lock size={16} />
                      Bắt đầu Bài Kiểm Tra (Chưa tới ngày)
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-sm">
                    <div className="p-md rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-start gap-2">
                      <Sparkles size={16} className="flex-shrink-0 mt-0.5" />
                      <span>
                        Đã tới mốc thời gian! Hãy sẵn sàng để Gemini tự động sinh đề thi và bắt đầu làm bài.
                      </span>
                    </div>

                    <button
                      onClick={() => onStartExam(selectedMilestone)}
                      className="w-full py-md bg-primary hover:bg-primary-active text-on-primary font-button rounded-full text-sm transition-colors shadow-md flex items-center justify-center gap-2 animate-pulse"
                    >
                      <Sparkles size={18} />
                      Render & Bắt Đầu Bài Kiểm Tra
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-xl text-center text-on-surface-variant flex flex-col items-center gap-sm">
                <CalendarIcon size={36} className="opacity-40" />
                <p className="text-sm">Bấm vào bất kỳ mốc thi nào trên lịch để xem chi tiết & bắt đầu làm bài.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB 2: RESULTS TAB (Bảng Kết Quả & Điểm Số riêng) */
        <div className="bg-surface border border-hairline rounded-[24px] p-lg md:p-xl shadow-md flex flex-col gap-md">
          <h3 className="font-heading-1 text-xl text-on-surface flex items-center gap-xs">
            <Award size={22} className="text-primary" />
            Bảng Kết Quả Bài Kiểm Tra Theo Lịch
          </h3>

          {completedExams.length === 0 ? (
            <div className="py-xxl text-center text-on-surface-variant flex flex-col items-center gap-sm">
              <Award size={48} className="opacity-30" />
              <p className="text-base font-medium">Chưa có bài kiểm tra nào được hoàn thành trong lịch này.</p>
              <p className="text-xs max-w-sm">
                Khi bạn hoàn thành các bài thi từ Lịch 6 tháng, kết quả và điểm số chi tiết sẽ được tự động lưu trữ tại đây.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              {completedExams.map(ms => {
                const res = ms.result;
                return (
                  <div key={ms.id} className="p-md rounded-2xl border border-hairline bg-surface-container-low flex flex-col gap-sm shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold px-2.5 py-1 bg-primary/10 text-primary rounded-full">
                        {ms.typeName}
                      </span>
                      <span className="text-xs font-mono text-on-surface-variant">{ms.date}</span>
                    </div>

                    <h4 className="font-heading-1 text-lg text-on-surface">{ms.title}</h4>

                    {res && (
                      <div className="grid grid-cols-3 gap-xs text-center py-xs bg-surface rounded-xl border border-hairline">
                        <div>
                          <span className="text-[10px] text-on-surface-variant">Điểm số</span>
                          <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                            {res.score} / {res.totalQuestions || ms.questionCount}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] text-on-surface-variant">Tỷ lệ đúng</span>
                          <p className="text-base font-bold text-primary">
                            {Math.round((res.score / (res.totalQuestions || ms.questionCount)) * 100)}%
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] text-on-surface-variant">Thời gian</span>
                          <p className="text-base font-bold text-on-surface">{ms.duration}</p>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => onStartExam(ms)}
                      className="mt-xs py-2 bg-surface hover:bg-surface-container text-primary font-button rounded-xl text-xs border border-hairline transition-colors flex items-center justify-center gap-1"
                    >
                      <RefreshCw size={14} />
                      Làm lại bài thi này
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
