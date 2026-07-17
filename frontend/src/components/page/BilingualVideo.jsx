import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../services/backendApi';

function formatResumeTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function getResumePercentage(video) {
  const position = Math.max(0, Number(video.resumePositionSeconds || 0));
  const duration = Math.max(0, Number(video.playbackDurationSeconds || 0));
  return duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
}

function isVideoInProgress(video) {
  const position = Math.max(0, Number(video.resumePositionSeconds || 0));
  const duration = Math.max(0, Number(video.playbackDurationSeconds || 0));
  return !video.watchedAt
    && position >= 5
    && duration > 0
    && duration - position > 10
    && position / duration < 0.95;
}

const VIDEO_CARD_MIN_WIDTH = 210;
const VIDEO_GRID_GAP = 16;
const MAX_VIDEO_COLUMNS = 4;
const VIDEO_ROWS_PER_PAGE = 2;

function PaginatedVideoSection({ title, subtitle, icon, videos, renderVideoCard, className = '' }) {
  const gridRef = useRef(null);
  const [columnCount, setColumnCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const cardsPerPage = columnCount * VIDEO_ROWS_PER_PAGE;
  const previousCardsPerPageRef = useRef(cardsPerPage);
  const totalPages = Math.max(1, Math.ceil(videos.length / cardsPerPage));
  const pageStart = currentPage * cardsPerPage;
  const visibleVideos = videos.slice(pageStart, pageStart + cardsPerPage);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;

    const updateColumnCount = () => {
      const availableWidth = grid.getBoundingClientRect().width;
      const nextColumnCount = Math.max(
        1,
        Math.min(
          MAX_VIDEO_COLUMNS,
          Math.floor((availableWidth + VIDEO_GRID_GAP) / (VIDEO_CARD_MIN_WIDTH + VIDEO_GRID_GAP))
        )
      );
      setColumnCount(current => current === nextColumnCount ? current : nextColumnCount);
    };

    updateColumnCount();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateColumnCount);
      return () => window.removeEventListener('resize', updateColumnCount);
    }

    const observer = new ResizeObserver(updateColumnCount);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const previousCardsPerPage = previousCardsPerPageRef.current;
    setCurrentPage(page => {
      const firstVisibleVideoIndex = page * previousCardsPerPage;
      return Math.min(totalPages - 1, Math.floor(firstVisibleVideoIndex / cardsPerPage));
    });
    previousCardsPerPageRef.current = cardsPerPage;
  }, [cardsPerPage, totalPages]);

  return (
    <section className={className}>
      <div className="mb-md flex min-w-0 items-center gap-sm">
        {icon && <span className="material-symbols-outlined shrink-0 text-primary">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-heading-2 font-heading-2 text-on-surface" title={title}>{title}</h2>
          {subtitle && <p className="text-body-sm text-on-surface-variant">{subtitle}</p>}
        </div>

        {totalPages > 1 && (
          <div className="ml-auto flex shrink-0 items-center gap-xs" aria-label={`Phân trang ${title}`}>
            <span className="hidden min-w-[52px] text-center text-body-sm text-on-surface-variant sm:block">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(page => Math.max(0, page - 1))}
              disabled={currentPage === 0}
              title="Trang trước"
              aria-label={`Trang trước của ${title}`}
              className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-hairline bg-surface text-on-surface-variant hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-35 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(page => Math.min(totalPages - 1, page + 1))}
              disabled={currentPage === totalPages - 1}
              title="Trang tiếp theo"
              aria-label={`Trang tiếp theo của ${title}`}
              className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-hairline bg-surface text-on-surface-variant hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-35 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>
        )}
      </div>

      <div
        ref={gridRef}
        className="grid gap-md"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {visibleVideos.map(renderVideoCard)}
      </div>

      {totalPages > 1 && (
        <div className="mt-sm text-center text-body-sm text-on-surface-variant sm:hidden">
          Trang {currentPage + 1} / {totalPages}
        </div>
      )}
    </section>
  );
}

export function BilingualVideo({ videos, setVideos, topics, setTopics, onVideoSelect }) {
  const [importMode, setImportMode] = useState('single');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [videoList, setVideoList] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);
  const [playlistResult, setPlaylistResult] = useState(null);
  const [playlistError, setPlaylistError] = useState('');
  const [isListImporting, setIsListImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [listImportResult, setListImportResult] = useState(null);
  const [showTopicSelect, setShowTopicSelect] = useState(false);
  const [tempVideoData, setTempVideoData] = useState(null);
  const [selectedTopicId, setSelectedTopicId] = useState(topics[0]?.id || '');
  const [newTopicName, setNewTopicName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);

  useEffect(() => {
    if (topics.length === 0) {
      if (selectedTopicId) setSelectedTopicId('');
      return;
    }

    if (!topics.some(topic => topic.id === selectedTopicId)) {
      setSelectedTopicId(topics[0].id);
    }
  }, [topics, selectedTopicId]);

  const createTopicIfNeeded = async () => {
    if (!newTopicName.trim()) return selectedTopicId;

    const newTopic = {
      id: crypto.randomUUID(),
      name: newTopicName.trim(),
      colorClass: ['bg-accent-sky', 'bg-accent-pink', 'bg-accent-green', 'bg-accent-orange'][Math.floor(Math.random() * 4)]
    };
    await setTopics(currentTopics => [...currentTopics, newTopic]);
    setSelectedTopicId(newTopic.id);
    setNewTopicName('');
    return newTopic.id;
  };

  const changeImportMode = mode => {
    setImportMode(mode);
    setListImportResult(null);
    setPlaylistResult(null);
    setPlaylistError('');
    setShowTopicSelect(false);
    setTempVideoData(null);
    setProgress(0);
    setProgressText('');
  };

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
      const finalTopicId = await createTopicIfNeeded();

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

  const handleListImport = async () => {
    const inputUrls = videoList
      .split(/\r?\n/)
      .map(url => url.trim())
      .filter(Boolean);

    if (inputUrls.length === 0) return;

    const uniqueUrls = [...new Set(inputUrls)];
    const duplicateInputCount = inputUrls.length - uniqueUrls.length;
    setIsListImporting(true);
    setListImportResult(null);
    setProgress(0);
    setProgressText(`Chuẩn bị nhập ${uniqueUrls.length} video...`);

    try {
      const finalTopicId = await createTopicIfNeeded();
      if (!finalTopicId) throw new Error('Vui lòng chọn hoặc tạo một chủ đề.');

      const knownVideoIds = new Set(videos.map(video => video.youtubeId).filter(Boolean));
      const importedVideos = [];
      const failed = [];
      const skipped = [];

      for (let index = 0; index < uniqueUrls.length; index += 1) {
        const url = uniqueUrls[index];
        setProgressText(`Đang xử lý video ${index + 1}/${uniqueUrls.length}...`);

        try {
          const data = await apiRequest('/api/videos/extract-info', {
            method: 'POST',
            body: { url }
          });

          if (knownVideoIds.has(data.videoId)) {
            skipped.push({ url, title: data.title, reason: 'Video đã có trong thư viện' });
          } else {
            knownVideoIds.add(data.videoId);
            importedVideos.push({
              id: crypto.randomUUID(),
              youtubeId: data.videoId,
              title: data.title,
              thumbnail: data.thumbnail,
              transcript: data.transcript,
              topicId: finalTopicId,
              createdAt: Date.now() + index
            });
          }
        } catch (error) {
          failed.push({ url, reason: error.message });
        }

        setProgress(Math.round(((index + 1) / uniqueUrls.length) * 100));
      }

      if (importedVideos.length > 0) {
        await setVideos(currentVideos => [...currentVideos, ...importedVideos]);
      }

      setListImportResult({
        imported: importedVideos.length,
        failed,
        skipped,
        duplicateInputCount
      });
      setVideoList(failed.map(item => item.url).join('\n'));
      setProgressText('Đã xử lý xong danh sách.');
    } catch (error) {
      setProgress(0);
      setProgressText('Không thể lưu danh sách video.');
      setListImportResult({ imported: 0, failed: [], skipped: [], duplicateInputCount: 0, saveError: error.message });
    } finally {
      setIsListImporting(false);
    }
  };

  const handleLoadPlaylist = async () => {
    if (!playlistUrl.trim()) return;

    setIsPlaylistLoading(true);
    setPlaylistResult(null);
    setPlaylistError('');

    try {
      const data = await apiRequest('/api/videos/playlist-items', {
        method: 'POST',
        body: { url: playlistUrl.trim() }
      });
      const currentUrls = [...new Set(videoList
        .split(/\r?\n/)
        .map(url => url.trim())
        .filter(Boolean))];
      const mergedUrls = [...new Set([...currentUrls, ...data.urls])];

      setVideoList(mergedUrls.join('\n'));
      setPlaylistResult({
        title: data.title,
        total: data.count,
        added: mergedUrls.length - currentUrls.length
      });
    } catch (error) {
      setPlaylistError(error.message);
    } finally {
      setIsPlaylistLoading(false);
    }
  };

  const videosByTopic = topics.map(topic => {
    return {
      topic,
      videos: videos.filter(v => v.topicId === topic.id)
    };
  }).filter(group => group.videos.length > 0);
  const inProgressVideos = videos
    .filter(isVideoInProgress)
    .sort((first, second) => Number(second.lastWatchedAt || 0) - Number(first.lastWatchedAt || 0));

  return (
    <div className="w-full max-w-5xl mx-auto p-lg">
      <div className="mb-lg flex justify-center">
        <div className="inline-flex bg-surface-container-low rounded-[8px] p-1 border border-hairline">
          <button
            type="button"
            onClick={() => changeImportMode('single')}
            disabled={isLoading || isSaving || isListImporting || isPlaylistLoading}
            className={`px-md py-xs rounded-[6px] font-button text-button transition-all disabled:opacity-50 ${importMode === 'single' ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            Một video
          </button>
          <button
            type="button"
            onClick={() => changeImportMode('list')}
            disabled={isLoading || isSaving || isListImporting || isPlaylistLoading}
            className={`px-md py-xs rounded-[6px] font-button text-button transition-all disabled:opacity-50 ${importMode === 'list' ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            Danh sách video
          </button>
        </div>
      </div>

      {importMode === 'single' ? (
        <div className="mb-xl flex flex-col md:flex-row gap-sm items-center justify-center">
          <input
            type="text"
            placeholder="Nhập link video YouTube..."
            value={youtubeUrl}
            onChange={e => setYoutubeUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && youtubeUrl && !isLoading) handleImport();
            }}
            className="w-full md:w-[400px] px-md py-sm bg-surface border border-hairline rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleImport}
            disabled={isLoading || !youtubeUrl.trim()}
            className="bg-primary text-on-primary px-lg py-sm rounded-[8px] font-button hover:opacity-90 disabled:opacity-50 whitespace-nowrap min-w-[100px]"
          >
            {isLoading ? 'Đang tải...' : 'Nhập'}
          </button>
        </div>
      ) : (
        <div className="mb-xl p-lg bg-surface-container-low rounded-[12px] border border-hairline flex flex-col gap-md max-w-[700px] mx-auto">
          <div>
            <label htmlFor="playlist-url" className="block text-body-sm font-medium text-on-surface mb-xs">
              URL playlist YouTube
            </label>
            <div className="flex flex-col md:flex-row gap-sm">
              <input
                id="playlist-url"
                type="text"
                value={playlistUrl}
                onChange={event => {
                  setPlaylistUrl(event.target.value);
                  setPlaylistResult(null);
                  setPlaylistError('');
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter' && playlistUrl.trim() && !isPlaylistLoading) handleLoadPlaylist();
                }}
                disabled={isPlaylistLoading || isListImporting}
                placeholder="https://www.youtube.com/playlist?list=..."
                className="flex-1 px-md py-sm bg-surface border border-hairline rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleLoadPlaylist}
                disabled={isPlaylistLoading || isListImporting || !playlistUrl.trim()}
                className="px-lg py-sm bg-surface text-primary border border-primary rounded-[8px] font-button hover:bg-primary/10 disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-xs"
              >
                <span className={`material-symbols-outlined text-[20px] ${isPlaylistLoading ? 'animate-spin' : ''}`}>
                  {isPlaylistLoading ? 'progress_activity' : 'playlist_play'}
                </span>
                {isPlaylistLoading ? 'Đang lấy...' : 'Lấy danh sách'}
              </button>
            </div>
            {playlistResult && (
              <p className="mt-xs text-body-sm text-accent-green">
                Đã tìm thấy {playlistResult.total} video trong “{playlistResult.title}” và thêm {playlistResult.added} URL mới.
              </p>
            )}
            {playlistError && <p className="mt-xs text-body-sm text-error">Không thể lấy playlist: {playlistError}</p>}
          </div>

          <div className="flex items-center gap-sm text-body-sm text-on-surface-variant">
            <div className="h-px bg-hairline flex-1"></div>
            <span>hoặc nhập thủ công</span>
            <div className="h-px bg-hairline flex-1"></div>
          </div>

          <div>
            <label htmlFor="video-list" className="block text-body-sm font-medium text-on-surface mb-xs">
              Danh sách URL video YouTube
            </label>
            <textarea
              id="video-list"
              rows={7}
              value={videoList}
              onChange={e => setVideoList(e.target.value)}
              disabled={isListImporting || isPlaylistLoading}
              placeholder={'Dán mỗi URL trên một dòng, ví dụ:\nhttps://www.youtube.com/watch?v=...\nhttps://youtu.be/...'}
              className="w-full px-md py-sm bg-surface border border-hairline rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary resize-y disabled:opacity-60"
            />
            <p className="mt-xs text-body-sm text-on-surface-variant">Mỗi dòng một URL. Video trùng sẽ được tự động bỏ qua.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div>
              <label htmlFor="list-topic" className="block text-body-sm font-medium text-on-surface-variant mb-xs">Chủ đề có sẵn</label>
              <select
                id="list-topic"
                value={selectedTopicId}
                onChange={e => setSelectedTopicId(e.target.value)}
                disabled={isListImporting || Boolean(newTopicName.trim())}
                className="w-full px-md py-sm rounded-[8px] border border-hairline bg-surface disabled:opacity-60"
              >
                {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="list-new-topic" className="block text-body-sm font-medium text-on-surface-variant mb-xs">Hoặc tạo chủ đề mới</label>
              <input
                id="list-new-topic"
                type="text"
                value={newTopicName}
                onChange={e => setNewTopicName(e.target.value)}
                disabled={isListImporting}
                placeholder="Tên chủ đề mới"
                className="w-full px-md py-sm border border-hairline rounded-[8px] bg-surface disabled:opacity-60"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleListImport}
              disabled={isListImporting || isPlaylistLoading || !videoList.trim() || (!selectedTopicId && !newTopicName.trim())}
              className="bg-primary text-on-primary px-lg py-sm rounded-[8px] font-button hover:opacity-90 disabled:opacity-50 flex items-center gap-xs"
            >
              <span className="material-symbols-outlined text-[20px]">playlist_add</span>
              {isListImporting ? 'Đang nhập...' : 'Nhập danh sách'}
            </button>
          </div>
        </div>
      )}

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

      {importMode === 'list' && (isListImporting || listImportResult) && (
        <div className="max-w-[700px] mx-auto mb-xl px-lg">
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

          {listImportResult && (
            <div className="mt-md p-md bg-surface rounded-[8px] border border-hairline text-body-sm">
              {listImportResult.saveError ? (
                <p className="text-error">Lỗi: {listImportResult.saveError}</p>
              ) : (
                <>
                  <p className="font-medium text-on-surface">
                    Đã nhập {listImportResult.imported} video
                    {listImportResult.skipped.length > 0 && `, bỏ qua ${listImportResult.skipped.length} video đã tồn tại`}
                    {listImportResult.duplicateInputCount > 0 && ` và ${listImportResult.duplicateInputCount} URL trùng trong danh sách`}.
                  </p>
                  {listImportResult.failed.length > 0 && (
                    <div className="mt-sm">
                      <p className="font-medium text-error">Không thể nhập {listImportResult.failed.length} video:</p>
                      <ul className="mt-xs space-y-xs text-on-surface-variant">
                        {listImportResult.failed.map(item => (
                          <li key={item.url} className="break-all">
                            <span className="font-medium text-on-surface">{item.url}</span>: {item.reason}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-sm text-on-surface-variant">Các URL lỗi đã được giữ lại để bạn có thể thử lại.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
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

      {inProgressVideos.length > 0 && (
        <PaginatedVideoSection
          className="mb-xxl"
          title="Tiếp tục xem"
          subtitle="Quay lại đúng vị trí bạn đã dừng"
          icon="history"
          videos={inProgressVideos}
          renderVideoCard={inProgressVideo => {
              const progressPercentage = getResumePercentage(inProgressVideo);

              return (
                <button
                  key={inProgressVideo.id}
                  type="button"
                  onClick={() => onVideoSelect(inProgressVideo.id)}
                  title={inProgressVideo.title}
                  className="min-w-0 overflow-hidden rounded-[12px] border border-hairline bg-surface text-left hover:shadow-md hover:border-primary/40 transition-all group"
                >
                  <div className="relative aspect-video overflow-hidden bg-black">
                    <img
                      src={inProgressVideo.thumbnail}
                      alt=""
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/50">
                      <div
                        className="h-full bg-error"
                        style={{ width: `${progressPercentage}%` }}
                      ></div>
                    </div>
                    <span className="absolute bottom-sm right-sm rounded-[4px] bg-black/80 px-xs py-0.5 font-mono text-[11px] text-white">
                      {Math.round(progressPercentage)}%
                    </span>
                  </div>
                  <div className="p-sm">
                    <h3 className="line-clamp-2 font-body-md font-medium text-on-surface">{inProgressVideo.title}</h3>
                    <p className="mt-xs flex items-center gap-xs text-body-sm text-primary">
                      <span className="material-symbols-outlined text-[17px]">play_circle</span>
                      Tiếp tục từ {formatResumeTime(inProgressVideo.resumePositionSeconds)}
                    </p>
                  </div>
                </button>
              );
          }}
        />
      )}

      <div className="flex flex-col gap-xxl">
        {videosByTopic.length === 0 && !showTopicSelect && (
          <div className="text-center text-on-surface-variant py-xxl">
            Chưa có video nào. Hãy nhập link Youtube để bắt đầu!
          </div>
        )}
        {videosByTopic.map(group => (
          <PaginatedVideoSection
            key={group.topic.id}
            title={group.topic.name}
            videos={group.videos}
            renderVideoCard={video => (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => onVideoSelect(video.id)}
                  title={video.title}
                  className="min-w-0 bg-surface rounded-[12px] overflow-hidden border border-hairline cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group flex flex-col text-left"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-black">
                    <img
                      src={video.thumbnail}
                      alt=""
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-sm flex-1 flex flex-col justify-between">
                    <h3 className="font-body-md text-on-surface line-clamp-2 font-medium">{video.title}</h3>
                  </div>
                </button>
            )}
          />
        ))}
      </div>
    </div>
  );
}
