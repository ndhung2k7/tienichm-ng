document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('toggleBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statsSection = document.getElementById('statsSection');
  const reelCount = document.getElementById('reelCount');
  const commentList = document.getElementById('commentList');
  const commentInput = document.getElementById('commentInput');
  const addBtn = document.getElementById('addBtn');

  let isRunning = false;

  // ============ DEFAULT COMMENTS ============
  const defaultComments = [
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

  // ============ INIT STORAGE ============
  async function initStorage() {
    const data = await chrome.storage.local.get('comments');
    if (!data.comments || data.comments.length === 0) {
      await chrome.storage.local.set({ comments: defaultComments });
    }
  }

  // ============ LOAD COMMENTS ============
  async function loadComments() {
    const data = await chrome.storage.local.get('comments');
    const comments = data.comments || [];
    renderComments(comments);
  }

  function renderComments(comments) {
    commentList.innerHTML = '';
    if (comments.length === 0) {
      commentList.innerHTML = '<div class="empty">Chưa có comment nào</div>';
      return;
    }

    comments.forEach((comment, index) => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      item.innerHTML = `
        <span class="comment-text" title="${escapeHtml(comment)}">${escapeHtml(comment)}</span>
        <div class="comment-actions">
          <button class="btn-edit" data-index="${index}" title="Sửa">✏️</button>
          <button class="btn-delete" data-index="${index}" title="Xóa">🗑️</button>
        </div>
      `;
      commentList.appendChild(item);
    });

    // Bind events
    commentList.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', deleteComment);
    });
    commentList.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', startEditComment);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============ ADD COMMENT ============
  async function addComment() {
    const text = commentInput.value.trim();
    if (!text) return;

    const data = await chrome.storage.local.get('comments');
    const comments = data.comments || [];
    comments.push(text);
    await chrome.storage.local.set({ comments });

    commentInput.value = '';
    await loadComments();
  }

  // ============ DELETE COMMENT ============
  async function deleteComment(e) {
    const index = parseInt(e.target.dataset.index);
    const data = await chrome.storage.local.get('comments');
    const comments = data.comments || [];
    comments.splice(index, 1);
    await chrome.storage.local.set({ comments });
    await loadComments();
  }

  // ============ EDIT COMMENT ============
  async function startEditComment(e) {
    const index = parseInt(e.target.dataset.index);
    const data = await chrome.storage.local.get('comments');
    const comments = data.comments || [];
    const oldText = comments[index];

    const newText = prompt('Sửa comment:', oldText);
    if (newText !== null && newText.trim() !== '') {
      comments[index] = newText.trim();
      await chrome.storage.local.set({ comments });
      await loadComments();
    }
  }

  // ============ TOGGLE BOT ============
  async function toggleBot() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url?.includes('/reels/')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle' }, (response) => {
          if (response) {
            updateUI(response.isRunning);
          }
        });
      } else {
        alert('Extension chỉ hoạt động trên Facebook Reels!\nVui lòng mở: https://www.facebook.com/reels/');
      }
    });
  }

  function updateUI(running) {
    isRunning = running;
    if (running) {
      statusDot.className = 'dot on';
      statusText.textContent = 'Đang chạy';
      toggleBtn.textContent = 'TẮT';
      toggleBtn.className = 'btn-toggle active';
      statsSection.style.display = 'block';
    } else {
      statusDot.className = 'dot off';
      statusText.textContent = 'Đã tắt';
      toggleBtn.textContent = 'BẬT';
      toggleBtn.className = 'btn-toggle';
      statsSection.style.display = 'none';
    }
  }

  async function checkStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url?.includes('/reels/')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' }, (response) => {
          if (response) {
            updateUI(response.isRunning);
            if (response.isRunning) {
              reelCount.textContent = response.currentReelIndex || 0;
            }
          }
        });
      } else {
        updateUI(false);
      }
    });
  }

  // ============ EVENT LISTENERS ============
  toggleBtn.addEventListener('click', toggleBot);
  addBtn.addEventListener('click', addComment);
  commentInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addComment();
    }
  });

  // ============ INIT ============
  await initStorage();
  await loadComments();
  await checkStatus();

  // Update status mỗi giây (khi popup mở)
  setInterval(checkStatus, 1000);
});
