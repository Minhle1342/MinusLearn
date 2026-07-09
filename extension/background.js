chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "minuslearn-add",
    title: "Add '%s' to MinusLearn",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "minuslearn-add") {
    const selectedText = info.selectionText.trim();
    if (selectedText) {
      chrome.storage.local.get({ words: [] }, (result) => {
        const words = result.words;
        if (!words.includes(selectedText)) {
          words.push(selectedText);
          chrome.storage.local.set({ words: words });
        }
      });
    }
  }
});
