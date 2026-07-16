import React from 'react';
import { Menu, Settings } from 'lucide-react';

export function TopNavBar({ wordCount, activePage, setActivePage, onOpenDrawer, onOpenSettings }) {
  const navItems = [
    { id: 'vocabulary', label: 'Từ vựng' },
    { id: 'listening', label: 'Luyện nghe' },
    { id: 'reading', label: 'Đọc - hiểu' },
    { id: 'speaking', label: 'Luyện nói' },
    { id: 'writing', label: 'Luyện viết' },
    { id: 'exam', label: 'Kiểm tra' },
    { id: 'review', label: 'Ôn ngắt quãng' },
    { id: 'bilingual-video', label: 'Video Song ngữ' },
  ];

  return (
    <nav className="sticky top-0 w-full z-50 flex justify-between items-center px-lg h-[56px] bg-canvas border-b border-hairline flat no shadows">
      <div className="flex-1 flex items-center gap-md">
        <button
          className="md:hidden p-xs rounded-lg hover:bg-surface-container-low text-on-surface-variant transition-colors"
          onClick={onOpenDrawer}
        >
          <Menu size={24} />
        </button>
        <span className="text-heading-1 font-heading-1 text-primary hidden sm:block">MinusLearn</span>
      </div>

      <div className="flex flex-[3] justify-start md:justify-center h-full items-center gap-sm overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActivePage(item.id)}
            className={`h-[56px] px-sm font-button text-button transition-colors border-b-2 whitespace-nowrap ${activePage === item.id ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-on-surface'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex justify-end items-center gap-md">
        <div className="font-body-sm text-body-sm text-on-surface-variant hidden md:block">
          {wordCount} Từ
        </div>
        <button
          onClick={onOpenSettings}
          className="p-xs rounded-lg hover:bg-surface-container-low text-on-surface-variant transition-colors cursor-pointer active:opacity-80"
        >
          <Settings size={24} />
        </button>
      </div>
    </nav>
  );
}
