document.addEventListener('DOMContentLoaded', () => {
  const wordList = document.getElementById('word-list');
  const sendBtn = document.getElementById('send-btn');
  const emptyState = document.getElementById('empty-state');
  const wordCount = document.getElementById('word-count');
  const topicSelect = document.getElementById('topic-select');
  const newTopicContainer = document.getElementById('new-topic-container');
  const newTopicInput = document.getElementById('new-topic-input');

  function renderTopics() {
    chrome.storage.local.get({ topics: [] }, (result) => {
      const topics = result.topics;
      
      // Keep the default "Create New Topic" option
      topicSelect.innerHTML = '<option value="new_topic_option">[ + ] Create New Topic</option>';
      
      if (topics && topics.length > 0) {
        // Add existing topics
        topics.forEach(topic => {
          const option = document.createElement('option');
          option.value = topic.id;
          option.textContent = topic.name;
          topicSelect.appendChild(option);
        });
        
        // Select the first existing topic by default instead of "New Topic" if we have them
        topicSelect.value = topics[0].id;
      } else {
        // If no topics synced yet, default to creating a new one
        newTopicContainer.style.display = 'block';
      }
    });
  }

  topicSelect.addEventListener('change', (e) => {
    if (e.target.value === 'new_topic_option') {
      newTopicContainer.style.display = 'block';
      newTopicInput.focus();
    } else {
      newTopicContainer.style.display = 'none';
    }
  });

  function renderWords() {
    chrome.storage.local.get({ words: [] }, (result) => {
      const words = result.words;
      wordCount.textContent = `${words.length} ${words.length === 1 ? 'word' : 'words'}`;
      wordList.innerHTML = '';
      
      if (words.length === 0) {
        emptyState.style.display = 'block';
        sendBtn.disabled = true;
      } else {
        emptyState.style.display = 'none';
        sendBtn.disabled = false;
        
        words.forEach((word, index) => {
          const li = document.createElement('li');
          li.textContent = word;
          
          const delBtn = document.createElement('button');
          delBtn.textContent = '×';
          delBtn.className = 'delete-btn';
          delBtn.onclick = () => {
            words.splice(index, 1);
            chrome.storage.local.set({ words: words }, renderWords);
          };
          
          li.appendChild(delBtn);
          wordList.appendChild(li);
        });
      }
    });
  }

  async function fetchExistingWordsFromBackend() {
    try {
      const response = await fetch('http://localhost:8000/api/words');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          return data.map(item => (typeof item === 'string' ? item : item.word)).filter(Boolean);
        }
      }
    } catch (err) {
      // Backend API not reachable or offline, fallback to local storage
    }
    return [];
  }

  sendBtn.addEventListener('click', () => {
    chrome.storage.local.get({ words: [], existingWords: [] }, async (result) => {
      const words = result.words || [];
      if (words.length === 0) return;

      sendBtn.disabled = true;
      sendBtn.textContent = 'Kiểm tra...';

      // 1. Lấy danh sách từ vựng hiện có từ backend API và storage
      const backendWords = await fetchExistingWordsFromBackend();
      const storageWords = result.existingWords || [];
      const combinedExisting = [...storageWords, ...backendWords];

      // 2. Thuật toán tối ưu: Sử dụng Hash Set (Set) cho phép tra cứu phần tử với độ phức tạp O(1).
      // Tổng độ phức tạp thuật toán là O(N + M) thay vì lặp lồng O(N * M).
      const existingSet = new Set(
        combinedExisting
          .map(w => (typeof w === 'string' ? w : w.word || '').toLowerCase().trim())
          .filter(Boolean)
      );

      // 3. Lọc bỏ các từ vựng đã tồn tại trong CSDL
      const filteredWords = words.filter(word => {
        const normalized = String(word || '').toLowerCase().trim();
        return normalized && !existingSet.has(normalized);
      });

      if (filteredWords.length === 0) {
        alert('Tất cả các từ vựng này đã tồn tại trong cơ sở dữ liệu!');
        chrome.storage.local.set({ words: [] }, () => {
          renderWords();
        });
        return;
      }

      // Tạo tham số bulk cho các từ vựng chưa tồn tại
      const bulkStr = encodeURIComponent(filteredWords.join(', '));
      
      let url = `http://localhost:5173/?bulk=${bulkStr}`;
      
      // Thêm thông tin chủ đề
      if (topicSelect.value === 'new_topic_option') {
        const newTopicName = newTopicInput.value.trim() || 'New Topic';
        url += `&newTopic=${encodeURIComponent(newTopicName)}`;
      } else {
        url += `&topicId=${encodeURIComponent(topicSelect.value)}`;
      }

      // Mở ứng dụng React local với các tham số
      chrome.tabs.create({ url: url });
      
      // Xóa danh sách từ chờ thêm
      chrome.storage.local.set({ words: [] }, () => {
        window.close();
      });
    });
  });

  renderTopics();
  renderWords();
});
