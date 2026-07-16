import React, { useState } from 'react';
import { apiRequest } from '../../services/backendApi';

export function BilingualVideo({ videos, setVideos, topics, setTopics, settings, onVideoSelect }) {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [showTopicSelect, setShowTopicSelect] = useState(false);
  const [tempVideoData, setTempVideoData] = useState(null);
  const [selectedTopicId, setSelectedTopicId] = useState(topics[0]?.id || '');
  const [newTopicName, setNewTopicName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);

  const handleImport = async () => {
    if (!youtubeUrl) return;
    setIsLoading(true);
    setProgress(0);
    setProgressText('Đang phân tích URL...');

    const progressInterval = setInterval(() => {
      setProgress(p => {
        if (p < 30) {
           setProgressText('Đang kết nối đến YouTube...');
           return p + 5;
        }
        if (p < 70) {
           setProgressText('Đang tải thông tin video...');
           return p + 5;
        }
        if (p < 95) {
           setProgressText('Đang trích xuất phụ đề (có thể mất chút thời gian)...');
           return p + 2;
        }
        return p;
      });
    }, 300);

    try {
      const data = await apiRequest('/api/videos/extract-info', {
        method: 'POST',
        body: { url: youtubeUrl }
      });
      clearInterval(progressInterval);
      setProgress(100);
      setProgressText('Hoàn tất!');
      
      setTimeout(() => {
        setTempVideoData(data);
        setShowTopicSelect(true);
        setIsLoading(false);
      }, 600);
    } catch (e) {
      clearInterval(progressInterval);
      setProgress(0);
      setIsLoading(false);
      alert("Lỗi khi tải video: " + e.message);
    }
  };

  const handleSaveVideo = async () => {
    setIsSaving(true);
    setSaveProgress(0);

    const interval = setInterval(() => {
      setSaveProgress(p => p < 90 ? p + 5 : p);
    }, 100);

    try {
      let finalTopicId = selectedTopicId;
      if (newTopicName.trim()) {
        const newTopic = {
          id: crypto.randomUUID(),
          name: newTopicName,
          colorClass: ['bg-accent-sky', 'bg-accent-pink', 'bg-accent-green', 'bg-accent-orange'][Math.floor(Math.random() * 4)]
        };
        await setTopics([...topics, newTopic]);
        finalTopicId = newTopic.id;
      }

      const newVideo = {
        id: crypto.randomUUID(),
        youtubeId: tempVideoData.videoId,
        title: tempVideoData.title,
        thumbnail: tempVideoData.thumbnail,
        transcript: tempVideoData.transcript,
        topicId: finalTopicId,
        createdAt: Date.now()
      };

      await setVideos([...videos, newVideo]);
      
      clearInterval(interval);
      setSaveProgress(100);
      
      setTimeout(() => {
        setShowTopicSelect(false);
        setTempVideoData(null);
        setYoutubeUrl('');
        setNewTopicName('');
        setIsSaving(false);
      }, 500);
    } catch (error) {
      clearInterval(interval);
      setIsSaving(false);
      alert("Lỗi khi lưu video: " + error.message);
    }
  };

  const videosByTopic = topics.map(topic => {
    return {
      topic,
      videos: videos.filter(v => v.topicId === topic.id)
    };
  }).filter(group => group.videos.length > 0);

  return (
    <div className="w-full max-w-5xl mx-auto p-lg">
      <div className="mb-xl flex flex-col md:flex-row gap-sm items-center justify-center">
        <input 
          type="text" 
          placeholder="Nhập link video Youtube..." 
          value={youtubeUrl}
          onChange={e => setYoutubeUrl(e.target.value)}
          className="w-full md:w-[400px] px-md py-sm bg-surface border border-hairline rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button 
          onClick={handleImport}
          disabled={isLoading || !youtubeUrl}
          className="bg-primary text-on-primary px-lg py-sm rounded-[8px] font-button hover:opacity-90 disabled:opacity-50 whitespace-nowrap min-w-[100px]"
        >
          {isLoading ? 'Đang tải...' : 'Nhập'}
        </button>
      </div>

      {isLoading && (
        <div className="max-w-[600px] mx-auto mb-xl px-lg">
          <div className="flex justify-between text-body-sm text-on-surface-variant mb-xs font-medium">
            <span>{progressText}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
            <div 
              className="bg-primary h-full rounded-full transition-all duration-300 ease-out" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {showTopicSelect && tempVideoData && (
        <div className="mb-xl p-lg bg-surface-container-low rounded-[12px] border border-hairline flex flex-col gap-md max-w-[600px] mx-auto">
          <h3 className="text-heading-2 font-heading-2 text-on-surface">Chọn chủ đề cho video</h3>
          <div className="flex items-center gap-md">
            <img src={tempVideoData.thumbnail} alt="Thumbnail" className="w-32 h-auto rounded-[8px] object-cover" />
            <div className="font-body-md text-on-surface-variant font-medium line-clamp-2">{tempVideoData.title}</div>
          </div>
          <div className="flex flex-col gap-sm">
            <label className="text-body-sm font-medium text-on-surface-variant">Chọn chủ đề có sẵn:</label>
            <select 
              value={selectedTopicId} 
              onChange={e => setSelectedTopicId(e.target.value)}
              className="px-md py-sm rounded-[8px] border border-hairline bg-surface"
            >
              {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="text-center text-body-sm text-on-surface-variant">hoặc</div>
            <label className="text-body-sm font-medium text-on-surface-variant">Tạo chủ đề mới:</label>
            <input 
              type="text" 
              placeholder="Tên chủ đề mới"
              value={newTopicName}
              onChange={e => setNewTopicName(e.target.value)}
              className="px-md py-sm border border-hairline rounded-[8px] bg-surface"
            />
          </div>
          <div className="flex justify-end gap-sm mt-md">
            <button 
              onClick={() => setShowTopicSelect(false)}
              disabled={isSaving}
              className="px-md py-sm rounded-[8px] text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
            >
              Hủy
            </button>
            <button 
              onClick={handleSaveVideo}
              disabled={isSaving}
              className="px-md py-sm bg-primary text-on-primary rounded-[8px] hover:opacity-90 disabled:opacity-50 flex items-center gap-xs min-w-[120px] justify-center"
            >
              {isSaving ? 'Đang lưu...' : 'Lưu Video'}
            </button>
          </div>
          {isSaving && (
            <div className="w-full bg-surface-container-high rounded-full h-1 mt-xs overflow-hidden">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-200" 
                style={{ width: `${saveProgress}%` }}
              ></div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-xxl">
        {videosByTopic.length === 0 && !showTopicSelect && (
          <div className="text-center text-on-surface-variant py-xxl">
            Chưa có video nào. Hãy nhập link Youtube để bắt đầu!
          </div>
        )}
        {videosByTopic.map(group => (
          <div key={group.topic.id}>
            <h2 className="text-heading-2 font-heading-2 text-on-surface mb-md">{group.topic.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-md">
              {group.videos.map(video => (
                <div 
                  key={video.id} 
                  onClick={() => onVideoSelect(video.id)}
                  className="bg-surface rounded-[12px] overflow-hidden border border-hairline cursor-pointer hover:shadow-md transition-shadow group flex flex-col"
                >
                  <div className="relative w-full pt-[56.25%] overflow-hidden bg-black">
                    <img 
                      src={video.thumbnail} 
                      alt={video.title} 
                      className="absolute top-0 left-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                    />
                  </div>
                  <div className="p-sm flex-1 flex flex-col justify-between">
                    <h3 className="font-body-md text-on-surface line-clamp-2 font-medium">{video.title}</h3>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
