const MODRINTH_API = "https://api.modrinth.com/v2";
const mcVersionSelect = document.getElementById('mcVersion');
const modLoaderSelect = document.getElementById('modLoader');
const modListDiv = document.getElementById('modList');
const downloadBtn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('status');
const searchBox = document.getElementById('searchBox');
const filterForm = document.getElementById('filterForm');

let allMods = [];
let shownMods = [];
let selectedMods = new Set();

async function fetchVersions() {
  statusDiv.textContent = "Loading Minecraft versions...";
  try {
    let resp = await fetch(`${MODRINTH_API}/tag/game_version`);
    let versions = await resp.json();
    let stable = versions.filter(v => !v.version.endsWith("-rc"))
      .map(v => v.version);
    stable = Array.from(new Set(stable)); // unique
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

async function fetchMods(version, loader) {
  statusDiv.textContent = "Loading mods...";
  let mods = [];
  let limit = 100;
  let offset = 0;
  try {
    while (true) {
      let facet = encodeURIComponent(`[["project_type:mod"],["versions:${version}"],["categories:${loader}"]]`);
      let url = `${MODRINTH_API}/search?limit=${limit}&offset=${offset}&facets=${facet}`;
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
    modListDiv.innerHTML = "<p>No mods found for this version/loader.</p>";
    downloadBtn.disabled = true;
    return;
  }
  mods.forEach(mod => {
    let div = document.createElement("div");
    div.className = "mod-item";
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

    let infoDiv = document.createElement("div");
    let title = document.createElement("div");
    title.className = "mod-title";
    title.textContent = mod.title;
    infoDiv.appendChild(title);

    let desc = document.createElement("div");
    desc.className = "mod-desc";
    desc.textContent = mod.description || "";
    infoDiv.appendChild(desc);

    let slug = document.createElement("div");
    slug.className = "mod-slug";
    slug.textContent = mod.slug;
    slug.style.fontSize = "0.92em";
    slug.style.color = "#4fdc8e";
    infoDiv.appendChild(slug);

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
  allMods = await fetchMods(version, loader);
  shownMods = allMods;
  renderMods(shownMods);
  statusDiv.textContent = `Loaded ${allMods.length} mods.`;
}

filterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await reloadMods();
});

searchBox.addEventListener('input', filterMods);

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
      let vresp = await fetch(`${MODRINTH_API}/project/${mod.slug}/version?game_versions=["${version}"]&loaders=["${loader}"]`);
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
      // Start download
      let a = document.createElement("a");
      a.href = file.url;
      a.download = file.filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      statusDiv.textContent += `\nError downloading ${mod.title}: ${e}`;
    }
  }
  statusDiv.textContent = "All done! Check your downloads folder.";
});

window.addEventListener("DOMContentLoaded", async () => {
  await fetchVersions();
  await reloadMods();
});