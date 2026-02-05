// DOM Elements
const themeToggle = document.getElementById('theme-toggle');
const sunIcon = document.getElementById('sun-icon');
const moonIcon = document.getElementById('moon-icon');
const fullscreenToggle = document.getElementById('fullscreen-toggle');
const expandIcon = document.getElementById('expand-icon');
const shrinkIcon = document.getElementById('shrink-icon');
const authScreen = document.getElementById('auth-screen');
const authError = document.getElementById('auth-error');

const dashboard = document.getElementById('dashboard');
const logoutBtn = document.getElementById('logout-btn');
const fileInput = document.getElementById('file-input');
const imageCount = document.getElementById('image-count');
const uploadProgress = document.getElementById('upload-progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const startViewerBtn = document.getElementById('start-viewer-btn');

const viewer = document.getElementById('viewer');
const currentImage = document.getElementById('current-image');
const counter = document.getElementById('counter');
const deleteBtn = document.getElementById('delete-btn');
const backBtn = document.getElementById('back-btn');
const nextBtn = document.getElementById('next-btn');
const viewerExitBtn = document.getElementById('viewer-exit-btn');

const loading = document.getElementById('loading');
const deleteModal = document.getElementById('delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete');
const cancelDeleteBtn = document.getElementById('cancel-delete');

const gallery = document.getElementById('gallery');
const galleryGrid = document.getElementById('gallery-grid');
const manageBtn = document.getElementById('manage-btn');
const selectAllBtn = document.getElementById('select-all-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');

// State
let currentUser = null;
let images = [];
let shuffledImages = [];
let currentIndex = 0;
let selectedImages = new Set();

// Zoom state
let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

// Touch swipe state (iOS)
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let isSwiping = false;

// Theme state
let isDarkMode = false;

// ==================== API HELPER ====================

async function getAuthToken() {
  const session = window.Clerk.session;
  if (!session) return null;
  return session.getToken();
}

async function apiFetch(path, options = {}) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }

  return res.json();
}

// ==================== THEME ====================

function toggleTheme() {
  isDarkMode = !isDarkMode;
  document.body.classList.toggle('dark', isDarkMode);
  sunIcon.classList.toggle('hidden', isDarkMode);
  moonIcon.classList.toggle('hidden', !isDarkMode);
  localStorage.setItem('picmachine-theme', isDarkMode ? 'dark' : 'light');
}

function initTheme() {
  const savedTheme = localStorage.getItem('picmachine-theme');
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    isDarkMode = true;
    document.body.classList.add('dark');
    sunIcon.classList.add('hidden');
    moonIcon.classList.remove('hidden');
  }
}

// ==================== AUTH (CLERK) ====================

async function initClerk() {
  // Wait for Clerk to be ready
  await window.Clerk.load();

  if (window.Clerk.user) {
    // Already signed in
    currentUser = window.Clerk.user;
    showDashboard();
  } else {
    // Mount Clerk sign-in UI
    window.Clerk.mountSignIn(document.getElementById('clerk-auth'), {
      appearance: {
        variables: {
          colorPrimary: isDarkMode ? '#fafafa' : '#0a0a0a',
          colorBackground: isDarkMode ? '#18181b' : '#ffffff',
          colorText: isDarkMode ? '#fafafa' : '#0a0a0a',
          colorInputBackground: isDarkMode ? '#09090b' : '#fafafa',
          colorInputText: isDarkMode ? '#fafafa' : '#0a0a0a',
          borderRadius: '10px',
        },
      },
    });
  }

  // Listen for auth state changes
  window.Clerk.addListener(({ user }) => {
    if (user) {
      currentUser = user;
      // Unmount sign-in if mounted
      window.Clerk.unmountSignIn(document.getElementById('clerk-auth'));
      showDashboard();
    } else {
      currentUser = null;
      images = [];
      shuffledImages = [];
      authScreen.classList.remove('hidden');
      dashboard.classList.add('hidden');
      viewer.classList.add('hidden');
      gallery.classList.add('hidden');
      // Re-mount sign-in
      window.Clerk.mountSignIn(document.getElementById('clerk-auth'));
    }
  });
}

async function handleLogout() {
  await window.Clerk.signOut();
}

// ==================== DASHBOARD ====================

async function showDashboard() {
  authScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  await loadUserImages();
}

async function loadUserImages() {
  if (!currentUser) return;

  showLoading();

  try {
    const data = await apiFetch('/api/images');

    images = data.images.map(img => ({
      name: img.name,
      key: img.key,
      url: img.url,
    }));

    imageCount.textContent = data.count;
    startViewerBtn.disabled = images.length === 0;
  } catch (err) {
    console.error('Error loading images:', err);
    imageCount.textContent = '!';
  }

  hideLoading();
}

function updateImageCount() {
  imageCount.textContent = images.length;
  startViewerBtn.disabled = images.length === 0;
}

// ==================== UPLOAD ====================

async function handleUpload(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  uploadProgress.classList.remove('hidden');
  progressFill.style.width = '0%';

  let uploaded = 0;
  const total = files.length;

  for (const file of files) {
    // Check if it's an image
    if (!file.type.startsWith('image/')) continue;

    try {
      // 1. Get presigned upload URL from our API
      const { uploadUrl } = await apiFetch('/api/images', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      // 2. Upload directly to R2 via presigned URL
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (uploadRes.ok) {
        uploaded++;
      } else {
        console.error('Upload to R2 failed:', uploadRes.status);
      }
    } catch (err) {
      console.error('Upload error:', err);
    }

    // Update progress
    const percent = Math.round((uploaded / total) * 100);
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `Uploaded ${uploaded} of ${total}`;
  }

  // Reset and reload
  setTimeout(() => {
    uploadProgress.classList.add('hidden');
    fileInput.value = '';
    loadUserImages();
  }, 500);
}

// ==================== VIEWER ====================

function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function startViewer() {
  if (images.length === 0) return;

  shuffledImages = shuffle(images);
  currentIndex = 0;

  dashboard.classList.add('hidden');
  viewer.classList.remove('hidden');

  displayImage();
}

function displayImage() {
  if (shuffledImages.length === 0) {
    exitViewer();
    return;
  }

  const image = shuffledImages[currentIndex];
  resetZoom();

  showLoading();

  const img = new Image();
  img.onload = () => {
    currentImage.src = image.url;
    hideLoading();
    updateCounter();
  };
  img.onerror = () => {
    // Skip broken images
    nextImage();
  };
  img.src = image.url;
}

function updateCounter() {
  counter.textContent = `${currentIndex + 1} / ${shuffledImages.length}`;
}

function nextImage() {
  currentIndex++;

  if (currentIndex >= shuffledImages.length) {
    shuffledImages = shuffle(images);
    currentIndex = 0;
  }

  displayImage();
}

function prevImage() {
  currentIndex--;

  if (currentIndex < 0) {
    currentIndex = shuffledImages.length - 1;
  }

  displayImage();
}

function exitViewer() {
  viewer.classList.add('hidden');
  dashboard.classList.remove('hidden');
  resetZoom();
}

// ==================== ZOOM & PAN ====================

function resetZoom() {
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  applyTransform();
}

function applyTransform() {
  currentImage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  currentImage.style.cursor = zoomLevel > 1 ? 'grab' : 'pointer';
}

viewer.addEventListener('wheel', (e) => {
  e.preventDefault();

  const zoomSpeed = 0.1;

  if (e.deltaY < 0) {
    zoomLevel = Math.min(zoomLevel + zoomSpeed, 5);
  } else {
    zoomLevel = Math.max(zoomLevel - zoomSpeed, 1);
  }

  if (zoomLevel === 1) {
    panX = 0;
    panY = 0;
  }

  applyTransform();
}, { passive: false });

currentImage.addEventListener('mousedown', (e) => {
  if (zoomLevel > 1) {
    isDragging = true;
    dragStartX = e.clientX - panX;
    dragStartY = e.clientY - panY;
    currentImage.style.cursor = 'grabbing';
  }
});

document.addEventListener('mousemove', (e) => {
  if (isDragging && zoomLevel > 1) {
    panX = e.clientX - dragStartX;
    panY = e.clientY - dragStartY;
    applyTransform();
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    currentImage.style.cursor = zoomLevel > 1 ? 'grab' : 'pointer';
  }
});

currentImage.addEventListener('dblclick', (e) => {
  e.stopPropagation();
  if (zoomLevel > 1) {
    resetZoom();
  } else {
    zoomLevel = 2;
    applyTransform();
  }
});

// Click on image to go to next (only if not zoomed)
viewer.addEventListener('click', (e) => {
  if (e.target === currentImage && zoomLevel === 1 && !isDragging && !isSwiping) {
    nextImage();
  }
});

// ==================== TOUCH SWIPE (iOS) ====================

viewer.addEventListener('touchstart', (e) => {
  if (zoomLevel > 1) return;
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
  isSwiping = false;
}, { passive: true });

viewer.addEventListener('touchmove', (e) => {
  if (zoomLevel > 1) return;
  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;
}, { passive: true });

viewer.addEventListener('touchend', (e) => {
  if (zoomLevel > 1) return;
  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;
  const deltaX = touchEndX - touchStartX;
  const deltaY = touchEndY - touchStartY;
  const minSwipeDistance = 50;
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
    isSwiping = true;
    if (deltaX > 0) {
      prevImage();
    } else {
      nextImage();
    }
  }
  setTimeout(() => { isSwiping = false; }, 100);
}, { passive: true });

// ==================== DELETE ====================

function showDeleteModal() {
  deleteModal.classList.remove('hidden');
}

function hideDeleteModal() {
  deleteModal.classList.add('hidden');
}

async function deleteCurrentImage() {
  const image = shuffledImages[currentIndex];

  hideDeleteModal();
  showLoading();

  try {
    await apiFetch(`/api/images/${encodeURIComponent(image.key)}`, {
      method: 'DELETE',
    });

    // Remove from arrays
    images = images.filter(img => img.key !== image.key);
    shuffledImages = shuffledImages.filter(img => img.key !== image.key);

    // Adjust index if needed
    if (currentIndex >= shuffledImages.length) {
      currentIndex = 0;
    }

    hideLoading();

    if (shuffledImages.length === 0) {
      exitViewer();
      loadUserImages();
    } else {
      displayImage();
    }
  } catch (err) {
    console.error('Delete error:', err);
    hideLoading();
  }
}

// ==================== GALLERY (MASS DELETE) ====================

function showGallery() {
  dashboard.classList.add('hidden');
  gallery.classList.remove('hidden');
  selectedImages.clear();
  renderGallery();
  updateDeleteButton();
}

function hideGallery() {
  gallery.classList.add('hidden');
  dashboard.classList.remove('hidden');
  selectedImages.clear();
}

function renderGallery() {
  galleryGrid.innerHTML = '';

  images.forEach((image) => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.dataset.key = image.key;

    const img = document.createElement('img');
    img.src = image.url;
    img.alt = image.name;
    img.loading = 'lazy';

    const checkbox = document.createElement('div');
    checkbox.className = 'checkbox';

    item.appendChild(img);
    item.appendChild(checkbox);

    item.addEventListener('click', () => toggleSelection(image.key, item));

    galleryGrid.appendChild(item);
  });
}

function toggleSelection(key, element) {
  if (selectedImages.has(key)) {
    selectedImages.delete(key);
    element.classList.remove('selected');
  } else {
    selectedImages.add(key);
    element.classList.add('selected');
  }
  updateDeleteButton();
}

function selectAll() {
  images.forEach(image => selectedImages.add(image.key));
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.classList.add('selected');
  });
  updateDeleteButton();
}

function deselectAll() {
  selectedImages.clear();
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.classList.remove('selected');
  });
  updateDeleteButton();
}

function updateDeleteButton() {
  const count = selectedImages.size;
  deleteSelectedBtn.textContent = `Delete Selected (${count})`;
  deleteSelectedBtn.disabled = count === 0;
}

async function deleteSelectedImages() {
  if (selectedImages.size === 0) return;

  const count = selectedImages.size;
  if (!confirm(`Delete ${count} image${count > 1 ? 's' : ''}? This cannot be undone.`)) {
    return;
  }

  showLoading();

  try {
    const keysToDelete = Array.from(selectedImages);

    await apiFetch(`/api/images?keys=${encodeURIComponent(keysToDelete.join(','))}`, {
      method: 'DELETE',
    });

    // Remove from local arrays
    images = images.filter(img => !selectedImages.has(img.key));
    shuffledImages = shuffledImages.filter(img => !selectedImages.has(img.key));

    selectedImages.clear();

    hideLoading();

    if (images.length === 0) {
      hideGallery();
      updateImageCount();
    } else {
      renderGallery();
      updateDeleteButton();
      updateImageCount();
    }
  } catch (err) {
    console.error('Delete error:', err);
    hideLoading();
    alert('Error deleting some images. Please try again.');
  }
}

// ==================== FULLSCREEN ====================

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log('Fullscreen error:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

function updateFullscreenIcon() {
  const isFullscreen = !!document.fullscreenElement;
  expandIcon.classList.toggle('hidden', isFullscreen);
  shrinkIcon.classList.toggle('hidden', !isFullscreen);
}

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', updateFullscreenIcon);

// ==================== LOADING ====================

function showLoading() {
  loading.classList.remove('hidden');
}

function hideLoading() {
  loading.classList.add('hidden');
}

// ==================== EVENT LISTENERS ====================

// Auth
logoutBtn.addEventListener('click', handleLogout);

// Upload
fileInput.addEventListener('change', handleUpload);

// Gallery
manageBtn.addEventListener('click', showGallery);
backToDashboardBtn.addEventListener('click', hideGallery);
selectAllBtn.addEventListener('click', selectAll);
deselectAllBtn.addEventListener('click', deselectAll);
deleteSelectedBtn.addEventListener('click', deleteSelectedImages);

// Viewer
startViewerBtn.addEventListener('click', startViewer);
viewerExitBtn.addEventListener('click', exitViewer);
backBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  prevImage();
});
nextBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  nextImage();
});

// Delete
deleteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showDeleteModal();
});
confirmDeleteBtn.addEventListener('click', deleteCurrentImage);
cancelDeleteBtn.addEventListener('click', hideDeleteModal);

// Keyboard
document.addEventListener('keydown', (e) => {
  // Handle delete modal
  if (!deleteModal.classList.contains('hidden')) {
    if (e.key === 'Enter') {
      deleteCurrentImage();
    } else if (e.key === 'Escape') {
      hideDeleteModal();
    }
    return;
  }

  // Viewer controls
  if (!viewer.classList.contains('hidden')) {
    switch (e.key) {
      case 'Escape':
        exitViewer();
        break;
      case ' ':
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        nextImage();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        prevImage();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      case 'd':
      case 'D':
      case 'Delete':
        showDeleteModal();
        break;
    }
  }
});

// Theme
themeToggle.addEventListener('click', toggleTheme);

// Fullscreen
fullscreenToggle.addEventListener('click', toggleFullscreen);

// Init
initTheme();
initClerk();
