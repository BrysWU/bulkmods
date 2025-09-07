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
const resultsCount = document.getElementById('resultsCount');
const selectionInfo = document.getElementById('selectionInfo');
const selectAllBtn = document.getElementById('selectAllBtn');

let allMods = [];
let shownMods = [];
let selectedMods = new Set();
let categories = [];
let isLoading = false;

// Handle select all button
selectAllBtn.addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('.mod-checkbox');
  
  if (selectedMods.size === shownMods.length) {
    // Deselect all
    selectedMods.clear();
    checkboxes.forEach(cb => cb.checked = false);
    selectAllBtn.textContent = "Select All";
  } else {
    // Select all
    shownMods.forEach(mod => selectedMods.add(mod.slug));
    checkboxes.forEach(cb => cb.checked = true);
    selectAllBtn.textContent = "Deselect All";
  }
  
  updateSelectedCount();
  downloadBtn.disabled = selectedMods.size === 0;
});

function updateSelectedCount() {
  if (selectedMods.size > 0) {
    selectionInfo.textContent = `${selectedMods.size} mods selected`;
    selectionInfo.style.display = 'block';
  } else {
    selectionInfo.style.display = 'none';
  }
  
  if (selectedMods.size === shownMods.length && shownMods.length > 0) {
    selectAllBtn.textContent = "Deselect All";
  } else {
    selectAllBtn.textContent = "Select All";
  }
}

async function fetchVersions() {
  setLoading(true);
  statusDiv.innerHTML = "<div class='status-message loading'>Loading Minecraft versions...</div>";
  try {
    let resp = await fetch(`${MODRINTH_API}/tag/game_version`);
    let versions = await resp.json();
    let stable = versions.filter(v => !v.version.endsWith("-rc") && !v.version.includes("w") && !v.version.includes("pre"))
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
    clearStatus();
  } catch (e) {
    mcVersionSelect.innerHTML = "<option value='1.20.1'>1.20.1</option><option value='1.18.2'>1.18.2</option>";
    showError("Failed to load versions.");
  } finally {
    setLoading(false);
  }
}

async function fetchCategories() {
  try {
    let resp = await fetch(`${MODRINTH_API}/tag/category`);
    let cats = await resp.json();
    categories = cats.filter(cat =>
      ['technology', 'magic', 'storage', 'food', 'economy', 'adventure', 
       'equipment', 'library', 'misc', 'optimization', 'social', 'utility', 
       'worldgen', 'decoration', 'cursed', 'fabric', 'forge', 'quilt'].includes(cat.name) ||
      cat.project_type === 'mod'
    );
    
    // Sort categories alphabetically
    categories.sort((a, b) => a.name.localeCompare(b.name));
    
    // Populate category dropdown
    categorySelect.innerHTML = "<option value=''>All Categories</option>";
    categories.forEach(cat => {
      let opt = document.createElement("option");
      opt.value = cat.name;
      opt.textContent = cat.display_name || (cat.name.charAt(0).toUpperCase() + cat.name.slice(1));
      categorySelect.appendChild(opt);
    });
  } catch (e) {
    categorySelect.innerHTML = "<option value=''>All Categories</option>";
    showError("Failed to load categories.");
  }
}

async function fetchMods(version, loader, query = "", category = "", sortOrder = "relevance") {
  setLoading(true);
  showModsBtn.disabled = true;
  statusDiv.innerHTML = "<div class='status-message loading'>Loading mods...</div>";
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
      
      let resp = await fetch(url);
      let json = await resp.json();
      mods = mods.concat(json.hits);
      
      if (json.hits.length < limit) break;
      offset += limit;
    }
    
    resultsCount.textContent = `Found ${mods.length} mods`;
    clearStatus();
    return mods;
  } catch (e) {
    showError(`Failed to fetch mods: ${e}`);
    return [];
  } finally {
    showModsBtn.disabled = false;
    setLoading(false);
  }
}

function renderMods(mods) {
  modListDiv.innerHTML = "";
  
  if (!mods.length) {
    modListDiv.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <h3>No mods found</h3>
        <p>Try adjusting your search filters or try a different Minecraft version</p>
      </div>
    `;
    downloadBtn.disabled = true;
    return;
  }
  
  mods.forEach((mod, idx) => {
    let div = document.createElement("div");
    div.className = "mod-item";
    div.style.animationDelay = (idx * 0.03) + "s";
    
    // Checkbox
    let checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "mod-checkbox";
    checkbox.checked = selectedMods.has(mod.slug);
    checkbox.value = mod.slug;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedMods.add(mod.slug);
      else selectedMods.delete(mod.slug);
      updateSelectedCount();
      downloadBtn.disabled = selectedMods.size === 0;
    });
    
    let checkboxWrapper = document.createElement("div");
    checkboxWrapper.className = "checkbox-wrapper";
    checkboxWrapper.appendChild(checkbox);
    div.appendChild(checkboxWrapper);

    // Mod icon
    let thumb = document.createElement("img");
    thumb.className = "mod-thumb";
    thumb.src = mod.icon_url || "https://i.imgur.com/OnjVZqV.png";
    thumb.alt = mod.title;
    thumb.addEventListener("error", () => {
      thumb.src = "https://i.imgur.com/OnjVZqV.png";
    });
    div.appendChild(thumb);

    // Info
    let infoDiv = document.createElement("div");
    infoDiv.className = "mod-info";

    let title = document.createElement("div");
    title.className = "mod-title";
    title.textContent = mod.title;
    infoDiv.appendChild(title);

    let desc = document.createElement("div");
    desc.className = "mod-desc";
    desc.textContent = mod.description || "";
    infoDiv.appendChild(desc);

    let meta = document.createElement("div");
    meta.className = "mod-meta";
    
    // Slug
    let slug = document.createElement("span");
    slug.className = "mod-slug";
    slug.textContent = mod.slug;
    meta.appendChild(slug);
    
    // Downloads
    let downloads = document.createElement("span");
    downloads.className = "mod-downloads";
    downloads.innerHTML = mod.downloads ? `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 15.575q-.2 0-.375-.063-.175-.062-.325-.212l-3.6-3.6q-.3-.3-.3-.7 0-.4.3-.7.3-.3.713-.3.412 0 .712.3l1.875 1.9V5q0-.425.288-.713Q11.575 4 12 4t.712.287Q13 4.575 13 5v7.2l1.875-1.9q.3-.3.713-.3.412 0 .712.3.3.3.3.7 0 .4-.3.7l-3.6 3.6q-.15.15-.325.212-.175.063-.375.063ZM6.15 20q-.775 0-1.337-.562-.563-.563-.563-1.338v-2.1h2V18q0 0 .15.15.15.15.15.15h12q0 0 .15-.15.15-.15.15-.15v-2h2v2.1q0 .775-.562 1.338Q17.725 20 16.95 20Z"/></svg> ${mod.downloads.toLocaleString()}` : '';
    meta.appendChild(downloads);
    
    // Updated date
    if (mod.date_modified) {
      let updated = document.createElement("span");
      updated.className = "mod-updated";
      let dateObj = new Date(mod.date_modified);
      updated.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 21q-3.75 0-6.375-2.625T3 12t2.625-6.375T12 3q3.75 0 6.375 2.625T21 12q0 3.75-2.625 6.375T12 21Zm0-2q2.9 0 4.95-2.05Q19 14.9 19 12t-2.05-4.95Q14.9 5 12 5 9.1 5 7.05 7.05 5 9.1 5 12t2.05 4.95Q9.1 19 12 19Zm.5-8h3q.425 0 .713-.288Q16.5 10.425 16.5 10t-.287-.713Q15.925 9 15.5 9h-2.5V6q0-.425-.288-.713Q12.425 5 12 5t-.712.287Q11 5.575 11 6v5q0 .425.288.713.287.287.712.287Z"/></svg> ${dateObj.toLocaleDateString()}`;
      meta.appendChild(updated);
    }
    
    // Categories
    if (mod.categories && mod.categories.length) {
      let catContainer = document.createElement("div");
      catContainer.className = "mod-categories";
      
      mod.categories.forEach(catName => {
        // Skip loader categories
        if(['fabric', 'forge', 'quilt'].includes(catName)) return;
        
        let catSpan = document.createElement("span");
        catSpan.className = "mod-category";
        catSpan.textContent = catName.charAt(0).toUpperCase() + catName.slice(1);
        catContainer.appendChild(catSpan);
      });
      
      infoDiv.appendChild(catContainer);
    }
    
    infoDiv.appendChild(meta);
    div.appendChild(infoDiv);
    
    // View on Modrinth button
    let linkBtn = document.createElement("a");
    linkBtn.className = "mod-link-btn";
    linkBtn.href = `https://modrinth.com/mod/${mod.slug}`;
    linkBtn.target = "_blank";
    linkBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18 19H6c-.55 0-1-.45-1-1V6c0-.55.45-1 1-1h5c.55 0 1-.45 1-1s-.45-1-1-1H5c-1.11 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6c0-.55-.45-1-1-1s-1 .45-1 1v5c0 .55-.45 1-1 1zM14 4c0 .55.45 1 1 1h2.59l-9.13 9.13c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0L19 6.41V9c0 .55.45 1 1 1s1-.45 1-1V4c0-.55-.45-1-1-1h-5c-.55 0-1 .45-1 1z"/></svg>`;
    div.appendChild(linkBtn);
    
    modListDiv.appendChild(div);
  });
  
  updateSelectedCount();
  downloadBtn.disabled = selectedMods.size === 0;
}

function filterMods() {
  let q = searchBox.value.trim().toLowerCase();
  if (!q) {
    shownMods = allMods;
  } else {
    shownMods = allMods.filter(mod =>
      mod.title.toLowerCase().includes(q) ||
      mod.slug.toLowerCase().includes(q) ||
      (mod.description || "").toLowerCase().includes(q) ||
      (mod.categories || []).some(cat => cat.toLowerCase().includes(q))
    );
  }
  renderMods(shownMods);
  resultsCount.textContent = `Found ${shownMods.length} mods`;
}

async function reloadMods() {
  selectedMods.clear();
  downloadBtn.disabled = true;
  selectionInfo.style.display = 'none';
  
  let version = mcVersionSelect.value;
  let loader = modLoaderSelect.value;
  let category = categorySelect.value;
  let sortOrder = sortOrderSelect.value;
  let search = searchBox.value.trim();
  
  modListDiv.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Loading mods...</p>
    </div>
  `;
  
  allMods = await fetchMods(version, loader, search, category, sortOrder);
  shownMods = allMods;
  renderMods(shownMods);
  
  // Show success message with count
  if (allMods.length > 0) {
    statusDiv.innerHTML = `<div class="status-message success">Successfully loaded ${allMods.length} mods</div>`;
    setTimeout(() => {
      clearStatus();
    }, 3000);
  }
}

function setLoading(loading) {
  isLoading = loading;
  document.body.classList.toggle('is-loading', loading);
}

function showError(message) {
  statusDiv.innerHTML = `<div class="status-message error">${message}</div>`;
}

function clearStatus() {
  statusDiv.innerHTML = "";
}

filterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isLoading) {
    await reloadMods();
  }
});

searchBox.addEventListener('input', filterMods);

// Add animation class on select change
[categorySelect, sortOrderSelect, mcVersionSelect, modLoaderSelect].forEach(select => {
  select.addEventListener('change', function() {
    this.classList.add('changed');
    setTimeout(() => {
      this.classList.remove('changed');
    }, 500);
  });
});

downloadBtn.addEventListener('click', async () => {
  if (!selectedMods.size) return;
  let modsToDownload = shownMods.filter(m => selectedMods.has(m.slug));
  let version = mcVersionSelect.value;
  let loader = modLoaderSelect.value;
  
  downloadBtn.disabled = true;
  statusDiv.innerHTML = `<div class="status-message loading">Preparing to download ${modsToDownload.length} mods...</div>`;
  
  // Create progress bar
  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress-container';
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  progressContainer.appendChild(progressBar);
  statusDiv.appendChild(progressContainer);
  
  let successful = 0;
  let failed = 0;
  
  for (let i = 0; i < modsToDownload.length; i++) {
    let mod = modsToDownload[i];
    
    // Update progress bar
    progressBar.style.width = `${Math.round((i / modsToDownload.length) * 100)}%`;
    statusDiv.querySelector('.status-message').textContent = `Downloading ${mod.title} (${i+1}/${modsToDownload.length})...`;
    
    try {
      let vurl = `${MODRINTH_API}/project/${mod.slug}/version?game_versions=["${version}"]&loaders=["${loader}"]`;
      let vresp = await fetch(vurl);
      let versions = await vresp.json();
      
      if (!versions.length) {
        failed++;
        const errorMsg = document.createElement('div');
        errorMsg.className = 'download-error';
        errorMsg.textContent = `${mod.title}: No compatible version found`;
        statusDiv.appendChild(errorMsg);
        continue;
      }
      
      let file = versions[0].files.find(f => f.filename.endsWith(".jar"));
      if (!file) {
        failed++;
        const errorMsg = document.createElement('div');
        errorMsg.className = 'download-error';
        errorMsg.textContent = `${mod.title}: No JAR file found`;
        statusDiv.appendChild(errorMsg);
        continue;
      }
      
      // Download file
      let a = document.createElement("a");
      a.href = file.url;
      a.download = file.filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Animate download button
      downloadBtn.classList.add('downloaded');
      setTimeout(() => {
        downloadBtn.classList.remove('downloaded');
      }, 500);
      
      successful++;
      
      // Small delay between downloads to prevent browser from blocking
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
      failed++;
      const errorMsg = document.createElement('div');
      errorMsg.className = 'download-error';
      errorMsg.textContent = `${mod.title}: ${e.message}`;
      statusDiv.appendChild(errorMsg);
    }
  }
  
  // Complete progress bar
  progressBar.style.width = '100%';
  progressBar.classList.add('complete');
  
  // Summary message
  const summary = document.createElement('div');
  summary.className = 'download-summary';
  summary.innerHTML = `
    <div class="summary-title">Download Complete</div>
    <div class="summary-stats">
      <div class="stat"><span class="stat-value">${successful}</span> mods downloaded successfully</div>
      ${failed > 0 ? `<div class="stat error"><span class="stat-value">${failed}</span> mods failed</div>` : ''}
    </div>
    <div class="summary-message">Files have been saved to your downloads folder</div>
  `;
  statusDiv.innerHTML = '';
  statusDiv.appendChild(summary);
  
  downloadBtn.disabled = false;
});

window.addEventListener("DOMContentLoaded", async () => {
  setLoading(true);
  await fetchVersions();
  await fetchCategories();
  await reloadMods();
  setLoading(false);
});