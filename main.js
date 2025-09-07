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

let allMods = [];
let shownMods = [];
let selectedMods = new Set();
let categories = [];

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
    // Populate category dropdown
    categorySelect.innerHTML = "<option value=''>All</option>";
    categories.forEach(cat => {
      let opt = document.createElement("option");
      opt.value = cat.name;
      opt.textContent = cat.name.charAt(0).toUpperCase() + cat.name.slice(1);
      categorySelect.appendChild(opt);
    });
  } catch (e) {
    categorySelect.innerHTML = "<option value=''>All</option>";
  }
}

async function fetchMods(version, loader, query = "", category = "", sortOrder = "relevance") {
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
      let resp = await fetch(url);
      let json = await resp.json();
      mods = mods.concat(json.hits);
      if (json.hits.length < limit) break;
      offset += limit;
    }
    return mods;
  } catch (e) {
    statusDiv.textContent = "Failed to fetch mods: " + e;
    return [];
  }
}

function renderMods(mods) {
  modListDiv.innerHTML = "";
  if (!mods.length) {
    modListDiv.innerHTML = "<p>No mods found for this version/loader/category.</p>";
    downloadBtn.disabled = true;
    return;
  }
  mods.forEach((mod, idx) => {
    let div = document.createElement("div");
    div.className = "mod-item";
    div.style.animationDelay = (idx * 0.04) + "s";
    // Checkbox
    let checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "mod-checkbox";
    checkbox.value = mod.slug;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedMods.add(mod.slug);
      else selectedMods.delete(mod.slug);
      downloadBtn.disabled = selectedMods.size === 0;
    });
    div.appendChild(checkbox);

    // Mod icon
    let thumb = document.createElement("img");
    thumb.className = "mod-thumb";
    thumb.src = mod.icon_url || "https://i.imgur.com/OnjVZqV.png";
    thumb.alt = mod.title;
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
    downloads.textContent = mod.downloads ? `⬇ ${mod.downloads.toLocaleString()}` : '';
    meta.appendChild(downloads);
    // Category
    if (mod.categories && mod.categories.length) {
      let catName = mod.categories.find(c =>
        categories.find(cat => cat.name === c)
      );
      if (catName) {
        let catSpan = document.createElement("span");
        catSpan.className = "mod-category";
        catSpan.textContent = catName.charAt(0).toUpperCase() + catName.slice(1);
        meta.appendChild(catSpan);
      }
    }
    infoDiv.appendChild(meta);

    div.appendChild(infoDiv);
    modListDiv.appendChild(div);
  });
}

function filterMods() {
  let q = searchBox.value.trim().toLowerCase();
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
}

async function reloadMods() {
  selectedMods.clear();
  downloadBtn.disabled = true;
  let version = mcVersionSelect.value;
  let loader = modLoaderSelect.value;
  let category = categorySelect.value;
  let sortOrder = sortOrderSelect.value;
  let search = searchBox.value.trim();
  allMods = await fetchMods(version, loader, search, category, sortOrder);
  shownMods = allMods;
  renderMods(shownMods);
  statusDiv.textContent = `Loaded ${allMods.length} mods.`;
}

filterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await reloadMods();
});

searchBox.addEventListener('input', filterMods);
categorySelect.addEventListener('change', reloadMods);
sortOrderSelect.addEventListener('change', reloadMods);
mcVersionSelect.addEventListener('change', reloadMods);
modLoaderSelect.addEventListener('change', reloadMods);

downloadBtn.addEventListener('click', async () => {
  if (!selectedMods.size) return;
  let modsToDownload = shownMods.filter(m => selectedMods.has(m.slug));
  let version = mcVersionSelect.value;
  let loader = modLoaderSelect.value;
  statusDiv.textContent = "Fetching mod files...";
  for (let i = 0; i < modsToDownload.length; i++) {
    let mod = modsToDownload[i];
    statusDiv.textContent = `Downloading ${mod.title} (${i+1}/${modsToDownload.length})...`;
    try {
      let vurl = `${MODRINTH_API}/project/${mod.slug}/version?game_versions=["${version}"]&loaders=["${loader}"]`;
      let vresp = await fetch(vurl);
      let versions = await vresp.json();
      if (!versions.length) {
        statusDiv.textContent += `\nNo compatible version for ${mod.title}.`;
        continue;
      }
      let file = versions[0].files.find(f => f.filename.endsWith(".jar"));
      if (!file) {
        statusDiv.textContent += `\nNo jar file for ${mod.title}.`;
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
      // Animate downloadBtn
      downloadBtn.style.background = "linear-gradient(90deg,#3f4fff 0%, #64e7c6 100%)";
      downloadBtn.style.color = "#fff";
      setTimeout(() => {
        downloadBtn.style.background = "linear-gradient(90deg,#64e7c6 0%, #3f4fff 100%)";
        downloadBtn.style.color = "#21242b";
      }, 300);
    } catch (e) {
      statusDiv.textContent += `\nError downloading ${mod.title}: ${e}`;
    }
  }
  statusDiv.textContent = "All done! Check your downloads folder.";
});

window.addEventListener("DOMContentLoaded", async () => {
  await fetchVersions();
  await fetchCategories();
  await reloadMods();
});