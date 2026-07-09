import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export function TopicModal({ isOpen, onClose, topicToEdit, onSave, onDelete }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(topicToEdit ? topicToEdit.name : '');
    }
  }, [isOpen, topicToEdit]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-surface rounded-[12px] shadow-lg w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="p-lg border-b border-hairline flex justify-between items-center">
          <h3 className="font-heading-2 text-heading-2 text-on-surface">
            {topicToEdit ? 'Edit Topic' : 'Add New Topic'}
          </h3>
          <button className="text-on-surface-variant hover:text-ink transition-colors" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-lg flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <label className="font-body-sm text-body-sm font-semibold text-on-surface-variant">
              Topic Name <span className="text-error">*</span>
            </label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-sm py-xs bg-surface-container-lowest border border-hairline rounded-[4px] font-body-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. Technology" 
              autoFocus
            />
          </div>
          
          <div className="flex justify-between items-center mt-sm">
            {topicToEdit ? (
              <button 
                type="button" 
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete this topic and all its words?")) {
                    onDelete(topicToEdit.id);
                  }
                }}
                className="text-error font-button text-sm hover:underline"
              >
                Delete Topic
              </button>
            ) : <div></div>}
            
            <div className="flex gap-sm">
              <button 
                type="button"
                className="px-md py-xs border border-hairline rounded-[8px] font-button text-on-surface hover:bg-surface-container-lowest transition-colors"
                onClick={onClose}
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-md py-xs bg-primary text-on-primary rounded-full font-button hover:bg-primary-active transition-colors"
              >
                Save Topic
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
