const MODRINTH_API = "https://api.modrinth.com/v2";
const mcVersionSelect = document.getElementById('mcVersion');
const modLoaderSelect = document.getElementById('modLoader');
const modListDiv = document.getElementById('modList');
const downloadBtn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('status');
const searchBox = document.getElementById('searchBox');
const filterForm = document.getElementById('filterForm');
const showModsBtn = document.getElementById('showModsBtn');
const categorySelect = document.getElementById('category');
const sortOrderSelect = document.getElementById('sortOrder');
const resultsCountSpan = document.getElementById('resultsCount');
const memoryUsageSpan = document.getElementById('memoryUsage');
const clearMemoryBtn = document.getElementById('clearMemoryBtn');
const selectedCountSpan = document.getElementById('selectedCount');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const selectAllBtn = document.getElementById('selectAllBtn');

// View mode buttons
const viewListBtn = document.getElementById('viewList');
const viewGridBtn = document.getElementById('viewGrid');
const viewCompactListBtn = document.getElementById('viewCompactList');
const viewCompactGridBtn = document.getElementById('viewCompactGrid');

let allMods = [];
let shownMods = [];
let selectedMods = new Set();
let categories = [];
let currentViewMode = 'list-view';
let fetchController = null;

// Memory usage monitoring
const monitorMemory = () => {
  if (!performance.memory) return;
  
  const usedHeapSize = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
  const totalHeapSize = Math.round(performance.memory.totalJSHeapSize / (1024 * 1024));
  memoryUsageSpan.textContent = `Memory: ${usedHeapSize}MB / ${totalHeapSize}MB`;
  
  // Warning if memory usage is high
  if (usedHeapSize > totalHeapSize * 0.8) {
    memoryUsageSpan.style.color = '#ff7c5c';
  } else {
    memoryUsageSpan.style.color = '';
  }
};

// Set interval to check memory usage
const memoryMonitorInterval = setInterval(monitorMemory, 2000);

// Clear memory function
const clearMemory = () => {
  if (!window.gc && !window.CollectGarbage) {
    statusDiv.textContent = "Manual garbage collection not available in this browser";
    return;
  }
  
  // Clear references that might hold memory
  const oldMods = allMods;
  allMods = [];
  shownMods = [];
  
  // Force garbage collection if available
  if (window.gc) window.gc();
  if (window.CollectGarbage) window.CollectGarbage();
  
  // Restore data
  allMods = oldMods;
  shownMods = allMods;
  
  statusDiv.textContent = "Memory cleared";
  monitorMemory();
  
  // Fade out status message after 2 seconds
  setTimeout(() => {
    statusDiv.textContent = "";
  }, 2000);
};

clearMemoryBtn.addEventListener('click', clearMemory);

// View mode switching
const setViewMode = (mode) => {
  currentViewMode = mode;
  modListDiv.className = `mod-list ${mode}`;
  
  // Update active state on buttons
  [viewListBtn, viewGridBtn, viewCompactListBtn, viewCompactGridBtn].forEach(btn => {
    btn.classList.remove('active');
  });
  
  switch(mode) {
    case 'list-view':
      viewListBtn.classList.add('active');
      break;
    case 'grid-view':
      viewGridBtn.classList.add('active');
      break;
    case 'compact-list-view':
      viewCompactListBtn.classList.add('active');
      break;
    case 'compact-grid-view':
      viewCompactGridBtn.classList.add('active');
      break;
  }
  
  // Re-render mods with the new view
  renderMods(shownMods);
  
  // Save preference to local storage
  localStorage.setItem('preferredViewMode', mode);
};

// Load preferred view mode from local storage
const loadPreferredViewMode = () => {
  const savedMode = localStorage.getItem('preferredViewMode');
  if (savedMode) {
    setViewMode(savedMode);
  }
};

viewListBtn.addEventListener('click', () => setViewMode('list-view'));
viewGridBtn.addEventListener('click', () => setViewMode('grid-view'));
viewCompactListBtn.addEventListener('click', () => setViewMode('compact-list-view'));
viewCompactGridBtn.addEventListener('click', () => setViewMode('compact-grid-view'));

async function fetchVersions() {
  statusDiv.textContent = "Loading Minecraft versions...";
  try {
    let resp = await fetch(`${MODRINTH_API}/tag/game_version`);
    let versions = await resp.json();
    let stable = versions.filter(v => !v.version.endsWith("-rc"))
      .map(v => v.version);
    stable = Array.from(new Set(stable));
    stable.sort((a,b) => b.localeCompare(a, undefined, {numeric:true, sensitivity:'base'}));
    mcVersionSelect.innerHTML = "";
    stable.forEach(v => {
      let opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      mcVersionSelect.appendChild(opt);
    });
    mcVersionSelect.value = stable.find(v => v === "1.20.1") || stable[0];
    statusDiv.textContent = "";
  } catch (e) {
    mcVersionSelect.innerHTML = "<option value='1.20.1'>1.20.1</option><option value='1.18.2'>1.18.2</option>";
    statusDiv.textContent = "Failed to load versions.";
  }
}

async function fetchCategories() {
  try {
    let resp = await fetch(`${MODRINTH_API}/tag/category`);
    let cats = await resp.json();
    categories = cats.filter(cat =>
      ['technology','magic','storage','food','economy','adventure','equipment','library','misc','optimization','social','utility','worldgen'].includes(cat.name) ||
      cat.project_type === 'mod'
    );
    // Sort categories alphabetically
    categories.sort((a, b) => a.name.localeCompare(b.name));
    
    // Populate category dropdown
    categorySelect.innerHTML = "<option value=''>All Categories</option>";
    categories.forEach(cat => {
      let opt = document.createElement("option");
      opt.value = cat.name;
      opt.textContent = cat.name.charAt(0).toUpperCase() + cat.name.slice(1);
      categorySelect.appendChild(opt);
    });
  } catch (e) {
    categorySelect.innerHTML = "<option value=''>All Categories</option>";
    console.error("Failed to fetch categories:", e);
  }
}

async function fetchMods(version, loader, query = "", category = "", sortOrder = "relevance") {
  // If there's an ongoing fetch, abort it
  if (fetchController) {
    fetchController.abort();
  }
  
  // Create a new AbortController
  fetchController = new AbortController();
  const signal = fetchController.signal;
  
  showLoadingSpinner();
  statusDiv.textContent = "Loading mods...";
  
  let mods = [];
  let limit = 100;
  let offset = 0;
  let sort_param = sortOrder;
  let facetsArr = [
    ["project_type:mod"],
    [`versions:${version}`],
    [`categories:${loader}`],
  ];
  
  if (category) facetsArr.push([`categories:${category}`]);
  let facets = encodeURIComponent(JSON.stringify(facetsArr));
  
  try {
    while (true) {
      let url = `${MODRINTH_API}/search?limit=${limit}&offset=${offset}&facets=${facets}&index=${sort_param}`;
      if (query) url += `&query=${encodeURIComponent(query)}`;
      
      let resp = await fetch(url, { signal });
      let json = await resp.json();
      mods = mods.concat(json.hits);
      
      // Update status to show progress
      statusDiv.textContent = `Loading mods... (${mods.length})`;
      
      if (json.hits.length < limit) break;
      offset += limit;
      
      // Limit to 300 mods to prevent excessive memory usage
      if (mods.length >= 300) {
        statusDiv.textContent = "Limited to 300 mods to prevent memory issues. Use more specific filters if needed.";
        break;
      }
    }
    
    hideLoadingSpinner();
    return mods;
  } catch (e) {
    hideLoadingSpinner();
    if (e.name === 'AbortError') {
      statusDiv.textContent = "Search cancelled";
    } else {
      statusDiv.textContent = "Failed to fetch mods: " + e;
    }
    return [];
  }
}

function showLoadingSpinner() {
  // Clear mod list
  modListDiv.innerHTML = "";
  
  // Create and add the spinner
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  modListDiv.appendChild(spinner);
}

function hideLoadingSpinner() {
  // Remove the spinner if it exists
  const spinner = modListDiv.querySelector('.loading-spinner');
  if (spinner) {
    spinner.remove();
  }
}

function renderMods(mods) {
  modListDiv.innerHTML = "";
  
  if (!mods.length) {
    modListDiv.innerHTML = "<p style='text-align:center; padding: 20px; color:var(--text-muted);'>No mods found for this version/loader/category.</p>";
    downloadBtn.disabled = true;
    return;
  }
  
  mods.forEach((mod, idx) => {
    const div = document.createElement("div");
    div.className = "mod-item";
    div.style.animationDelay = (idx * 0.04) + "s";
    
    // Checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "mod-checkbox";
    checkbox.value = mod.slug;
    checkbox.checked = selectedMods.has(mod.slug);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedMods.add(mod.slug);
      } else {
        selectedMods.delete(mod.slug);
      }
      updateSelectionUI();
    });
    div.appendChild(checkbox);

    // Don't add images for compact views
    if (!currentViewMode.includes('compact')) {
      // Mod icon
      const thumb = document.createElement("img");
      thumb.className = "mod-thumb";
      thumb.src = mod.icon_url || "https://i.imgur.com/OnjVZqV.png";
      thumb.alt = mod.title;
      thumb.loading = "lazy"; // Lazy load images
      div.appendChild(thumb);
    }

    // Info
    const infoDiv = document.createElement("div");
    infoDiv.className = "mod-info";

    const title = document.createElement("div");
    title.className = "mod-title";
    title.textContent = mod.title;
    infoDiv.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "mod-desc";
    desc.textContent = mod.description || "";
    infoDiv.appendChild(desc);

    const meta = document.createElement("div");
    meta.className = "mod-meta";
    
    // Slug
    const slug = document.createElement("span");
    slug.className = "mod-slug";
    slug.textContent = mod.slug;
    meta.appendChild(slug);
    
    // Downloads
    const downloads = document.createElement("span");
    downloads.className = "mod-downloads";
    if (mod.downloads) {
      const downloadIcon = document.createElement("i");
      downloadIcon.className = "fas fa-download";
      downloads.appendChild(downloadIcon);
      
      const downloadText = document.createElement("span");
      downloadText.textContent = formatNumber(mod.downloads);
      downloads.appendChild(downloadText);
    }
    meta.appendChild(downloads);
    
    // Categories
    if (mod.categories && mod.categories.length) {
      // Find a category that matches our known categories
      const matchedCategories = mod.categories.filter(c => 
        categories.some(cat => cat.name === c)
      );
      
      // Display up to 2 categories
      matchedCategories.slice(0, 2).forEach(catName => {
        const catSpan = document.createElement("span");
        catSpan.className = "mod-category";
        catSpan.textContent = catName.charAt(0).toUpperCase() + catName.slice(1);
        meta.appendChild(catSpan);
      });
    }
    
    infoDiv.appendChild(meta);
    div.appendChild(infoDiv);
    modListDiv.appendChild(div);
  });
  
  // Update results count
  resultsCountSpan.textContent = `${mods.length} mods found`;
}

// Format large numbers with K, M suffix
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function updateSelectionUI() {
  const count = selectedMods.size;
  downloadBtn.disabled = count === 0;
  clearSelectionBtn.disabled = count === 0;
  selectedCountSpan.textContent = `${count} ${count === 1 ? 'mod' : 'mods'} selected`;
}

function filterMods() {
  const q = searchBox.value.trim().toLowerCase();
  if (!q) {
    shownMods = allMods;
  } else {
    shownMods = allMods.filter(mod =>
      mod.title.toLowerCase().includes(q) ||
      mod.slug.toLowerCase().includes(q) ||
      (mod.description || "").toLowerCase().includes(q)
    );
  }
  renderMods(shownMods);
  resultsCountSpan.textContent = `${shownMods.length} mods found`;
}

async function reloadMods() {
  selectedMods.clear();
  updateSelectionUI();
  
  const version = mcVersionSelect.value;
  const loader = modLoaderSelect.value;
  const category = categorySelect.value;
  const sortOrder = sortOrderSelect.value;
  const search = searchBox.value.trim();
  
  allMods = await fetchMods(version, loader, search, category, sortOrder);
  shownMods = allMods;
  renderMods(shownMods);
  
  statusDiv.textContent = allMods.length > 0 ? 
    `Loaded ${allMods.length} mods successfully.` : 
    "No mods found with the current filters.";
  
  // Clear status after 3 seconds
  setTimeout(() => {
    if (statusDiv.textContent.includes("Loaded") || statusDiv.textContent.includes("No mods found")) {
      statusDiv.textContent = "";
    }
  }, 3000);
  
  // Check memory usage after loading
  monitorMemory();
}

// Clear selection functionality
clearSelectionBtn.addEventListener('click', () => {
  selectedMods.clear();
  const checkboxes = document.querySelectorAll('.mod-checkbox');
  checkboxes.forEach(cb => cb.checked = false);
  updateSelectionUI();
});

// Select all functionality
selectAllBtn.addEventListener('click', () => {
  if (selectedMods.size === shownMods.length) {
    // If all are selected, deselect all
    selectedMods.clear();
    const checkboxes = document.querySelectorAll('.mod-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
  } else {
    // Otherwise select all
    shownMods.forEach(mod => selectedMods.add(mod.slug));
    const checkboxes = document.querySelectorAll('.mod-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
  }
  updateSelectionUI();
});

filterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await reloadMods();
});

searchBox.addEventListener('input', debounce(filterMods, 300));
categorySelect.addEventListener('change', reloadMods);
sortOrderSelect.addEventListener('change', reloadMods);
mcVersionSelect.addEventListener('change', reloadMods);
modLoaderSelect.addEventListener('change', reloadMods);

// Debounce function to prevent too many filter calls
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

downloadBtn.addEventListener('click', async () => {
  if (!selectedMods.size) return;
  
  const modsToDownload = shownMods.filter(m => selectedMods.has(m.slug));
  const version = mcVersionSelect.value;
  const loader = modLoaderSelect.value;
  
  statusDiv.textContent = "Fetching mod files...";
  
  // Create download progress element
  const progressDiv = document.createElement('div');
  progressDiv.className = 'download-progress';
  progressDiv.style.marginTop = '10px';
  statusDiv.appendChild(progressDiv);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < modsToDownload.length; i++) {
    const mod = modsToDownload[i];
    progressDiv.textContent = `Downloading ${mod.title} (${i+1}/${modsToDownload.length})...`;
    
    try {
      const vurl = `${MODRINTH_API}/project/${mod.slug}/version?game_versions=["${version}"]&loaders=["${loader}"]`;
      const vresp = await fetch(vurl);
      const versions = await vresp.json();
      
      if (!versions.length) {
        progressDiv.textContent += `\nNo compatible version for ${mod.title}.`;
        errorCount++;
        continue;
      }
      
      // Find the primary file (usually the jar)
      const file = versions[0].files.find(f => f.primary) || 
                   versions[0].files.find(f => f.filename.endsWith(".jar"));
      
      if (!file) {
        progressDiv.textContent += `\nNo jar file for ${mod.title}.`;
        errorCount++;
        continue;
      }
      
      // Download file
      const a = document.createElement("a");
      a.href = file.url;
      a.download = file.filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Animate download button
      downloadBtn.style.background = "linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%)";
      downloadBtn.style.color = "var(--bg-main)";
      setTimeout(() => {
        downloadBtn.style.background = "";
        downloadBtn.style.color = "";
      }, 300);
      
      successCount++;
    } catch (e) {
      progressDiv.textContent += `\nError downloading ${mod.title}: ${e}`;
      errorCount++;
    }
    
    // Add a small delay between downloads to prevent browser throttling
    await new Promise(r => setTimeout(r, 300));
  }
  
  statusDiv.textContent = `Download complete: ${successCount} successful, ${errorCount} failed`;
  if (errorCount === 0) {
    statusDiv.textContent += ". Check your downloads folder!";
  }
  
  // Clear status after 10 seconds
  setTimeout(() => {
    if (statusDiv.textContent.includes("Download complete")) {
      statusDiv.textContent = "";
    }
  }, 10000);
});

window.addEventListener("DOMContentLoaded", async () => {
  await fetchVersions();
  await fetchCategories();
  loadPreferredViewMode();
  await reloadMods();
  
  // Start memory monitoring
  monitorMemory();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  clearInterval(memoryMonitorInterval);
  if (fetchController) {
    fetchController.abort();
  }
});