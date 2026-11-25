importScripts('settings.js');

const menuId = 'galactus-open';
const documentUrlPatterns = chrome.runtime.getManifest().content_scripts[0].matches;

async function registerMenu() {
  await chrome.contextMenus.removeAll();
  const { enabled } = await chrome.storage.local.get({ enabled: GalactusSettings.enabled });
  chrome.contextMenus.create({
    id: menuId,
    title: 'Arrea: abrir acciones',
    contexts: ['all'],
    documentUrlPatterns,
    visible: enabled
  }, () => {
    if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
  });
}

chrome.runtime.onInstalled.addListener(() => registerMenu().catch(console.error));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) {
    chrome.contextMenus.update(menuId, {
      visible: changes.enabled.newValue ?? GalactusSettings.enabled
    }).catch(console.error);
  }
});

function openActions(info, tab) {
  if (info.menuItemId !== menuId || tab?.id === undefined) return;
  chrome.tabs.sendMessage(tab.id, { type: 'galactus-open-actions' }, { frameId: 0 })
    .catch(() => {
      // Tabs open before installation or an update need to be reloaded.
    });
}

chrome.contextMenus.onClicked.addListener(openActions);
