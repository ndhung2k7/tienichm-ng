(function () {
  'use strict';

  // ============ STATE ============
  let isRunning = false;
  let isPaused = false;
  let mainLoopTimeout = null;
  let lastCommentTime = 0;
  let usedComments = [];
  let currentReelIndex = 0;

  // ============ UTILS ============
  function getRandom(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function log(step, detail = '') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[FB-BOT][${timestamp}] ${step}`, detail);
  }

  // ============ COMMENT STORAGE ============
  async function getComments() {
    const data = await chrome.storage.local.get('comments');
    return data.comments || [
      'Hay quá 👍',
      'Video chất lượng',
      'Cười mệt luôn 🤣',
      'Cho xin nhạc với',
      'Lâu lắm mới thấy video hay',
      'Like cho bạn nè',
      'Co giật hết cả người 😂',
      'Video bị lag à mọi người',
      'Đúng tâm trạng tôi luôn',
      'Xem xong muốn đi du lịch quá',
      'Nội dung hay, dựng tốt',
      'Ai còn xem không điểm danh',
      'Chia sẻ cho bạn bè liền',
      'Ủng hộ kênh bạn nha',
      'Hay thật sự, xem đi xem lại',
    ];
  }

  function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  async function getRandomUnusedComment() {
    const comments = await getComments();
    if (comments.length === 0) return 'Hay quá! 👍';

    // Reset used nếu đã dùng hết
    if (usedComments.length >= comments.length) {
      usedComments = [];
    }

    const shuffled = shuffleArray(comments);
    for (const comment of shuffled) {
      if (!usedComments.includes(comment)) {
        usedComments.push(comment);
        return comment;
      }
    }
    // Fallback
    usedComments = [shuffled[0]];
    return shuffled[0];
  }

  // ============ DOM FINDERS (no fixed classes) ============
  async function findElement(selectors, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      for (const selector of selectors) {
        try {
          const el = document.querySelector(selector);
          if (el) return el;
        } catch (e) {
          // Skip invalid selectors
        }
      }
      await delay(300);
    }
    return null;
  }

  async function findCommentInput(retries = 3) {
    const selectors = [
      '[aria-label*="comment" i]',
      '[aria-label*="bình luận" i]',
      '[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][aria-label]',
      // Fallback: any contenteditable inside comment area
      'div[contenteditable="true"]',
    ];

    for (let i = 0; i < retries; i++) {
      const el = await findElement(selectors, 3000);
      if (el && el.isConnected) {
        // Kiểm tra có thực sự là input comment không (gần nút gửi)
        const parent = el.closest('form, [role="form"], div');
        if (parent) {
          return el;
        }
      }
      log(`Retry find comment input: ${i + 1}/${retries}`);
      await delay(1000);
    }
    return null;
  }

  async function findCommentButton(retries = 3) {
    const selectors = [
      '[aria-label*="comment" i][role="button"]',
      '[aria-label*="bình luận" i]',
      'div[role="button"][aria-label*="comment" i]',
      // Facebook thường dùng aria-label có text "Comment" hoặc "Bình luận"
    ];

    for (let i = 0; i < retries; i++) {
      // Tìm tất cả button có aria-label chứa "comment" hoặc "bình luận"
      const allElements = document.querySelectorAll('div[role="button"], span[role="button"]');
      for (const el of allElements) {
        const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
        if (ariaLabel.includes('comment') || ariaLabel.includes('bình luận')) {
          // Không phải là "Send" hay "Gửi"
          if (!ariaLabel.includes('send') && !ariaLabel.includes('gửi') && !ariaLabel.includes('reply')) {
            return el;
          }
        }
      }
      log(`Retry find comment button: ${i + 1}/${retries}`);
      await delay(1000);
    }
    return null;
  }

  async function findNextReelButton() {
    const selectors = [
      '[aria-label="Next reel" i]',
      '[aria-label="Reel tiếp theo" i]',
      'div[role="button"][aria-label*="next" i]',
      'div[role="button"][aria-label*="tiếp" i]',
    ];

    return await findElement(selectors, 3000);
  }

  // ============ TYPING SIMULATION ============
  async function typeLikeHuman(element, text) {
    element.focus();
    await delay(100);

    // Clear existing text (nếu có)
    if (element.textContent) {
      element.textContent = '';
    }

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Dispatch beforeinput event
      const beforeInputEvent = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: char,
      });
      element.dispatchEvent(beforeInputEvent);

      // Insert character
      if (element.contentEditable === 'true' || element.getAttribute('contenteditable') === 'true') {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(char);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        // Fallback cho input thường
        element.value = (element.value || '') + char;
      }

      // Dispatch input event
      const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: char,
      });
      element.dispatchEvent(inputEvent);

      // Random delay giữa các ký tự
      await delay(getRandom(50, 150));
    }

    // Dispatch change event
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function pressEnter(element) {
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(enterEvent);

    await delay(50);

    const enterUpEvent = new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(enterUpEvent);

    // Thử submit form nếu có
    const form = element.closest('form');
    if (form) {
      await delay(200);
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);
    }
  }

  // ============ COMMENT FLOW ============
  async function openCommentSection() {
    const commentButton = await findCommentButton(3);
    if (!commentButton) {
      log('❌ Không tìm thấy nút comment');
      return false;
    }

    log('🔍 Tìm thấy nút comment, đang click...');
    commentButton.click();
    await delay(getRandom(1000, 2000));

    // Kiểm tra comment section đã mở chưa
    const input = await findCommentInput(2);
    if (input) {
      log('✅ Comment section đã mở');
      return true;
    }

    // Retry click
    log('⚠️ Comment section chưa mở, retry click...');
    commentButton.click();
    await delay(getRandom(1500, 2500));

    const inputRetry = await findCommentInput(1);
    return !!inputRetry;
  }

  async function postComment() {
    try {
      // Random xác suất comment (30-60%)
      const commentProbability = getRandom(30, 60);
      const shouldComment = Math.random() * 100 <= commentProbability;

      if (!shouldComment) {
        log('⏭️ Bỏ qua comment (xác suất)');
        return true;
      }

      // Anti-spam: kiểm tra thời gian từ lần comment cuối
      const now = Date.now();
      const minCommentInterval = getRandom(10000, 20000);
      if (now - lastCommentTime < minCommentInterval && lastCommentTime !== 0) {
        const waitTime = minCommentInterval - (now - lastCommentTime);
        log(`⏳ Anti-spam: đợi ${(waitTime / 1000).toFixed(1)}s trước khi comment tiếp`);
        await delay(waitTime);
      }

      // Mở comment section
      const opened = await openCommentSection();
      if (!opened) {
        log('❌ Không thể mở comment section');
        return false;
      }

      // Đợi DOM load
      await delay(getRandom(1000, 3000));

      // Tìm input
      const input = await findCommentInput(3);
      if (!input) {
        log('❌ Không tìm thấy input comment');
        return false;
      }

      // Lấy comment ngẫu nhiên
      const commentText = await getRandomUnusedComment();
      log('💬 Chuẩn bị comment:', commentText);

      // Type
      log('⌨️ Đang typing...');
      await typeLikeHuman(input, commentText);
      await delay(getRandom(200, 500));

      // Press Enter
      log('📨 Đang gửi comment...');
      await pressEnter(input);

      lastCommentTime = Date.now();
      log('✅ Comment thành công!');
      return true;
    } catch (error) {
      log('❌ Lỗi khi comment:', error.message);
      return false;
    }
  }

  // ============ SCROLL TO NEXT REEL ============
  async function scrollToNextReel() {
    // Random delay trước khi scroll (giả vờ xem)
    const watchDelay = getRandom(3000, 6000);
    log(`👀 Đang xem reel... (${(watchDelay / 1000).toFixed(1)}s)`);
    await delay(watchDelay);

    // Random pause (10% cơ hội pause lâu hơn)
    if (Math.random() < 0.1) {
      const extraPause = getRandom(2000, 5000);
      log(`⏸️ Random pause: ${(extraPause / 1000).toFixed(1)}s`);
      await delay(extraPause);
    }

    // Tìm nút next
    const nextButton = await findNextReelButton();
    if (nextButton) {
      log('➡️ Chuyển sang reel tiếp theo');
      nextButton.click();
      await delay(getRandom(800, 1500));
      return true;
    }

    // Fallback: dùng phím mũi tên
    log('⚠️ Không tìm thấy nút next, dùng phím mũi tên');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
    await delay(500);
    return true;
  }

  // ============ MAIN LOOP ============
  async function mainLoop() {
    if (!isRunning || isPaused) return;

    log('🔄 === Bắt đầu vòng lặp mới ===');
    currentReelIndex++;

    try {
      // Bước 1: Comment (nếu đủ điều kiện)
      await postComment();

      // Bước 2: Scroll sang reel tiếp theo
      await scrollToNextReel();

    } catch (error) {
      log('❌ Lỗi trong main loop:', error.message);
    }

    // Tiếp tục vòng lặp
    if (isRunning && !isPaused) {
      const loopDelay = getRandom(500, 1500);
      mainLoopTimeout = setTimeout(mainLoop, loopDelay);
    }
  }

  // ============ START/STOP ============
  function startBot() {
    if (isRunning) return;
    isRunning = true;
    isPaused = false;
    log('🟢 BOT ĐÃ BẬT');
    currentReelIndex = 0;
    mainLoop();
  }

  function stopBot() {
    isRunning = false;
    isPaused = false;
    if (mainLoopTimeout) {
      clearTimeout(mainLoopTimeout);
      mainLoopTimeout = null;
    }
    log('🔴 BOT ĐÃ TẮT');
  }

  function toggleBot() {
    if (isRunning) {
      stopBot();
    } else {
      startBot();
    }
    // Gửi status về popup nếu đang mở
    chrome.runtime.sendMessage({ action: 'statusUpdate', isRunning }).catch(() => {});
  }

  // ============ MESSAGE HANDLER ============
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle') {
      toggleBot();
      sendResponse({ isRunning });
    }

    if (message.action === 'getStatus') {
      sendResponse({
        isRunning,
        currentReelIndex,
        lastCommentTime,
      });
    }

    if (message.action === 'stop') {
      stopBot();
      sendResponse({ isRunning: false });
    }

    if (message.action === 'start') {
      startBot();
      sendResponse({ isRunning: true });
    }

    return true;
  });

  // ============ INIT ============
  log('📦 FB Reels Bot loaded');
  log('⌨️ Nhấn Alt+Q để bật/tắt');

  // Tự động bật nếu có flag trong storage
  chrome.storage.local.get('autoStart', (data) => {
    if (data.autoStart) {
      startBot();
    }
  });
})();
