// Lắng nghe phím tắt Alt+Q
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-bot') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url?.includes('/reels/')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle' });
      }
    });
  }
});

// Lắng nghe message từ popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggle') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url?.includes('/reels/')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle' });
      }
    });
    sendResponse({ success: true });
  }

  if (message.action === 'getStatus') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url?.includes('/reels/')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' }, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse({ isRunning: false });
      }
    });
    return true; // Giữ kênh message mở cho async response
  }
});
