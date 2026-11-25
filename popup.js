const fieldset = document.querySelector('fieldset');
const error = document.querySelector('#error');
const inputs = [...fieldset.querySelectorAll('input')];
const seconds = document.querySelector('#seconds');
const pace = document.querySelector('#pace');

function updateSeconds() {
  const duration = galactusWhipDuration(Number(pace.value)) / 1000;
  seconds.value = `${duration.toLocaleString('es', { maximumFractionDigits: 1 })} s`;
}

function showError(message, reason) {
  console.error(reason);
  error.textContent = message;
  error.hidden = false;
}

chrome.storage.local.get(GalactusSettings).then(settings => {
  for (const input of inputs) {
    if (input.type === 'checkbox') input.checked = settings[input.id];
    else input.value = settings[input.id];
    input.addEventListener('change', () => {
      const value = input.type === 'checkbox' ? input.checked : Number(input.value);
      chrome.storage.local.set({ [input.id]: value }).catch(reason => showError('No se pudo guardar el ajuste.', reason));
    });
  }
  pace.addEventListener('input', updateSeconds);
  updateSeconds();
  fieldset.disabled = false;
}).catch(reason => showError('No se pudieron cargar los ajustes.', reason));

document.querySelector('#preview').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('demo.html') })
    .catch(reason => showError('No se pudo abrir la demostración.', reason));
});
