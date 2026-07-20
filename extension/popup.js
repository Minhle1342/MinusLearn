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

  sendBtn.addEventListener('click', () => {
    chrome.storage.local.get({ words: [] }, (result) => {
      const words = result.words;
      if (words.length > 0) {
        // Construct the bulk parameter
        const bulkStr = encodeURIComponent(words.join(', '));
        
        let url = `http://localhost:5173/?bulk=${bulkStr}`;
        
        // Add topic info
        if (topicSelect.value === 'new_topic_option') {
          const newTopicName = newTopicInput.value.trim() || 'New Topic';
          url += `&newTopic=${encodeURIComponent(newTopicName)}`;
        } else {
          url += `&topicId=${encodeURIComponent(topicSelect.value)}`;
        }

        // Open local React app with the parameters
        chrome.tabs.create({ url: url });
        
        // Clear the words
        chrome.storage.local.set({ words: [] }, () => {
          window.close();
        });
      }
    });
  });

  renderTopics();
  renderWords();
});
